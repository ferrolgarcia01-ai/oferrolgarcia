import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    const auth = req.headers.get('Authorization') || '';
    const accessToken = auth.replace(/^Bearer\s+/i, '');
    if (!accessToken) return json({ error: 'Sessão ausente.' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const publishable = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const client = createClient(url, publishable, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userError } = await client.auth.getUser(accessToken);
    if (userError || !userData.user) return json({ error: 'Sessão inválida.' }, 401);

    const state = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
    const { error } = await client.rpc('create_github_installation_link_state', { p_state: state });
    if (error) throw new Error(error.message);

    return json({
      install_url: `https://github.com/apps/ferrol-ai-developer/installations/new?state=${encodeURIComponent(state)}`,
      state,
    });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || 'Falha ao iniciar conexão com GitHub.' }, 500);
  }
});
