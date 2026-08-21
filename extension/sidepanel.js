import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const state = {
  session: null,
  projects: [],
  subscriptionActive: false,
  githubConnected: false,
  context: null,
  attachment: null,
  sending: false,
  micRecording: false,
  recordingStartedAt: 0,
  audioTimerInterval: null,
  nativeMode: true,
  supabaseAccount: null,
};

const authView = $('authView');
const workspaceView = $('workspaceView');
const subscriptionBadge = $('subscriptionBadge');
const authError = $('authError');
const projectSelect = $('projectSelect');
const projectContextDot = $('projectContextDot');
const contextBar = $('contextBar');
const contextText = $('contextText');
const chat = $('chat');
const composer = $('composer');
const promptEl = $('prompt');
const sendBtn = $('sendBtn');
const composerHint = $('composerHint');
const imageInput = $('imageInput');
const imageAttachment = $('imageAttachment');
const imageThumb = $('imageThumb');
const imageName = $('imageName');
const micBtn = $('micBtn');
const audioState = $('audioState');
const audioStateText = $('audioStateText');
const audioTimer = $('audioTimer');
const settingsPanel = $('settingsPanel');
const githubStatus = $('githubStatus');
const githubBadge = $('githubBadge');
const supabaseBadge = $('supabaseBadge');
const supabaseStatus = $('supabaseStatus');
const supabaseProjectPickerWrap = $('supabaseProjectPickerWrap');
const supabaseProjectSelect = $('supabaseProjectSelect');
const nativeModeToggle = $('nativeModeToggle');

const headers = (token, json = true) => ({
  apikey: CONFIG.supabasePublishableKey,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

async function parseResponse(res) {
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const error = new Error(body?.msg || body?.message || body?.error_description || body?.error || `Erro ${res.status}`);
    error.data = body;
    error.status = res.status;
    throw error;
  }
  return body;
}

async function api(path, options = {}) {
  return parseResponse(await fetch(`${CONFIG.supabaseUrl}${path}`, options));
}

async function callUrl(url, options = {}) {
  return parseResponse(await fetch(url, options));
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\|\s*lovable/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function saveSession(session) {
  state.session = session;
  await chrome.storage.local.set({ ferrolSession: session });
}

async function clearSession() {
  state.session = null;
  state.projects = [];
  await chrome.storage.local.remove(['ferrolSession', 'ferrolProjectId', 'ferrolThreads', 'ferrolChatCache']);
  showAuth();
}

async function refreshSessionIfNeeded() {
  if (!state.session?.refresh_token) return false;
  const expiresAt = (state.session.expires_at || 0) * 1000;
  if (expiresAt && expiresAt - Date.now() > 60_000) return true;
  try {
    const data = await api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: state.session.refresh_token }),
    });
    await saveSession(data);
    return true;
  } catch {
    await clearSession();
    return false;
  }
}

function showAuth() {
  workspaceView.classList.add('hidden');
  authView.classList.remove('hidden');
  subscriptionBadge.textContent = 'Login';
  subscriptionBadge.className = 'status-chip muted';
}

function showWorkspace() {
  authView.classList.add('hidden');
  workspaceView.classList.remove('hidden');
}

async function login(email, password) {
  const data = await api('/auth/v1/token?grant_type=password', {
    method: 'POST', headers: headers(), body: JSON.stringify({ email, password }),
  });
  await saveSession(data);
  await bootWorkspace();
}

async function signup(email, password) {
  const data = await api('/auth/v1/signup', {
    method: 'POST', headers: headers(), body: JSON.stringify({ email, password }),
  });
  if (data.access_token) {
    await saveSession(data);
    await bootWorkspace();
  } else {
    authError.textContent = 'Conta criada. Confirme seu e-mail e depois entre.';
  }
}

async function fetchSubscription() {
  const rows = await api('/rest/v1/subscriptions?select=status,current_period_end&limit=1', {
    headers: headers(state.session.access_token, false),
  });
  const sub = rows?.[0];
  state.subscriptionActive = sub?.status === 'active' && (!sub.current_period_end || new Date(sub.current_period_end) > new Date());
  subscriptionBadge.textContent = state.subscriptionActive ? 'Ativa' : 'Inativa';
  subscriptionBadge.className = `status-chip ${state.subscriptionActive ? 'active' : 'muted'}`;
}

async function fetchGithubState() {
  const rows = await api('/rest/v1/github_installations?select=installation_id,account_login&order=updated_at.desc&limit=1', {
    headers: headers(state.session.access_token, false),
  });
  const item = rows?.[0];
  state.githubConnected = Boolean(item);
  githubStatus.textContent = item ? item.account_login || 'Conectado' : 'Não conectado';
  githubBadge.textContent = item ? 'Conectado' : 'Desconectado';
  githubBadge.className = `small-status ${item ? 'on' : ''}`;
}

async function fetchProjects() {
  state.projects = await api('/rest/v1/projects?select=id,name,github_owner,github_repo,github_default_branch,supabase_project_ref,supabase_url,updated_at&is_active=eq.true&order=updated_at.desc', {
    headers: headers(state.session.access_token, false),
  });
  const stored = await chrome.storage.local.get('ferrolProjectId');
  projectSelect.innerHTML = '';
  if (!state.projects.length) {
    projectSelect.innerHTML = `<option value="">${state.githubConnected ? 'Nenhum repositório autorizado' : 'Conecte o GitHub'}</option>`;
    return;
  }
  for (const project of state.projects) {
    const opt = document.createElement('option');
    opt.value = project.id;
    opt.textContent = `${project.name} · ${project.github_owner}/${project.github_repo}`;
    if (stored.ferrolProjectId === project.id) opt.selected = true;
    projectSelect.appendChild(opt);
  }
  if (!projectSelect.value) projectSelect.value = state.projects[0].id;
  await chrome.storage.local.set({ ferrolProjectId: projectSelect.value });
}

function selectedProject() {
  return state.projects.find((p) => p.id === projectSelect.value) || null;
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

async function clearThread(projectId) {
  const stored = await chrome.storage.local.get(['ferrolThreads', 'ferrolChatCache']);
  const threads = stored.ferrolThreads || {};
  const cache = stored.ferrolChatCache || {};
  delete threads[projectId];
  delete cache[projectId];
  await chrome.storage.local.set({ ferrolThreads: threads, ferrolChatCache: cache });
}

async function cacheMessage(projectId, role, content) {
  const stored = await chrome.storage.local.get('ferrolChatCache');
  const cache = stored.ferrolChatCache || {};
  const rows = cache[projectId] || [];
  rows.push({ role, content, created_at: new Date().toISOString() });
  cache[projectId] = rows.slice(-80);
  await chrome.storage.local.set({ ferrolChatCache: cache });
}

function appendMessage(role, text) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  const label = role === 'user' ? 'Você' : role === 'assistant' ? 'Ferrol AI' : 'Sistema';
  wrap.innerHTML = `<div class="message-role">${label}</div><div class="message-body">${escapeHtml(text).replaceAll('\n', '<br>')}</div>`;
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  return wrap;
}

function appendThinking() {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant message-thinking';
  wrap.innerHTML = `<div class="message-role">Ferrol AI</div><div class="message-body"><div class="thinking-row"><span class="thinking-dot"></span><span class="thinking-text">Analisando seu pedido...</span></div></div>`;
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  return wrap;
}

function startProgress(node) {
  const el = node.querySelector('.thinking-text');
  const stages = [
    [2500, 'Entendendo o projeto e a mudança...'],
    [7000, 'Trabalhando no código...'],
    [18000, 'Conferindo o resultado...'],
  ];
  const timers = stages.map(([ms, text]) => setTimeout(() => {
    if (document.body.contains(node)) el.textContent = text;
  }, ms));
  return () => timers.forEach(clearTimeout);
}

async function loadChatHistory() {
  chat.innerHTML = '';
  const projectId = projectSelect.value;
  if (!projectId) {
    appendMessage('assistant', 'Conecte o GitHub e escolha um projeto para começar.');
    return;
  }

  const stored = await chrome.storage.local.get('ferrolChatCache');
  const cached = stored.ferrolChatCache?.[projectId] || [];
  if (cached.length) {
    for (const m of cached) appendMessage(m.role, m.content);
  } else {
    appendMessage('assistant', 'Estou conectado a este projeto. Pode pedir uma alteração, colar um print com Ctrl+V ou mandar um áudio.');
  }

  const threadId = await getThread(projectId);
  if (!threadId) return;
  try {
    const rows = await api(`/rest/v1/chat_messages?select=role,content,created_at&thread_id=eq.${encodeURIComponent(threadId)}&order=created_at.asc&limit=80`, {
      headers: headers(state.session.access_token, false),
    });
    const visible = (rows || []).filter((m) => ['user', 'assistant', 'system'].includes(m.role));
    if (visible.length) {
      chat.innerHTML = '';
      for (const m of visible) appendMessage(m.role, m.content);
      const all = await chrome.storage.local.get('ferrolChatCache');
      const cache = all.ferrolChatCache || {};
      cache[projectId] = visible;
      await chrome.storage.local.set({ ferrolChatCache: cache });
    }
  } catch {}
}

async function syncGithub() {
  if (!state.githubConnected) return;
  await callUrl(CONFIG.githubSyncUrl, {
    method: 'POST', headers: headers(state.session.access_token), body: '{}',
  });
}

function matchContextToProject() {
  if (!state.context?.projectName || !state.projects.length) return null;
  const target = normalize(state.context.projectName);
  return state.projects.find((p) => {
    const name = normalize(p.name);
    const repo = normalize(p.github_repo);
    return target === name || target === repo || target.includes(name) || name.includes(target) || target.includes(repo) || repo.includes(target);
  }) || null;
}

async function detectContext() {
  const stored = await chrome.storage.local.get('ferrolLovableContext');
  state.context = stored.ferrolLovableContext || null;
  const match = matchContextToProject();
  if (state.context?.projectName) {
    contextBar.classList.remove('hidden');
    projectContextDot.classList.add('live');
    if (match) {
      contextText.textContent = `Lovable · ${state.context.projectName} · repo identificado`;
      if (projectSelect.value !== match.id) {
        projectSelect.value = match.id;
        await chrome.storage.local.set({ ferrolProjectId: match.id });
      }
    } else {
      contextText.textContent = `Lovable · ${state.context.projectName}`;
    }
  } else {
    contextBar.classList.add('hidden');
    projectContextDot.classList.remove('live');
  }
}

async function bootWorkspace() {
  if (!(await refreshSessionIfNeeded())) return showAuth();
  showWorkspace();
  $('userEmail').textContent = state.session.user?.email || '';
  const stored = await chrome.storage.local.get('ferrolNativeLovableMode');
  state.nativeMode = typeof stored.ferrolNativeLovableMode === 'boolean' ? stored.ferrolNativeLovableMode : true;
  renderNativeToggle();
  await Promise.all([fetchSubscription(), fetchGithubState()]);
  await fetchProjects();
  await detectContext();
  await loadChatHistory();
}

function setSending(on) {
  state.sending = on;
  sendBtn.disabled = on;
  promptEl.disabled = on;
  micBtn.disabled = on;
  imageInput.disabled = on;
  sendBtn.textContent = on ? '...' : 'Enviar';
  composerHint.textContent = on ? 'agente trabalhando' : '';
}

function clearAttachment() {
  state.attachment = null;
  imageInput.value = '';
  imageAttachment.classList.add('hidden');
  imageThumb.removeAttribute('src');
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function attachImageFile(file) {
  if (!file || !file.type?.startsWith('image/')) return false;
  if (file.size > 5 * 1024 * 1024) {
    appendMessage('system', 'A imagem precisa ter no máximo 5 MB.');
    return false;
  }
  const dataUrl = await fileToDataUrl(file);
  state.attachment = { name: file.name || `captura-${Date.now()}.png`, dataUrl };
  imageName.textContent = state.attachment.name;
  imageThumb.src = dataUrl;
  imageAttachment.classList.remove('hidden');
  return true;
}

function formatTimer(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

async function activeLovableTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0];
  if (!tab?.id || !/^https:\/\/lovable\.dev\//i.test(tab.url || '')) return null;
  return tab;
}

async function tabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(response || {});
    });
  });
}

async function transcribeAudio(dataUrl) {
  composerHint.textContent = 'transcrevendo';
  const data = await callUrl(CONFIG.transcribeFunctionUrl, {
    method: 'POST', headers: headers(state.session.access_token), body: JSON.stringify({ audio_data_url: dataUrl }),
  });
  if (!data?.text) throw new Error('Não consegui entender o áudio.');
  promptEl.value = [promptEl.value.trim(), data.text].filter(Boolean).join(promptEl.value.trim() ? '\n' : '');
  promptEl.focus();
  composerHint.textContent = 'áudio transcrito';
  setTimeout(() => { if (!state.sending) composerHint.textContent = ''; }, 1800);
}

async function startMic() {
  const tab = await activeLovableTab();
  if (!tab) throw new Error('Abra seu projeto no Lovable para usar o microfone nesta versão.');
  const response = await tabMessage(tab.id, { type: 'FERROL_MIC_START' });
  if (!response?.ok) throw new Error(response?.error || 'Não consegui iniciar o microfone.');
  state.micRecording = true;
  state.recordingStartedAt = Date.now();
  micBtn.classList.add('recording');
  audioState.classList.remove('hidden');
  audioStateText.textContent = 'Gravando... clique novamente para parar';
  audioTimer.textContent = '00:00';
  state.audioTimerInterval = setInterval(() => {
    audioTimer.textContent = formatTimer(Date.now() - state.recordingStartedAt);
  }, 500);
}

async function stopMic() {
  const tab = await activeLovableTab();
  if (!tab) throw new Error('A aba do Lovable não está mais ativa.');
  const response = await tabMessage(tab.id, { type: 'FERROL_MIC_STOP' });
  clearInterval(state.audioTimerInterval);
  state.audioTimerInterval = null;
  state.micRecording = false;
  micBtn.classList.remove('recording');
  audioState.classList.add('hidden');
  if (!response?.ok || !response.audio_data_url) throw new Error(response?.error || 'Não consegui finalizar a gravação.');
  await transcribeAudio(response.audio_data_url);
}

async function sendAgentPrompt(prompt) {
  const project = selectedProject();
  if (!project) throw new Error('Escolha um projeto primeiro.');
  if (!state.subscriptionActive) throw new Error('Sua assinatura está inativa.');
  if (!(await refreshSessionIfNeeded())) throw new Error('Sua sessão expirou.');
  const threadId = await getThread(project.id);
  const data = await parseResponse(await fetch(CONFIG.agentFunctionUrl, {
    method: 'POST',
    headers: headers(state.session.access_token),
    body: JSON.stringify({ project_id: project.id, thread_id: threadId, prompt, image_data_url: state.attachment?.dataUrl || null }),
  }));
  if (data.thread_id) await setThread(project.id, data.thread_id);
  return data;
}

function renderNativeToggle() {
  nativeModeToggle.dataset.active = String(state.nativeMode);
  nativeModeToggle.title = state.nativeMode ? 'Chat do Lovable envia para Ferrol AI' : 'Chat do Lovable normal';
}

async function setNativeMode(active) {
  state.nativeMode = active;
  await chrome.storage.local.set({ ferrolNativeLovableMode: active });
  renderNativeToggle();
  const tab = await activeLovableTab();
  if (tab) {
    try { await tabMessage(tab.id, { type: 'FERROL_NATIVE_MODE_SET', active }); } catch {}
  }
}

async function refreshSupabaseAccount() {
  if (!state.session) return;
  try {
    const data = await callUrl(CONFIG.supabaseAccountUrl, { headers: headers(state.session.access_token, false) });
    state.supabaseAccount = data;
    if (!data.connected) {
      supabaseBadge.textContent = 'Não conectado';
      supabaseBadge.className = 'small-status';
      supabaseStatus.textContent = 'Conecte sua conta Supabase pelo OAuth oficial. Nenhuma service role entra na extensão.';
      supabaseProjectPickerWrap.classList.add('hidden');
      $('supabaseConnectBtn').textContent = 'Conectar Supabase';
      return;
    }
    supabaseBadge.textContent = 'Conta conectada';
    supabaseBadge.className = 'small-status on';
    supabaseStatus.textContent = 'Escolha qual projeto Supabase pertence ao repositório selecionado.';
    $('supabaseConnectBtn').textContent = 'Atualizar projetos';
    supabaseProjectSelect.innerHTML = '';
    for (const p of data.projects || []) {
      const opt = document.createElement('option');
      opt.value = p.ref;
      opt.textContent = `${p.name} · ${p.ref}`;
      supabaseProjectSelect.appendChild(opt);
    }
    supabaseProjectPickerWrap.classList.toggle('hidden', !(data.projects || []).length);
  } catch (e) {
    if (e.data?.setup_required) {
      supabaseBadge.textContent = 'OAuth pendente';
      supabaseStatus.textContent = 'O conector OAuth está pronto no backend, mas o app OAuth do Ferrol AI ainda precisa ser registrado no Supabase.';
      supabaseProjectPickerWrap.classList.add('hidden');
      return;
    }
    supabaseStatus.textContent = e.message;
  }
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); authError.textContent = '';
  try { await login($('email').value.trim(), $('password').value); }
  catch (err) { authError.textContent = err.message; }
});

$('signupBtn').addEventListener('click', async () => {
  authError.textContent = '';
  try { await signup($('email').value.trim(), $('password').value); }
  catch (err) { authError.textContent = err.message; }
});

$('logoutBtn').addEventListener('click', async () => {
  try { await api('/auth/v1/logout', { method: 'POST', headers: headers(state.session?.access_token) }); } catch {}
  await clearSession();
});

$('settingsBtn').addEventListener('click', async () => {
  settingsPanel.classList.remove('hidden');
  await Promise.all([fetchGithubState(), refreshSupabaseAccount()]);
});
$('closeSettingsBtn').addEventListener('click', () => settingsPanel.classList.add('hidden'));

$('syncBtn').addEventListener('click', async () => {
  try {
    composerHint.textContent = 'sincronizando';
    await syncGithub();
    await fetchProjects();
    await detectContext();
    await loadChatHistory();
    composerHint.textContent = 'sincronizado';
  } catch (e) {
    appendMessage('system', `Sincronização: ${e.message}`);
  } finally {
    setTimeout(() => { if (!state.sending) composerHint.textContent = ''; }, 1500);
  }
});

$('newChatBtn').addEventListener('click', async () => {
  const project = selectedProject();
  if (!project) return;
  await clearThread(project.id);
  await loadChatHistory();
});

projectSelect.addEventListener('change', async () => {
  if (projectSelect.value) await chrome.storage.local.set({ ferrolProjectId: projectSelect.value });
  await loadChatHistory();
  if (!settingsPanel.classList.contains('hidden')) await refreshSupabaseAccount();
});

$('githubConnectBtn').addEventListener('click', async () => {
  try {
    if (!state.githubConnected) {
      const data = await callUrl(CONFIG.githubConnectStartUrl, {
        method: 'POST', headers: headers(state.session.access_token), body: '{}',
      });
      if (!data?.install_url) throw new Error('Link do GitHub não retornado.');
      chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: data.install_url });
    } else {
      chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: CONFIG.githubManageUrl });
    }
  } catch (e) {
    githubStatus.textContent = e.message;
  }
});

$('supabaseConnectBtn').addEventListener('click', async () => {
  try {
    if (state.supabaseAccount?.connected) {
      await refreshSupabaseAccount();
      return;
    }
    const data = await callUrl(CONFIG.supabaseConnectStartUrl, {
      method: 'POST', headers: headers(state.session.access_token), body: '{}',
    });
    if (!data?.install_url) throw new Error('Link do Supabase não retornado.');
    chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: data.install_url });
    supabaseStatus.textContent = 'Autorize o Ferrol AI no Supabase e volte aqui. Depois abra as configurações novamente.';
  } catch (e) {
    supabaseStatus.textContent = e.data?.setup_required
      ? 'O OAuth do Supabase ainda precisa ser ativado pelo administrador do Ferrol AI.'
      : e.message;
  }
});

$('linkSupabaseProjectBtn').addEventListener('click', async () => {
  const project = selectedProject();
  const ref = supabaseProjectSelect.value;
  if (!project || !ref) return;
  try {
    $('linkSupabaseProjectBtn').disabled = true;
    const data = await callUrl(CONFIG.supabaseAccountUrl, {
      method: 'POST', headers: headers(state.session.access_token),
      body: JSON.stringify({ project_id: project.id, supabase_project_ref: ref }),
    });
    supabaseStatus.textContent = `Conectado ao projeto ${data.project?.name || ref}.`;
    await fetchProjects();
  } catch (e) {
    supabaseStatus.textContent = e.message;
  } finally {
    $('linkSupabaseProjectBtn').disabled = false;
  }
});

nativeModeToggle.addEventListener('click', () => setNativeMode(!state.nativeMode));

imageInput.addEventListener('change', async () => {
  const file = imageInput.files?.[0];
  if (!file) return clearAttachment();
  try { await attachImageFile(file); }
  catch (e) { appendMessage('system', `Imagem: ${e.message}`); }
});
$('removeImageBtn').addEventListener('click', clearAttachment);

promptEl.addEventListener('paste', async (event) => {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
  const file = imageItem?.getAsFile();
  if (!file) return;
  event.preventDefault();
  try {
    await attachImageFile(file);
    composerHint.textContent = 'print anexado';
    setTimeout(() => { if (!state.sending) composerHint.textContent = ''; }, 1600);
  } catch (e) {
    appendMessage('system', `Ctrl+V: ${e.message}`);
  }
});

micBtn.addEventListener('click', async () => {
  try {
    micBtn.disabled = true;
    if (state.micRecording) await stopMic();
    else await startMic();
  } catch (e) {
    clearInterval(state.audioTimerInterval);
    state.audioTimerInterval = null;
    state.micRecording = false;
    micBtn.classList.remove('recording');
    audioState.classList.add('hidden');
    appendMessage('system', `Microfone: ${e.message}`);
  } finally {
    micBtn.disabled = false;
  }
});

composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.sending) return;
  const prompt = promptEl.value.trim();
  const project = selectedProject();
  if (!prompt && !state.attachment) return;
  if (!project) return appendMessage('system', 'Escolha um projeto primeiro.');

  const actualPrompt = prompt || 'Analise a imagem anexada e faça a alteração necessária neste projeto.';
  const visiblePrompt = actualPrompt + (state.attachment ? `\n\n📎 ${state.attachment.name}` : '');
  appendMessage('user', visiblePrompt);
  await cacheMessage(project.id, 'user', visiblePrompt);
  promptEl.value = '';
  setSending(true);
  const thinking = appendThinking();
  const stopProgress = startProgress(thinking);

  try {
    const data = await sendAgentPrompt(actualPrompt);
    stopProgress();
    thinking.remove();
    const answer = data.message || 'Concluído.';
    appendMessage('assistant', answer);
    await cacheMessage(project.id, 'assistant', answer);
    clearAttachment();
    composerHint.textContent = 'salvo no GitHub';
    await fetchProjects();
  } catch (err) {
    stopProgress();
    thinking.remove();
    const msg = `Falha: ${err.message}`;
    appendMessage('system', msg);
    await cacheMessage(project.id, 'system', msg);
  } finally {
    setSending(false);
    setTimeout(() => { if (!state.sending) composerHint.textContent = ''; }, 2000);
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || workspaceView.classList.contains('hidden')) return;
  if (changes.ferrolLovableContext) {
    await detectContext();
  }
  if (changes.ferrolNativeRefresh) {
    const current = selectedProject();
    if (current && changes.ferrolNativeRefresh.newValue?.projectId === current.id) {
      await loadChatHistory();
    }
  }
  if (changes.ferrolNativeLovableMode) {
    state.nativeMode = Boolean(changes.ferrolNativeLovableMode.newValue);
    renderNativeToggle();
  }
});

(async () => {
  const stored = await chrome.storage.local.get('ferrolSession');
  state.session = stored.ferrolSession || null;
  if (state.session) await bootWorkspace(); else showAuth();
})();
