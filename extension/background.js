import { CONFIG } from './config.js';

chrome.runtime.onInstalled.addListener(async () => {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch {}
  const stored = await chrome.storage.local.get('ferrolNativeLovableMode');
  if (typeof stored.ferrolNativeLovableMode !== 'boolean') {
    await chrome.storage.local.set({ ferrolNativeLovableMode: true });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch {}
});

const headers = (token, json = true) => ({
  apikey: CONFIG.supabasePublishableKey,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(json ? { 'Content-Type': 'application/json' } : {}),
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

async function getFreshSession() {
  const stored = await chrome.storage.local.get('ferrolSession');
  let session = stored.ferrolSession || null;
  if (!session?.refresh_token) throw new Error('Abra o Ferrol AI e faça login primeiro.');

  const expiresAt = (session.expires_at || 0) * 1000;
  if (!expiresAt || expiresAt - Date.now() <= 60_000) {
    const data = await parseResponse(await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    }));
    session = data;
    await chrome.storage.local.set({ ferrolSession: session });
  }
  return session;
}

async function fetchProjects(session) {
  return parseResponse(await fetch(`${CONFIG.supabaseUrl}/rest/v1/projects?select=id,name,github_owner,github_repo,github_default_branch,is_active&is_active=eq.true&order=updated_at.desc`, {
    headers: headers(session.access_token, false),
  }));
}

async function selectProjectForNative(session) {
  const projects = await fetchProjects(session);
  if (!projects?.length) throw new Error('Nenhum projeto GitHub conectado ao Ferrol AI.');

  const stored = await chrome.storage.local.get(['ferrolLovableContext', 'ferrolProjectId']);
  const contextName = normalize(stored.ferrolLovableContext?.projectName || '');
  if (contextName) {
    const match = projects.find((project) => {
      const name = normalize(project.name);
      const repo = normalize(project.github_repo);
      return contextName === name || contextName === repo || contextName.includes(name) || name.includes(contextName) || contextName.includes(repo) || repo.includes(contextName);
    });
    if (match) {
      await chrome.storage.local.set({ ferrolProjectId: match.id });
      return match;
    }
  }

  const selected = projects.find((p) => p.id === stored.ferrolProjectId);
  return selected || projects[0];
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

async function sendNativePrompt(message) {
  const session = await getFreshSession();
  const project = await selectProjectForNative(session);
  const threadId = await getThread(project.id);

  const data = await parseResponse(await fetch(CONFIG.agentFunctionUrl, {
    method: 'POST',
    headers: headers(session.access_token),
    body: JSON.stringify({
      project_id: project.id,
      thread_id: threadId,
      prompt: String(message.prompt || '').trim(),
      image_data_url: message.image_data_url || null,
      source: 'lovable_native_chat',
    }),
  }));

  if (data.thread_id) await setThread(project.id, data.thread_id);
  await chrome.storage.local.set({
    ferrolProjectId: project.id,
    ferrolNativeRefresh: { projectId: project.id, ts: Date.now() },
  });

  return {
    ok: true,
    project: { id: project.id, name: project.name, repo: `${project.github_owner}/${project.github_repo}` },
    message: data.message || 'Concluído.',
    changes: data.changes || [],
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'OPEN_TAB' && message.url) {
    chrome.tabs.create({ url: message.url });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === 'OPEN_SIDE_PANEL') {
    const windowId = sender.tab?.windowId;
    if (windowId) {
      chrome.sidePanel.open({ windowId })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
  }

  if (message?.type === 'FERROL_NATIVE_SEND') {
    sendNativePrompt(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || 'Falha no agente.' }));
    return true;
  }

  return false;
});
