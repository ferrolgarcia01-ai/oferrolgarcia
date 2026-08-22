import { CONFIG } from './config.js';

const AUTH_ISOLATION_VERSION = 2;

async function clearAuthState() {
  await chrome.storage.local.remove([
    'ferrolSession',
    'ferrolLicenseInfo',
    'ferrolProjectId',
    'ferrolThreads',
    'ferrolChatCache',
  ]);
}

async function ensureAuthIsolationState() {
  const stored = await chrome.storage.local.get(['ferrolAuthIsolationVersion', 'ferrolInstallId']);
  const patch = {};
  if (!stored.ferrolInstallId) patch.ferrolInstallId = crypto.randomUUID();
  if (stored.ferrolAuthIsolationVersion !== AUTH_ISOLATION_VERSION) {
    await clearAuthState();
    patch.ferrolAuthIsolationVersion = AUTH_ISOLATION_VERSION;
  }
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
}

const isolationReady = ensureAuthIsolationState();

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await isolationReady;
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch {}
  const stored = await chrome.storage.local.get(['ferrolNativeLovableMode', 'ferrolExtensionEnabled', 'ferrolInstallId']);
  const patch = {};
  if (typeof stored.ferrolNativeLovableMode !== 'boolean') patch.ferrolNativeLovableMode = true;
  if (typeof stored.ferrolExtensionEnabled !== 'boolean') patch.ferrolExtensionEnabled = true;
  if (!stored.ferrolInstallId) patch.ferrolInstallId = crypto.randomUUID();
  if (reason === 'install') await clearAuthState();
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
});

chrome.runtime.onStartup.addListener(async () => {
  await isolationReady;
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch {}
});

const headers = (token, json = true, extra = {}) => ({
  apikey: CONFIG.supabasePublishableKey,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  ...extra,
});

async function parseResponse(res) {
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(body?.msg || body?.message || body?.error_description || body?.error || `Erro ${res.status}`);
  return body;
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\|\s*lovable/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getDeviceId() {
  await isolationReady;
  const stored = await chrome.storage.local.get(['ferrolDeviceId', 'ferrolInstallId']);
  let installId = stored.ferrolInstallId;
  if (!installId) {
    installId = crypto.randomUUID();
    await chrome.storage.local.set({ ferrolInstallId: installId });
  }
  if (stored.ferrolDeviceId) return stored.ferrolDeviceId;
  const id = `${installId}-${crypto.randomUUID()}`;
  await chrome.storage.local.set({ ferrolDeviceId: id });
  return id;
}

async function getFreshSession() {
  await isolationReady;
  const stored = await chrome.storage.local.get('ferrolSession');
  let session = stored.ferrolSession || null;
  if (!session?.refresh_token) throw new Error('Ative sua licença no FG AI primeiro.');

  const expiresAt = Number(session.expires_at || 0) * 1000;
  if (!expiresAt || expiresAt - Date.now() <= 60_000) {
    try {
      const data = await parseResponse(await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      }));
      session = data;
      await chrome.storage.local.set({ ferrolSession: session });
    } catch {
      await clearAuthState();
      throw new Error('Sua sessão expirou. Ative a chave novamente.');
    }
  }
  return session;
}

async function ensureLicense(session, deviceId) {
  try {
    const data = await parseResponse(await fetch(CONFIG.licenseStatusUrl, {
      method: 'GET',
      headers: headers(session.access_token, false, { 'x-fg-device-id': deviceId }),
    }));
    if (data?.license?.status !== 'active') throw new Error('Licença inativa.');
    return data.license;
  } catch (error) {
    if (/sessão inválida|dispositivo não autorizado|reative sua licença/i.test(String(error?.message || ''))) await clearAuthState();
    throw error;
  }
}

async function fetchProjects(session) {
  return parseResponse(await fetch(`${CONFIG.supabaseUrl}/rest/v1/projects?select=id,name,github_owner,github_repo,github_default_branch,is_active,supabase_project_ref,supabase_url&is_active=eq.true&order=updated_at.desc`, {
    headers: headers(session.access_token, false),
  }));
}

async function fetchGithubInstallations(session) {
  return parseResponse(await fetch(`${CONFIG.supabaseUrl}/rest/v1/github_installations?select=installation_id,account_login,account_type&order=updated_at.desc`, {
    headers: headers(session.access_token, false),
  }));
}

async function syncGithubNow(session) {
  return parseResponse(await fetch(CONFIG.githubSyncUrl, {
    method: 'POST',
    headers: headers(session.access_token),
    body: '{}',
  }));
}

function matchContextProject(projects, projectName) {
  const contextName = normalize(projectName || '');
  if (!contextName) return null;
  return projects.find((project) => {
    const name = normalize(project.name);
    const repo = normalize(project.github_repo);
    if (!name && !repo) return false;
    return contextName === name || contextName === repo ||
      (name && (contextName.includes(name) || name.includes(contextName))) ||
      (repo && (contextName.includes(repo) || repo.includes(contextName)));
  }) || null;
}

async function nativeContext() {
  return (await chrome.storage.local.get(['ferrolLovableContext', 'ferrolProjectId']));
}

async function resolveProjectForNative(session, { syncIfMissing = true, allowNoContext = false } = {}) {
  let projects = await fetchProjects(session);
  const stored = await nativeContext();
  const lovable = stored.ferrolLovableContext || null;
  const projectName = String(lovable?.projectName || '').trim();

  if (projectName) {
    let match = matchContextProject(projects, projectName);
    if (!match && syncIfMissing) {
      try { await syncGithubNow(session); } catch {}
      projects = await fetchProjects(session);
      match = matchContextProject(projects, projectName);
    }
    if (!match) {
      const installations = await fetchGithubInstallations(session).catch(() => []);
      const connected = Boolean(installations?.length);
      const error = new Error(connected
        ? `Projeto “${projectName}” detectado no Lovable, mas esse repositório não está autorizado no FG AI. Autorize o repo correto no GitHub e tente novamente. Nenhuma alteração foi feita.`
        : `Projeto “${projectName}” detectado no Lovable. Conecte o GitHub e autorize o repositório desse projeto antes de editar.`);
      error.code = connected ? 'PROJECT_NOT_AUTHORIZED' : 'GITHUB_NOT_CONNECTED';
      throw error;
    }
    await chrome.storage.local.set({ ferrolProjectId: match.id });
    return { project: match, projects, lovable, detected: true };
  }

  if (allowNoContext) return { project: null, projects, lovable, detected: false };
  const selected = projects.find((p) => p.id === stored.ferrolProjectId);
  if (selected) return { project: selected, projects, lovable, detected: false };
  if (projects.length === 1) {
    await chrome.storage.local.set({ ferrolProjectId: projects[0].id });
    return { project: projects[0], projects, lovable, detected: false };
  }
  if (!projects.length) throw new Error('Conecte o GitHub e autorize o repositório antes de começar.');
  throw new Error('Escolha o projeto correto no FG AI antes de enviar o comando.');
}

async function getThread(projectId) {
  const stored = await chrome.storage.local.get('ferrolThreads');
  return stored.ferrolThreads?.[projectId] || null;
}

async function setThread(projectId, threadId) {
  if (!projectId || !threadId) return;
  const stored = await chrome.storage.local.get('ferrolThreads');
  const map = stored.ferrolThreads || {};
  map[projectId] = threadId;
  await chrome.storage.local.set({ ferrolThreads: map });
}

function prepareNativePayload(message) {
  let prompt = String(message.prompt || '').trim();
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  let imageData = message.image_data_url || null;
  const textBlocks = [];
  for (const attachment of attachments.slice(0, 8)) {
    if (!imageData && attachment?.type === 'image' && String(attachment.dataUrl || '').startsWith('data:image/')) imageData = attachment.dataUrl;
    if (attachment?.type === 'text' && attachment.text) {
      textBlocks.push(`--- ARQUIVO ANEXADO: ${String(attachment.name || 'arquivo')} ---\n${String(attachment.text).slice(0, 120000)}\n--- FIM DO ARQUIVO ---`);
    }
  }
  if (textBlocks.length) prompt = `${prompt || 'Analise os arquivos anexados e faça o que for necessário.'}\n\n${textBlocks.join('\n\n')}`;
  if (!prompt && imageData) prompt = 'Analise a imagem anexada e faça a alteração pedida no projeto.';
  return { prompt, imageData, attachmentCount: attachments.length + (message.image_data_url ? 1 : 0) };
}

async function sendNativePrompt(message) {
  await isolationReady;
  const stored = await chrome.storage.local.get(['ferrolExtensionEnabled', 'ferrolNativeLovableMode']);
  if (stored.ferrolExtensionEnabled === false) throw new Error('FG AI está desativado.');
  if (stored.ferrolNativeLovableMode === false) throw new Error('Chat nativo do FG AI está desativado.');

  const session = await getFreshSession();
  const deviceId = await getDeviceId();
  await ensureLicense(session, deviceId);
  const resolved = await resolveProjectForNative(session, { syncIfMissing: true });
  const project = resolved.project;
  const threadId = await getThread(project.id);
  const prepared = prepareNativePayload(message);
  if (!prepared.prompt) throw new Error('Digite uma mensagem ou anexe uma imagem/arquivo.');

  const data = await parseResponse(await fetch(CONFIG.agentFunctionUrl, {
    method: 'POST',
    headers: headers(session.access_token, true, { 'x-fg-device-id': deviceId }),
    body: JSON.stringify({
      project_id: project.id,
      thread_id: threadId,
      prompt: prepared.prompt,
      image_data_url: prepared.imageData,
      source: 'lovable_native_chat',
    }),
  }));

  if (data.thread_id) await setThread(project.id, data.thread_id);
  await chrome.storage.local.set({ ferrolProjectId: project.id, ferrolNativeRefresh: { projectId: project.id, ts: Date.now() } });

  return {
    ok: true,
    project: { id: project.id, name: project.name, repo: `${project.github_owner}/${project.github_repo}` },
    message: data.message || 'Concluído.',
    changes: data.changes || [],
    usage: data.usage || null,
    received: data.received || { image: Boolean(prepared.imageData), attachments: prepared.attachmentCount },
  };
}

async function getContextState({ doSync = false } = {}) {
  const session = await getFreshSession();
  const deviceId = await getDeviceId();
  await ensureLicense(session, deviceId);
  if (doSync) {
    try { await syncGithubNow(session); } catch {}
  }
  const projects = await fetchProjects(session);
  const installations = await fetchGithubInstallations(session).catch(() => []);
  const stored = await nativeContext();
  const lovable = stored.ferrolLovableContext || null;
  const match = matchContextProject(projects, lovable?.projectName || '');
  if (match) await chrome.storage.local.set({ ferrolProjectId: match.id });
  const selected = match || projects.find((p) => p.id === stored.ferrolProjectId) || null;
  return {
    ok: true,
    githubConnected: Boolean(installations?.length),
    githubAccount: installations?.[0]?.account_login || null,
    context: lovable,
    detectedProject: match ? { id: match.id, name: match.name, repo: `${match.github_owner}/${match.github_repo}` } : null,
    selectedProject: selected ? { id: selected.id, name: selected.name, repo: `${selected.github_owner}/${selected.github_repo}` } : null,
    projects: projects.map((p) => ({ id: p.id, name: p.name, repo: `${p.github_owner}/${p.github_repo}`, supabase_project_ref: p.supabase_project_ref || null })),
    needsGithub: Boolean(lovable?.projectName && !match),
  };
}

async function getNativeHistory() {
  const session = await getFreshSession();
  const resolved = await resolveProjectForNative(session, { syncIfMissing: false });
  const project = resolved.project;
  const threadId = await getThread(project.id);
  if (!threadId) return { ok: true, project, thread_id: null, messages: [] };
  const messages = await parseResponse(await fetch(`${CONFIG.supabaseUrl}/rest/v1/chat_messages?select=role,content,created_at,metadata&thread_id=eq.${encodeURIComponent(threadId)}&order=created_at.asc&limit=100`, {
    headers: headers(session.access_token, false),
  }));
  return { ok: true, project: { id: project.id, name: project.name, repo: `${project.github_owner}/${project.github_repo}` }, thread_id: threadId, messages: (messages || []).filter((m) => ['user','assistant'].includes(m.role)) };
}

async function clearNativeHistory() {
  const session = await getFreshSession();
  const resolved = await resolveProjectForNative(session, { syncIfMissing: false });
  const project = resolved.project;
  await parseResponse(await fetch(CONFIG.historyClearUrl, {
    method: 'POST', headers: headers(session.access_token), body: JSON.stringify({ project_id: project.id }),
  }));
  const stored = await chrome.storage.local.get(['ferrolThreads', 'ferrolChatCache']);
  const threads = stored.ferrolThreads || {};
  const cache = stored.ferrolChatCache || {};
  delete threads[project.id];
  delete cache[project.id];
  await chrome.storage.local.set({ ferrolThreads: threads, ferrolChatCache: cache, ferrolNativeRefresh: { projectId: project.id, ts: Date.now() } });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'OPEN_TAB' && message.url) {
    chrome.tabs.create({ url: message.url });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === 'FG_LOGOUT') {
    clearAuthState().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'OPEN_SIDE_PANEL') {
    const open = async () => {
      await isolationReady;
      if (message.view && message.view !== 'chat') await chrome.storage.local.set({ ferrolSidepanelView: message.view });
      const windowId = sender.tab?.windowId;
      if (!windowId) throw new Error('Janela ativa não encontrada.');
      await chrome.sidePanel.open({ windowId });
      return { ok: true };
    };
    open().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'FERROL_NATIVE_SEND') {
    sendNativePrompt(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || 'Falha no agente.', code: error.code || null }));
    return true;
  }

  if (message?.type === 'FG_CONTEXT_STATE') {
    getContextState({ doSync: Boolean(message.sync) }).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'FG_GET_HISTORY') {
    getNativeHistory().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'FG_CLEAR_HISTORY') {
    clearNativeHistory().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});