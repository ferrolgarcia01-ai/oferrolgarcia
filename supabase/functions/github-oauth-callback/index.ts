import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import jwt from 'npm:jsonwebtoken@9.0.2';

const GH_ACCEPT = 'application/vnd.github+json';
const UA = 'Ferrol-AI-Developer';

function appJwt() {
  const appId = Deno.env.get('GITHUB_APP_ID');
  const raw = Deno.env.get('GITHUB_APP_PRIVATE_KEY');
  if (!appId || !raw) throw new Error('GitHub App não configurado no servidor.');
  const pem = raw.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iat: now - 30, exp: now + 540, iss: appId }, pem, { algorithm: 'RS256' });
}

async function getAppClientId() {
  const res = await fetch('https://api.github.com/app', {
    headers: {
      Authorization: `Bearer ${appJwt()}`,
      Accept: GH_ACCEPT,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': UA,
    },
  });
  const data = await res.json();
  if (!res.ok || !data?.client_id) throw new Error(data?.message || 'Não foi possível obter o Client ID do GitHub App.');
  return String(data.client_id);
}

const apiHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: GH_ACCEPT,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': UA,
});

async function github(token: string, path: string) {
  const res = await fetch(`https://api.github.com${path}`, { headers: apiHeaders(token) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `GitHub ${res.status}`);
  return data;
}

async function exchangeCode(code: string) {
  const clientId = await getAppClientId();
  const clientSecret = Deno.env.get('GITHUB_APP_CLIENT_SECRET');
  if (!clientSecret) throw new Error('OAuth do GitHub App ainda não configurado no servidor.');
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const data = await res.json();
  if (!res.ok || !data?.access_token) throw new Error(data?.error_description || data?.error || 'Não foi possível autorizar sua conta GitHub.');
  return data.access_token as string;
}

async function listInstallations(userToken: string) {
  const all: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await github(userToken, `/user/installations?per_page=100&page=${page}`);
    const items = data.installations || [];
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

async function listRepos(userToken: string, installationId: number) {
  const all: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await github(userToken, `/user/installations/${installationId}/repositories?per_page=100&page=${page}`);
    const items = data.repositories || [];
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

function esc(value: string) {
  return value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c));
}

function page(title: string, message: string, ok: boolean, status = 200) {
  const safeTitle = esc(title);
  const safeMessage = esc(message);
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>body{font-family:system-ui;background:#070708;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}.card{width:min(580px,calc(100% - 40px));box-sizing:border-box;background:#141416;border:1px solid #29292d;border-radius:24px;padding:34px;text-align:center}.icon{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;margin:0 auto 18px;background:${ok ? '#163d28' : '#4a1d1d'};font-size:30px}.muted{color:#a1a1aa;line-height:1.55}.small{font-size:13px;color:#71717a;margin-top:18px}</style></head><body><div class="card"><div class="icon">${ok ? '✓' : '!'}</div><h1>${safeTitle}</h1><p class="muted">${safeMessage}</p><p class="small">Pode fechar esta guia e voltar para a extensão. Clique em Atualizar.</p></div></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = String(url.searchParams.get('code') || '');
    const state = String(url.searchParams.get('state') || '');
    if (!code || state.length < 32) return page('Autorização inválida', 'O código ou estado de segurança não foi retornado pelo GitHub.', false, 400);

    const userToken = await exchangeCode(code);
    const githubUser = await github(userToken, '/user');
    const installations = await listInstallations(userToken);
    if (!installations.length) return page('GitHub autorizado', 'Sua identidade foi autorizada, mas nenhuma instalação do Ferrol AI Developer ficou disponível. Instale o App em pelo menos um repositório.', false, 409);

    const mapped: any[] = [];
    for (const installation of installations) {
      const repos = await listRepos(userToken, Number(installation.id));
      mapped.push({
        installation_id: Number(installation.id),
        account_login: installation.account?.login || '',
        account_type: installation.account?.type || '',
        repositories: repos.map((r: any) => ({ name: r.name, owner: r.owner?.login || installation.account?.login || '', default_branch: r.default_branch || 'main' })),
      });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await admin.rpc('complete_github_oauth_link', {
      p_state: state,
      p_github_user_id: Number(githubUser.id),
      p_github_login: githubUser.login || '',
      p_installations: mapped,
    });
    if (error) throw new Error(error.message);

    const repoCount = mapped.reduce((sum, item) => sum + item.repositories.length, 0);
    return page('GitHub conectado', `${mapped.length} instalação(ões) e ${repoCount} repositório(s) foram vinculados com verificação da sua identidade GitHub.`, true);
  } catch (e: any) {
    console.error(e);
    return page('Não foi possível conectar', e?.message || 'Erro inesperado no OAuth do GitHub.', false, 500);
  }
});
