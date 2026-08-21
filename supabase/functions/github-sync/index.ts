import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import jwt from 'npm:jsonwebtoken@9.0.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function appJwt() {
  const appId = Deno.env.get('GITHUB_APP_ID');
  const raw = Deno.env.get('GITHUB_APP_PRIVATE_KEY');
  if (!appId || !raw) throw new Error('GitHub App não configurado.');
  const pem = raw.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iat: now - 30, exp: now + 540, iss: appId }, pem, { algorithm: 'RS256' });
}

async function installationToken(id: number) {
  const res = await fetch(`https://api.github.com/app/installations/${id}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appJwt()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Ferrol-AI-Developer',
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `GitHub ${res.status}`);
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
    const items = data.repositories || [];
    repos.push(...items);
    if (items.length < 100) break;
  }
  return repos;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    const auth = req.headers.get('Authorization') || '';
    const accessToken = auth.replace(/^Bearer\s+/i, '');
    if (!accessToken) return json({ error: 'Sessão ausente.' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const publishable = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData.user) return json({ error: 'Sessão inválida.' }, 401);
    const userId = userData.user.id;

    const { data: installations, error: installError } = await admin
      .from('github_installations')
      .select('installation_id,account_login,account_type')
      .eq('user_id', userId);
    if (installError) throw new Error(installError.message);
    if (!installations?.length) return json({ synced: 0, repositories: 0 });

    let repoCount = 0;
    for (const installation of installations) {
      const installationId = Number(installation.installation_id);
      const token = await installationToken(installationId);
      const repos = await listRepos(token);
      repoCount += repos.length;
      const now = new Date().toISOString();

      const { error: deactivateError } = await admin
        .from('projects')
        .update({ is_active: false, last_synced_at: now, updated_at: now })
        .eq('user_id', userId)
        .eq('github_installation_id', installationId);
      if (deactivateError) throw new Error(deactivateError.message);

      for (const repo of repos) {
        const row = {
          user_id: userId,
          name: repo.name,
          github_owner: repo.owner?.login || installation.account_login || '',
          github_repo: repo.name,
          github_default_branch: repo.default_branch || 'main',
          github_installation_id: installationId,
          is_active: true,
          last_synced_at: now,
          updated_at: now,
        };
        const { error: upsertError } = await admin
          .from('projects')
          .upsert(row, { onConflict: 'user_id,github_owner,github_repo' });
        if (upsertError) throw new Error(upsertError.message);
      }

      await admin
        .from('github_installations')
        .update({ updated_at: now })
        .eq('installation_id', installationId)
        .eq('user_id', userId);
    }

    return json({ synced: installations.length, repositories: repoCount });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || 'Falha ao sincronizar GitHub.' }, 500);
  }
});
