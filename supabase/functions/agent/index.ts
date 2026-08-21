import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { SignJWT, importPKCS8 } from 'npm:jose@6.1.0';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
});

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };

function b64(content: string) {
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromB64(content: string) {
  const binary = atob(content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubAppJwt() {
  const appId = Deno.env.get('GITHUB_APP_ID');
  const pemRaw = Deno.env.get('GITHUB_APP_PRIVATE_KEY');
  if (!appId || !pemRaw) throw new Error('GitHub App ainda não configurado no servidor.');
  const pem = pemRaw.replace(/\\n/g, '\n');
  const key = await importPKCS8(pem, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(appId)
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 540)
    .sign(key);
}

async function installationToken(installationId: number) {
  const jwt = await githubAppJwt();
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Ferrol-AI-Developer',
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Não foi possível autorizar o GitHub.');
  return data.token as string;
}

async function gh(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Ferrol-AI-Developer',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err: any = new Error(data?.message || `GitHub retornou ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function runTool(token: string, project: any, name: string, args: any) {
  const owner = encodeURIComponent(project.github_owner);
  const repo = encodeURIComponent(project.github_repo);
  const branch = project.github_default_branch || 'main';

  if (name === 'list_files') {
    const tree = await gh(token, `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    return (tree.tree || [])
      .filter((x: any) => x.type === 'blob')
      .slice(0, 1200)
      .map((x: any) => ({ path: x.path, size: x.size }));
  }

  if (name === 'read_file') {
    const path = String(args.path || '').replace(/^\/+/, '');
    const file = await gh(token, `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);
    if (file.type !== 'file') throw new Error('O caminho não aponta para um arquivo.');
    if ((file.size || 0) > 400_000) throw new Error('Arquivo grande demais para leitura direta.');
    return { path, sha: file.sha, content: fromB64(file.content || '') };
  }

  if (name === 'write_file') {
    const path = String(args.path || '').replace(/^\/+/, '');
    if (!path) throw new Error('Caminho inválido.');
    let sha: string | undefined;
    try {
      const current = await gh(token, `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);
      sha = current.sha;
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }
    const body: any = {
      message: String(args.message || `feat: update ${path}`).slice(0, 160),
      content: b64(String(args.content ?? '')),
      branch,
    };
    if (sha) body.sha = sha;
    const result = await gh(token, `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { path, commit_sha: result.commit?.sha, content_sha: result.content?.sha, action: sha ? 'updated' : 'created' };
  }

  if (name === 'delete_file') {
    const path = String(args.path || '').replace(/^\/+/, '');
    const current = await gh(token, `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);
    const result = await gh(token, `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        message: String(args.message || `chore: remove ${path}`).slice(0, 160), sha: current.sha, branch
      })
    });
    return { path, commit_sha: result.commit?.sha, action: 'deleted' };
  }

  throw new Error(`Ferramenta desconhecida: ${name}`);
}

const tools = [
  {
    type: 'function', name: 'list_files',
    description: 'Lista os arquivos do repositório atual. Use antes de assumir nomes ou estrutura.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }, strict: true,
  },
  {
    type: 'function', name: 'read_file',
    description: 'Lê o conteúdo UTF-8 de um arquivo do repositório atual.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false }, strict: true,
  },
  {
    type: 'function', name: 'write_file',
    description: 'Cria ou substitui um arquivo no repositório atual e faz commit. Preserve o restante do arquivo quando editar.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' }, message: { type: 'string' } },
      required: ['path', 'content', 'message'], additionalProperties: false
    }, strict: true,
  },
  {
    type: 'function', name: 'delete_file',
    description: 'Exclui um arquivo do repositório atual. Só use quando realmente necessário.',
    parameters: {
      type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } },
      required: ['path', 'message'], additionalProperties: false
    }, strict: true,
  },
];

async function callOpenAI(body: any) {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('OpenAI API ainda não configurada no servidor.');
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Erro ao consultar a IA.');
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const auth = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const admin = createClient(supabaseUrl, serviceKey);

    const token = auth.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: 'Sessão inválida.' }, 401);
    const userId = userData.user.id;

    const payload = await req.json();
    const projectId = String(payload.project_id || '');
    const prompt = String(payload.prompt || '').trim();
    if (!projectId || !prompt) return json({ error: 'Projeto e pedido são obrigatórios.' }, 400);

    const { data: subscription } = await admin
      .from('subscriptions').select('status,current_period_end').eq('user_id', userId).maybeSingle();
    const periodOk = !subscription?.current_period_end || new Date(subscription.current_period_end).getTime() > Date.now();
    if (subscription?.status !== 'active' || !periodOk) return json({ error: 'Assinatura mensal inativa.' }, 402);

    const { data: project, error: projectError } = await admin
      .from('projects').select('*').eq('id', projectId).eq('user_id', userId).single();
    if (projectError || !project) return json({ error: 'Projeto não encontrado.' }, 404);

    let installationId = project.github_installation_id;
    if (!installationId) {
      const { data: install } = await admin.from('github_installations')
        .select('installation_id').eq('user_id', userId).limit(1).maybeSingle();
      installationId = install?.installation_id;
    }
    if (!installationId) return json({ error: 'Conecte o GitHub antes de usar o agente.' }, 409);

    const ghToken = await installationToken(Number(installationId));
    const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-terra';
    const instruction = `Você é o Ferrol AI Developer, um agente de programação que trabalha DIRETAMENTE no GitHub do cliente.\n\nRegras:\n- Trabalhe somente no repositório já selecionado.\n- Use list_files e read_file para entender a estrutura antes de alterar.\n- Faça alterações completas e funcionais, não apenas explique código.\n- Preserve a stack existente e evite dependências desnecessárias.\n- Nunca invente conteúdo de arquivo: leia antes de editar um arquivo existente.\n- Faça commits pequenos e descritivos.\n- Não exponha tokens, segredos ou chaves.\n- Ao terminar, responda em português com resumo curto dos arquivos alterados e o que o usuário deve verificar no preview (Lovable/Vercel).`;

    const content: any[] = [{ type: 'input_text', text: prompt }];
    if (payload.image_data_url && String(payload.image_data_url).startsWith('data:image/')) {
      content.push({ type: 'input_image', image_url: payload.image_data_url, detail: 'auto' });
    }

    let response = await callOpenAI({
      model,
      reasoning: { effort: 'medium' },
      instructions: instruction,
      input: [{ role: 'user', content }],
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      max_output_tokens: 12000,
    });

    let rounds = 0;
    while (rounds++ < 20) {
      const calls = (response.output || []).filter((item: any) => item.type === 'function_call');
      if (!calls.length) break;
      const outputs = [];
      for (const call of calls) {
        let args: any = {};
        try { args = JSON.parse(call.arguments || '{}'); } catch {}
        try {
          const result = await runTool(ghToken, project, call.name, args);
          outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ ok: true, result }) });
        } catch (e: any) {
          outputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ ok: false, error: e.message }) });
        }
      }
      response = await callOpenAI({
        model,
        reasoning: { effort: 'medium' },
        instructions: instruction,
        previous_response_id: response.id,
        input: outputs,
        tools,
        tool_choice: 'auto',
        parallel_tool_calls: false,
        max_output_tokens: 12000,
      });
    }

    const inputTokens = Number(response.usage?.input_tokens || 0);
    const outputTokens = Number(response.usage?.output_tokens || 0);
    const prices = model.includes('luna') ? [0.2, 1.2] : model.includes('terra') ? [2, 12] : [5, 30];
    const estimated = (inputTokens / 1_000_000) * prices[0] + (outputTokens / 1_000_000) * prices[1];
    await admin.from('usage_events').insert({
      user_id: userId, project_id: project.id, model,
      input_tokens: inputTokens, output_tokens: outputTokens,
      estimated_cost_usd: estimated, action: 'agent_run'
    });

    const message = response.output_text || 'Alterações processadas. Verifique o preview do projeto.';
    return new Response(JSON.stringify({ message, usage: { model, input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: estimated } }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e?.message || 'Erro interno.' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
