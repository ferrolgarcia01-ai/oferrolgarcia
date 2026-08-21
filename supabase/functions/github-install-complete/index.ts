import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import jwt from 'npm:jsonwebtoken@9.0.2';

function appJwt() {
  const appId = Deno.env.get('GITHUB_APP_ID');
  const raw = Deno.env.get('GITHUB_APP_PRIVATE_KEY');
  if (!appId || !raw) throw new Error('GitHub App não configurado.');
  const pem = raw.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iat: now - 30, exp: now + 540, iss: appId }, pem, { algorithm: 'RS256' });
}

async function ghApp(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${appJwt()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Ferrol-AI-Developer',
      ...(init.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `GitHub ${res.status}`);
  return data;
}

async function installationToken(id: number) {
  const data = await ghApp(`/app/installations/${id}/access_tokens`, { method: 'POST' });
  return data.token as string;
}

async function listRepos(token: string) {
  const repos: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`https://api.github.com/installation/repositories?per_page=100&page=${page}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Ferrol-AI-Developer',
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || `GitHub ${res.status}`);
    repos.push(...(data.repositories || []));
    if ((data.repositories || []).length < 100) break;
  }
  return repos;
}

function page(title: string, message: string, ok: boolean, status = 200) {
  const icon = ok ? '✓' : '!';
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui;background:#070708;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}.card{width:min(560px,calc(100% - 40px));box-sizing:border-box;background:#141416;border:1px solid #29292d;border-radius:24px;padding:34px;text-align:center}.icon{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;margin:0 auto 18px;background:${ok ? '#163d28' : '#4a1d1d'};font-size:30px}.muted{color:#a1a1aa;line-height:1.55}.small{font-size:13px;color:#71717a;margin-top:18px}</style></head><body><div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p class="muted">${message}</p><p class="small">Você pode fechar esta guia e voltar para a extensão.</p></div></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const installationId = Number(u.searchParams.get('installation_id') || '');
    const state = String(u.searchParams.get('state') || '');
    if (!Number.isSafeInteger(installationId) || installationId <= 0) return page('Conexão incompleta', 'O GitHub não informou uma instalação válida.', false, 400);
    if (state.length < 32) return page('Conexão incompleta', 'O estado de segurança expirou ou não foi retornado. Abra a extensão e clique em Conectar GitHub novamente.', false, 400);

    const installation = await ghApp(`/app/installations/${installationId}`);
    const token = await installationToken(installationId);
    const repos = await listRepos(token);
    const mapped = repos.map((r: any) => ({
      name: r.name,
      owner: r.owner?.login || installation.account?.login || '',
      default_branch: r.default_branch || 'main',
    }));

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await admin.rpc('complete_github_installation_link', {
      p_state: state,
      p_installation_id: installationId,
      p_account_login: installation.account?.login || '',
      p_account_type: installation.account?.type || '',
      p_repositories: mapped,
    });
    if (error) throw new Error(error.message);

    return page('GitHub conectado', `${mapped.length} repositório(s) autorizado(s) foram sincronizados com o Ferrol AI Developer.`, true);
  } catch (e: any) {
    console.error(e);
    return page('Não foi possível conectar', e?.message || 'Erro inesperado na conexão com GitHub.', false, 500);
  }
});
