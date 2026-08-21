import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import jwt from 'npm:jsonwebtoken@9.0.2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function appJwt() {
  const appId = Deno.env.get('GITHUB_APP_ID');
  const raw = Deno.env.get('GITHUB_APP_PRIVATE_KEY');
  if (!appId || !raw) throw new Error('GitHub App não configurado no servidor.');
  const pem = raw.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iat: now - 30, exp: now + 540, iss: appId }, pem, { algorithm: 'RS256' });
}

async function installationToken(installationId: number) {
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${appJwt()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Ferrol-AI-Developer' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Falha ao autorizar GitHub.');
  return data.token as string;
}

async function gh(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Ferrol-AI-Developer', ...(init.headers || {}) },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) { const error: any = new Error(data?.message || `GitHub ${res.status}`); error.status = res.status; throw error; }
  return data;
}

function toB64(content: string) {
  const bytes = new TextEncoder().encode(content); let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function fromB64(content: string) {
  const binary = atob(content.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}

async function toolRun(token: string, project: any, name: string, args: any) {
  const owner = encodeURIComponent(project.github_owner);
  const repo = encodeURIComponent(project.github_repo);
  const branch = project.github_default_branch || 'main';
  const encodedPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

  if (name === 'list_files') {
    const tree = await gh(token, `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    return (tree.tree || []).filter((x: any) => x.type === 'blob').slice(0, 1800).map((x: any) => ({ path: x.path, size: x.size }));
  }
  if (name === 'read_file') {
    const path = String(args.path || '').replace(/^\/+/, '');
    const file = await gh(token, `/repos/${owner}/${repo}/contents/${encodedPath(path)}?ref=${encodeURIComponent(branch)}`);
    if (file.type !== 'file') throw new Error('Caminho não é arquivo.');
    if ((file.size || 0) > 600000) throw new Error('Arquivo grande demais para leitura direta.');
    return { path, sha: file.sha, content: fromB64(file.content || '') };
  }
  if (name === 'write_file') {
    const path = String(args.path || '').replace(/^\/+/, '');
    if (!path) throw new Error('Caminho inválido.');
    let sha: string | undefined;
    try { const current = await gh(token, `/repos/${owner}/${repo}/contents/${encodedPath(path)}?ref=${encodeURIComponent(branch)}`); sha = current.sha; }
    catch (e: any) { if (e.status !== 404) throw e; }
    const body: any = { message: String(args.message || `feat: update ${path}`).slice(0, 160), content: toB64(String(args.content ?? '')), branch };
    if (sha) body.sha = sha;
    const result = await gh(token, `/repos/${owner}/${repo}/contents/${encodedPath(path)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { path, action: sha ? 'updated' : 'created', commit_sha: result.commit?.sha };
  }
  if (name === 'delete_file') {
    const path = String(args.path || '').replace(/^\/+/, '');
    const current = await gh(token, `/repos/${owner}/${repo}/contents/${encodedPath(path)}?ref=${encodeURIComponent(branch)}`);
    const result = await gh(token, `/repos/${owner}/${repo}/contents/${encodedPath(path)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: String(args.message || `chore: remove ${path}`).slice(0, 160), sha: current.sha, branch }) });
    return { path, action: 'deleted', commit_sha: result.commit?.sha };
  }
  throw new Error(`Ferramenta desconhecida: ${name}`);
}

const tools = [
  { type: 'function', name: 'list_files', description: 'Lista arquivos do repositório atual. Use para entender a estrutura.', parameters: { type: 'object', properties: {}, additionalProperties: false }, strict: true },
  { type: 'function', name: 'read_file', description: 'Lê um arquivo UTF-8 do repositório atual.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false }, strict: true },
  { type: 'function', name: 'write_file', description: 'Cria ou substitui um arquivo e faz commit.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, message: { type: 'string' } }, required: ['path', 'content', 'message'], additionalProperties: false }, strict: true },
  { type: 'function', name: 'delete_file', description: 'Exclui um arquivo e faz commit. Use somente quando necessário.', parameters: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } }, required: ['path', 'message'], additionalProperties: false }, strict: true },
];

async function openai(body: any) {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY não configurada no backend.');
  const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI ${res.status}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    const auth = req.headers.get('Authorization') || '';
    const accessToken = auth.replace(/^Bearer\s+/i, '');
    const url = Deno.env.get('SUPABASE_URL')!;
    const publishable = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } } });
    const admin = createClient(url, service);
    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData.user) return json({ error: 'Sessão inválida.' }, 401);
    const userId = userData.user.id;

    const payload = await req.json();
    const projectId = String(payload.project_id || '');
    const prompt = String(payload.prompt || '').trim();
    if (!projectId || !prompt) return json({ error: 'Projeto e pedido são obrigatórios.' }, 400);

    const { data: subscription } = await admin.from('subscriptions').select('status,current_period_end').eq('user_id', userId).maybeSingle();
    const validPeriod = !subscription?.current_period_end || new Date(subscription.current_period_end).getTime() > Date.now();
    if (subscription?.status !== 'active' || !validPeriod) return json({ error: 'Assinatura mensal inativa.' }, 402);

    const { data: project, error: projectError } = await admin.from('projects').select('*').eq('id', projectId).eq('user_id', userId).single();
    if (projectError || !project) return json({ error: 'Projeto não encontrado.' }, 404);
    const installationId = project.github_installation_id;
    if (!installationId) return json({ error: 'Reconecte o GitHub para este projeto.' }, 409);

    const ghToken = await installationToken(Number(installationId));
    const allowed = await gh(ghToken, '/installation/repositories?per_page=100');
    const fullName = `${project.github_owner}/${project.github_repo}`.toLowerCase();
    if (!(allowed.repositories || []).some((r: any) => String(r.full_name).toLowerCase() === fullName)) return json({ error: 'Este repositório não está autorizado no GitHub App.' }, 403);

    let threadId = String(payload.thread_id || '');
    let history: any[] = [];
    if (threadId) {
      const { data: thread } = await admin.from('chat_threads').select('id').eq('id', threadId).eq('user_id', userId).eq('project_id', projectId).maybeSingle();
      if (!thread) threadId = '';
    }
    if (!threadId) {
      const { data: thread, error } = await admin.from('chat_threads').insert({ user_id: userId, project_id: projectId, title: prompt.slice(0, 80) || 'Novo chat' }).select('id').single();
      if (error) throw error;
      threadId = thread.id;
    } else {
      const { data } = await admin.from('chat_messages').select('role,content,created_at').eq('thread_id', threadId).eq('user_id', userId).in('role', ['user', 'assistant']).order('created_at', { ascending: false }).limit(16);
      history = (data || []).reverse();
    }

    await admin.from('chat_messages').insert({ user_id: userId, thread_id: threadId, role: 'user', content: prompt, metadata: payload.image_data_url ? { has_image: true } : {} });

    const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-terra';
    const instructions = `Você é o Ferrol AI Developer, agente de programação que trabalha diretamente no GitHub do cliente.\n- Trabalhe somente no repositório selecionado.\n- Antes de editar, liste e leia os arquivos necessários.\n- Faça a alteração de verdade usando as ferramentas; não entregue apenas instruções.\n- Preserve stack, estilo e comportamento existentes.\n- Se o projeto estiver vazio, crie a estrutura completa necessária.\n- Nunca exponha credenciais, chaves ou tokens.\n- Evite dependências desnecessárias.\n- Faça commits descritivos.\n- Ao terminar, responda em português com resumo objetivo dos arquivos alterados e o que verificar no preview Lovable/Vercel.`;

    const input: any[] = history.map((m: any) => ({ role: m.role, content: [{ type: 'input_text', text: String(m.content || '') }] }));
    const currentContent: any[] = [{ type: 'input_text', text: prompt }];
    if (payload.image_data_url && String(payload.image_data_url).startsWith('data:image/')) currentContent.push({ type: 'input_image', image_url: payload.image_data_url, detail: 'auto' });
    input.push({ role: 'user', content: currentContent });

    let totalInput = 0, totalOutput = 0;
    const addUsage = (r: any) => { totalInput += Number(r.usage?.input_tokens || 0); totalOutput += Number(r.usage?.output_tokens || 0); };
    let response = await openai({ model, reasoning: { effort: 'medium' }, instructions, input, tools, tool_choice: 'auto', parallel_tool_calls: false, max_output_tokens: 12000 });
    addUsage(response);

    let rounds = 0;
    while (rounds++ < 20) {
      const calls = (response.output || []).filter((x: any) => x.type === 'function_call');
      if (!calls.length) break;
      const outputs: any[] = [];
      for (const call of calls) {
        let args: any = {}; try { args = JSON.parse(call.arguments || '{}'); } catch {}
        try { const result = await toolRun(ghToken, project, call.name, args); outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ ok: true, result }) }); }
        catch (e: any) { outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ ok: false, error: e.message }) }); }
      }
      response = await openai({ model, reasoning: { effort: 'medium' }, instructions, previous_response_id: response.id, input: outputs, tools, tool_choice: 'auto', parallel_tool_calls: false, max_output_tokens: 12000 });
      addUsage(response);
    }

    const message = response.output_text || 'Alterações processadas. Verifique o preview.';
    const price = model.includes('luna') ? [0.20, 1.20] : model.includes('terra') ? [2.00, 12.00] : [5.00, 30.00];
    const estimated = totalInput / 1e6 * price[0] + totalOutput / 1e6 * price[1];
    await admin.from('usage_events').insert({ user_id: userId, project_id: project.id, model, input_tokens: totalInput, output_tokens: totalOutput, estimated_cost_usd: estimated, action: 'agent_run' });
    await admin.from('chat_messages').insert({ user_id: userId, thread_id: threadId, role: 'assistant', content: message, metadata: { model, input_tokens: totalInput, output_tokens: totalOutput, estimated_cost_usd: estimated } });
    await admin.from('chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId).eq('user_id', userId);

    return json({ message, thread_id: threadId, usage: { model, input_tokens: totalInput, output_tokens: totalOutput, estimated_cost_usd: estimated } });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || 'Erro interno.' }, 500);
  }
});
