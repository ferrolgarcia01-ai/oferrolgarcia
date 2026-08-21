import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const state = {
  session: null,
  license: null,
  deviceId: null,
  projects: [],
  githubConnected: false,
  supabaseAccount: null,
  context: null,
  attachment: null,
  sending: false,
  recording: false,
  recorder: null,
  stream: null,
  chunks: [],
  timer: null,
  timerStartedAt: 0,
  nativeMode: true,
  extensionEnabled: true,
};

const licenseView = $('licenseView');
const workspaceView = $('workspaceView');
const licenseBadge = $('licenseBadge');
const historyBtn = $('historyBtn');
const settingsBtn = $('settingsBtn');
const licenseForm = $('licenseForm');
const licenseKey = $('licenseKey');
const activateBtn = $('activateBtn');
const licenseError = $('licenseError');
const projectSelect = $('projectSelect');
const projectContextDot = $('projectContextDot');
const contextBar = $('contextBar');
const contextText = $('contextText');
const chat = $('chat');
const composer = $('composer');
const promptEl = $('prompt');
const sendBtn = $('sendBtn');
const composerHint = $('composerHint');
const fileInput = $('fileInput');
const attachmentCard = $('attachmentCard');
const attachmentThumb = $('attachmentThumb');
const attachmentIcon = $('attachmentIcon');
const attachmentName = $('attachmentName');
const attachmentMeta = $('attachmentMeta');
const removeAttachmentBtn = $('removeAttachmentBtn');
const micBtn = $('micBtn');
const audioState = $('audioState');
const audioStateText = $('audioStateText');
const audioTimer = $('audioTimer');
const historyPanel = $('historyPanel');
const historyList = $('historyList');
const clearHistoryBtn = $('clearHistoryBtn');
const settingsPanel = $('settingsPanel');
const extensionToggle = $('extensionToggle');
const nativeModeToggle = $('nativeModeToggle');
const githubBadge = $('githubBadge');
const githubStatus = $('githubStatus');
const supabaseBadge = $('supabaseBadge');
const supabaseStatus = $('supabaseStatus');
const supabaseProjectPickerWrap = $('supabaseProjectPickerWrap');
const supabaseProjectSelect = $('supabaseProjectSelect');
const licenseStatusText = $('licenseStatusText');
const licenseKeyHint = $('licenseKeyHint');
const licenseExpiryText = $('licenseExpiryText');
const licenseMeter = $('licenseMeter');

const headers = (token, json = true) => ({
  apikey: CONFIG.supabasePublishableKey,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(state.deviceId ? { 'x-fg-device-id': state.deviceId } : {}),
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

async function parseResponse(res) {
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const error = new Error(body?.msg || body?.message || body?.error_description || body?.error || `Erro ${res.status}`);
    error.status = res.status;
    error.data = body;
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

function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
  } catch { return ''; }
}

function formatDateTime(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch { return ''; }
}

async function getDeviceId() {
  const stored = await chrome.storage.local.get('ferrolDeviceId');
  if (stored.ferrolDeviceId) return stored.ferrolDeviceId;
  const id = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  await chrome.storage.local.set({ ferrolDeviceId: id });
  return id;
}

async function saveSession(session) {
  state.session = session;
  await chrome.storage.local.set({ ferrolSession: session });
}

async function clearSession({ keepUi = false } = {}) {
  state.session = null;
  state.license = null;
  state.projects = [];
  await chrome.storage.local.remove(['ferrolSession', 'ferrolLicenseInfo', 'ferrolProjectId', 'ferrolThreads', 'ferrolChatCache']);
  if (!keepUi) showLicense();
}

async function refreshSessionIfNeeded() {
  if (!state.session?.refresh_token) return false;
  const expiresAt = Number(state.session.expires_at || 0) * 1000;
  if (expiresAt && expiresAt - Date.now() > 60_000) return true;
  try {
    const data = await api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ refresh_token: state.session.refresh_token }),
    });
    await saveSession(data);
    return true;
  } catch {
    await clearSession({ keepUi: true });
    return false;
  }
}

function showLicense() {
  workspaceView.classList.add('hidden');
  licenseView.classList.remove('hidden');
  historyBtn.classList.add('hidden');
  settingsBtn.classList.add('hidden');
  licenseBadge.textContent = 'Licença';
  licenseBadge.className = 'status-chip muted';
  setTimeout(() => licenseKey.focus(), 80);
}

function showWorkspace() {
  licenseView.classList.add('hidden');
  workspaceView.classList.remove('hidden');
  historyBtn.classList.remove('hidden');
  settingsBtn.classList.remove('hidden');
}

async function activateLicense(rawKey) {
  const key = String(rawKey || '').trim().toUpperCase();
  const data = await callUrl(CONFIG.licenseActivateUrl, {
    method: 'POST',
    headers: headers(null),
    body: JSON.stringify({
      license_key: key,
      device_id: state.deviceId,
      device_name: `${navigator.platform || 'Chrome'} · ${navigator.userAgentData?.platform || 'Browser'}`,
    }),
  });
  if (!data?.session) throw new Error('A licença foi aceita, mas a sessão não foi criada.');
  await saveSession(data.session);
  state.license = data.license || null;
  await chrome.storage.local.set({ ferrolLicenseInfo: state.license || {} });
  await bootWorkspace();
}

function renderLicense() {
  const lic = state.license || {};
  const days = Number.isFinite(Number(lic.days_remaining)) ? Number(lic.days_remaining) : null;
  const active = lic.status === 'active';
  licenseBadge.textContent = active ? (days === null ? 'Ativa' : `${days}d`) : 'Inativa';
  licenseBadge.className = `status-chip ${active ? 'active' : 'warn'}`;
  licenseStatusText.textContent = active ? 'Licença ativa' : 'Licença inativa';
  licenseKeyHint.textContent = lic.key_last4 ? `••••-${lic.key_last4}` : '••••';
  licenseExpiryText.textContent = lic.expires_at ? `Válida até ${formatDate(lic.expires_at)}${days !== null ? ` · ${days} dia${days === 1 ? '' : 's'} restante${days === 1 ? '' : 's'}` : ''}` : 'Sem data de expiração';
  if (days === null) licenseMeter.style.width = '100%';
  else licenseMeter.style.width = `${Math.max(5, Math.min(100, (days / 30) * 100))}%`;
}

async function fetchLicenseStatus() {
  const data = await callUrl(CONFIG.licenseStatusUrl, {
    method: 'GET',
    headers: headers(state.session.access_token, false),
  });
  state.license = data.license || null;
  await chrome.storage.local.set({ ferrolLicenseInfo: state.license || {} });
  renderLicense();
}

async function fetchGithubState() {
  const rows = await api('/rest/v1/github_installations?select=installation_id,account_login&order=updated_at.desc&limit=1', {
    headers: headers(state.session.access_token, false),
  });
  const item = rows?.[0];
  state.githubConnected = Boolean(item);
  githubStatus.textContent = item ? item.account_login || 'Conectado' : 'Conecte sua conta para liberar os repositórios.';
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

async function clearLocalThread(projectId) {
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
  cache[projectId] = rows.slice(-60);
  await chrome.storage.local.set({ ferrolChatCache: cache });
}

function appendMessage(role, text, { supabaseAction = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  const label = role === 'user' ? 'Você' : role === 'assistant' ? 'FG AI' : 'Sistema';
  const body = document.createElement('div');
  body.className = 'message-body';
  body.innerHTML = escapeHtml(text).replaceAll('\n', '<br>');
  wrap.innerHTML = `<div class="message-role">${label}</div>`;
  wrap.appendChild(body);
  if (supabaseAction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inline-action';
    button.textContent = 'Conectar Supabase';
    button.addEventListener('click', connectSupabase);
    body.appendChild(button);
  }
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  return wrap;
}

function appendThinking() {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant';
  wrap.innerHTML = `<div class="message-role">FG AI</div><div class="message-body"><div class="thinking-row"><span class="thinking-dot"></span><span class="thinking-text">Analisando o projeto...</span></div></div>`;
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  const text = wrap.querySelector('.thinking-text');
  const timers = [
    setTimeout(() => { if (document.body.contains(wrap)) text.textContent = 'Trabalhando no código...'; }, 4500),
    setTimeout(() => { if (document.body.contains(wrap)) text.textContent = 'Conferindo o resultado...'; }, 14000),
  ];
  return { node: wrap, stop: () => timers.forEach(clearTimeout) };
}

function introMessage() {
  const project = selectedProject();
  if (!project) return state.githubConnected ? 'Autorize um repositório no GitHub para começar.' : 'Conecte o GitHub e eu passo a trabalhar direto no seu projeto.';
  return `Estou conectado ao ${project.name}. Pode conversar comigo normalmente ou pedir uma alteração. Eu analiso o projeto e faço no GitHub.`;
}

async function loadChatHistory() {
  chat.innerHTML = '';
  const projectId = projectSelect.value;
  if (!projectId) {
    appendMessage('assistant', introMessage());
    return;
  }
  const threadId = await getThread(projectId);
  if (threadId) {
    try {
      const rows = await api(`/rest/v1/chat_messages?select=role,content,created_at&thread_id=eq.${encodeURIComponent(threadId)}&order=created_at.asc&limit=80`, {
        headers: headers(state.session.access_token, false),
      });
      const visible = (rows || []).filter((m) => ['user','assistant','system'].includes(m.role));
      if (visible.length) {
        for (const m of visible) appendMessage(m.role, m.content);
        return;
      }
    } catch {}
  }
  const stored = await chrome.storage.local.get('ferrolChatCache');
  const cached = stored.ferrolChatCache?.[projectId] || [];
  if (cached.length) for (const m of cached) appendMessage(m.role, m.content);
  else appendMessage('assistant', introMessage());
}

async function detectContext() {
  const stored = await chrome.storage.local.get('ferrolLovableContext');
  state.context = stored.ferrolLovableContext || null;
  const target = normalize(state.context?.projectName || '');
  let match = null;
  if (target) {
    match = state.projects.find((p) => {
      const name = normalize(p.name);
      const repo = normalize(p.github_repo);
      return target === name || target === repo || target.includes(name) || name.includes(target) || target.includes(repo) || repo.includes(target);
    }) || null;
  }
  if (state.context?.projectName) {
    contextBar.classList.remove('hidden');
    projectContextDot.classList.add('live');
    contextText.textContent = match ? `Lovable · ${state.context.projectName} · repo identificado` : `Lovable · ${state.context.projectName}`;
    if (match && projectSelect.value !== match.id) {
      projectSelect.value = match.id;
      await chrome.storage.local.set({ ferrolProjectId: match.id });
    }
  } else {
    contextBar.classList.add('hidden');
    projectContextDot.classList.remove('live');
  }
}

async function syncGithub({ quiet = false } = {}) {
  if (!state.githubConnected) return;
  try {
    await callUrl(CONFIG.githubSyncUrl, {
      method: 'POST', headers: headers(state.session.access_token), body: '{}',
    });
    await fetchProjects();
    await detectContext();
    if (!quiet) appendMessage('system', 'GitHub sincronizado.');
  } catch (error) {
    if (!quiet) appendMessage('system', error.message || 'Falha ao sincronizar GitHub.');
  }
}

async function bootWorkspace() {
  if (!(await refreshSessionIfNeeded())) return showLicense();
  try {
    await fetchLicenseStatus();
  } catch {
    await clearSession({ keepUi: true });
    return showLicense();
  }
  showWorkspace();
  const stored = await chrome.storage.local.get(['ferrolNativeLovableMode','ferrolExtensionEnabled','ferrolSidepanelView']);
  state.nativeMode = typeof stored.ferrolNativeLovableMode === 'boolean' ? stored.ferrolNativeLovableMode : true;
  state.extensionEnabled = typeof stored.ferrolExtensionEnabled === 'boolean' ? stored.ferrolExtensionEnabled : true;
  renderToggles();
  await fetchGithubState();
  await fetchProjects();
  await detectContext();
  await loadChatHistory();
  fetchSupabaseAccount({ quiet: true });
  if (stored.ferrolSidepanelView) {
    await chrome.storage.local.remove('ferrolSidepanelView');
    if (stored.ferrolSidepanelView === 'settings') openSettings();
    if (stored.ferrolSidepanelView === 'history') openHistory();
  }
}

function setSending(on) {
  state.sending = on;
  sendBtn.disabled = on;
  promptEl.disabled = on;
  micBtn.disabled = on;
  fileInput.disabled = on;
  sendBtn.textContent = on ? '...' : 'Enviar';
  composerHint.textContent = on ? 'agente trabalhando' : '';
}

function clearAttachment() {
  state.attachment = null;
  fileInput.value = '';
  attachmentCard.classList.add('hidden');
  attachmentThumb.removeAttribute('src');
  attachmentThumb.classList.add('hidden');
  attachmentIcon.classList.add('hidden');
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function attachFile(file) {
  if (!file) return;
  if (file.type?.startsWith('image/')) {
    if (file.size > 5 * 1024 * 1024) throw new Error('A imagem precisa ter no máximo 5 MB.');
    const dataUrl = await fileToDataUrl(file);
    state.attachment = { type: 'image', name: file.name || 'imagem.png', dataUrl };
    attachmentThumb.src = dataUrl;
    attachmentThumb.classList.remove('hidden');
    attachmentIcon.classList.add('hidden');
    attachmentMeta.textContent = 'Imagem pronta para o agente';
  } else {
    if (file.size > 900 * 1024) throw new Error('O arquivo de texto precisa ter no máximo 900 KB.');
    const text = await file.text();
    state.attachment = { type: 'text', name: file.name || 'arquivo.txt', text: text.slice(0, 120000) };
    attachmentThumb.classList.add('hidden');
    attachmentIcon.classList.remove('hidden');
    attachmentMeta.textContent = `${Math.ceil(text.length / 1000)} KB de texto/código`;
  }
  attachmentName.textContent = state.attachment.name;
  attachmentCard.classList.remove('hidden');
}

function formatTimer(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60).toString().padStart(2,'0')}:${(total % 60).toString().padStart(2,'0')}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function startRecording() {
  if (state.recording) return stopRecording();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Seu navegador não liberou gravação de áudio para a extensão.');
  state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const preferred = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
  const mimeType = preferred.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  state.recorder = mimeType ? new MediaRecorder(state.stream, { mimeType }) : new MediaRecorder(state.stream);
  state.chunks = [];
  state.recorder.ondataavailable = (event) => { if (event.data?.size) state.chunks.push(event.data); };
  state.recorder.start(250);
  state.recording = true;
  state.timerStartedAt = Date.now();
  micBtn.classList.add('recording');
  audioState.classList.remove('hidden');
  audioStateText.textContent = 'Gravando... clique novamente para transcrever';
  audioTimer.textContent = '00:00';
  state.timer = setInterval(() => { audioTimer.textContent = formatTimer(Date.now() - state.timerStartedAt); }, 500);
}

async function stopRecording() {
  if (!state.recording || !state.recorder) return;
  const recorder = state.recorder;
  const stopped = new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(state.chunks, { type: recorder.mimeType || 'audio/webm' }));
  });
  recorder.stop();
  state.stream?.getTracks().forEach((track) => track.stop());
  state.recording = false;
  clearInterval(state.timer);
  state.timer = null;
  micBtn.classList.remove('recording');
  audioStateText.textContent = 'Transcrevendo...';
  const blob = await stopped;
  if (!blob.size) throw new Error('A gravação ficou vazia.');
  const dataUrl = await blobToDataUrl(blob);
  const result = await callUrl(CONFIG.transcribeFunctionUrl, {
    method: 'POST',
    headers: headers(state.session.access_token),
    body: JSON.stringify({ audio_data_url: dataUrl }),
  });
  const text = String(result.text || '').trim();
  if (text) promptEl.value = `${promptEl.value}${promptEl.value ? ' ' : ''}${text}`;
  audioState.classList.add('hidden');
  state.recorder = null;
  state.stream = null;
  state.chunks = [];
  promptEl.focus();
}

function wantsDatabase(text) {
  return /\b(supabase|banco\s+de\s+dados|database|tabela|sql|postgres|login|auth|cadastro|usu[aá]rio|storage|bucket)\b/i.test(text);
}

async function sendPrompt() {
  if (state.sending) return;
  const project = selectedProject();
  if (!project) {
    openSettings();
    appendMessage('system', 'Conecte o GitHub e escolha um projeto antes de enviar.');
    return;
  }
  let prompt = promptEl.value.trim();
  const attachment = state.attachment;
  if (!prompt && !attachment) return;
  let imageData = null;
  if (attachment?.type === 'text') {
    prompt = `${prompt || 'Analise o arquivo anexado e faça o que for necessário.'}\n\n--- ARQUIVO ANEXADO: ${attachment.name} ---\n${attachment.text}\n--- FIM DO ARQUIVO ---`;
  }
  if (attachment?.type === 'image') imageData = attachment.dataUrl;
  const visiblePrompt = promptEl.value.trim() || (attachment?.type === 'image' ? `Imagem: ${attachment.name}` : `Arquivo: ${attachment?.name || ''}`);
  promptEl.value = '';
  clearAttachment();
  appendMessage('user', visiblePrompt);
  await cacheMessage(project.id, 'user', visiblePrompt);
  setSending(true);
  const thinking = appendThinking();
  try {
    const threadId = await getThread(project.id);
    const data = await callUrl(CONFIG.agentFunctionUrl, {
      method: 'POST',
      headers: headers(state.session.access_token),
      body: JSON.stringify({ project_id: project.id, thread_id: threadId, prompt, image_data_url: imageData, source: 'sidepanel' }),
    });
    thinking.stop();
    thinking.node.remove();
    if (data.thread_id) await setThread(project.id, data.thread_id);
    const message = data.message || 'Concluído.';
    const needsSupabase = wantsDatabase(prompt) && !project.supabase_project_ref && /supabase|banco|database|conect/i.test(message);
    appendMessage('assistant', message, { supabaseAction: needsSupabase });
    await cacheMessage(project.id, 'assistant', message);
    await chrome.storage.local.set({ ferrolNativeRefresh: { projectId: project.id, ts: Date.now() } });
  } catch (error) {
    thinking.stop();
    thinking.node.remove();
    appendMessage('system', error.message || 'Falha no agente.');
  } finally {
    setSending(false);
    promptEl.focus();
  }
}

async function fetchHistoryThreads() {
  historyList.innerHTML = '<div class="history-empty">Carregando...</div>';
  const projectId = projectSelect.value;
  if (!projectId) {
    historyList.innerHTML = '<div class="history-empty">Escolha um projeto.</div>';
    return;
  }
  try {
    const rows = await api(`/rest/v1/chat_threads?select=id,title,created_at,updated_at&project_id=eq.${encodeURIComponent(projectId)}&order=updated_at.desc&limit=40`, {
      headers: headers(state.session.access_token, false),
    });
    historyList.innerHTML = '';
    if (!rows?.length) {
      historyList.innerHTML = '<div class="history-empty">Nenhuma conversa ainda.</div>';
      return;
    }
    for (const row of rows) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'history-item';
      item.innerHTML = `<strong>${escapeHtml(row.title || 'Conversa')}</strong><span>${escapeHtml(formatDateTime(row.updated_at || row.created_at))}</span>`;
      item.addEventListener('click', async () => {
        await setThread(projectId, row.id);
        historyPanel.classList.add('hidden');
        await loadChatHistory();
      });
      historyList.appendChild(item);
    }
  } catch (error) {
    historyList.innerHTML = `<div class="history-empty">${escapeHtml(error.message || 'Falha ao carregar histórico.')}</div>`;
  }
}

async function clearHistory() {
  const projectId = projectSelect.value;
  if (!projectId) return;
  clearHistoryBtn.disabled = true;
  clearHistoryBtn.textContent = 'Limpando...';
  try {
    await callUrl(CONFIG.historyClearUrl, {
      method: 'POST',
      headers: headers(state.session.access_token),
      body: JSON.stringify({ project_id: projectId }),
    });
    await clearLocalThread(projectId);
    await fetchHistoryThreads();
    historyPanel.classList.add('hidden');
    await loadChatHistory();
    appendMessage('system', 'Histórico limpo.');
  } catch (error) {
    appendMessage('system', error.message || 'Falha ao limpar histórico.');
  } finally {
    clearHistoryBtn.disabled = false;
    clearHistoryBtn.textContent = 'Limpar histórico deste projeto';
  }
}

function openHistory() {
  settingsPanel.classList.add('hidden');
  historyPanel.classList.remove('hidden');
  fetchHistoryThreads();
}

function openSettings() {
  historyPanel.classList.add('hidden');
  settingsPanel.classList.remove('hidden');
  fetchSupabaseAccount({ quiet: true });
}

function renderToggles() {
  extensionToggle.dataset.active = String(state.extensionEnabled);
  nativeModeToggle.dataset.active = String(state.nativeMode);
}

async function setExtensionEnabled(value) {
  state.extensionEnabled = Boolean(value);
  await chrome.storage.local.set({ ferrolExtensionEnabled: state.extensionEnabled });
  renderToggles();
}

async function setNativeMode(value) {
  state.nativeMode = Boolean(value);
  await chrome.storage.local.set({ ferrolNativeLovableMode: state.nativeMode });
  renderToggles();
}

async function connectGithub() {
  try {
    if (state.githubConnected) {
      chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: CONFIG.githubManageUrl });
      return;
    }
    const data = await callUrl(CONFIG.githubConnectStartUrl, {
      method: 'POST', headers: headers(state.session.access_token), body: '{}',
    });
    if (!data.install_url) throw new Error('URL de instalação não recebida.');
    chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: data.install_url });
    githubStatus.textContent = 'Conclua a instalação no GitHub. Vou sincronizar quando você voltar.';
  } catch (error) {
    githubStatus.textContent = error.message || 'Falha ao conectar GitHub.';
  }
}

async function fetchSupabaseAccount({ quiet = false } = {}) {
  if (!state.session) return;
  try {
    const data = await callUrl(CONFIG.supabaseAccountUrl, {
      method: 'GET', headers: headers(state.session.access_token, false),
    });
    state.supabaseAccount = data;
    if (data.connected) {
      supabaseBadge.textContent = 'Conectado';
      supabaseBadge.className = 'small-status on';
      supabaseStatus.textContent = 'Conta Supabase conectada. Escolha o projeto que pertence ao repositório atual.';
      const projects = data.projects || [];
      supabaseProjectSelect.innerHTML = projects.map((p) => `<option value="${escapeHtml(p.ref)}">${escapeHtml(p.name || p.ref)}</option>`).join('');
      supabaseProjectPickerWrap.classList.toggle('hidden', !projects.length);
    } else {
      supabaseBadge.textContent = 'Opcional';
      supabaseBadge.className = 'small-status';
      supabaseStatus.textContent = 'Só conecte quando o projeto precisar de banco, autenticação ou storage.';
      supabaseProjectPickerWrap.classList.add('hidden');
    }
  } catch (error) {
    if (!quiet) supabaseStatus.textContent = error.message || 'Falha ao consultar Supabase.';
  }
}

async function connectSupabase() {
  try {
    const data = await callUrl(CONFIG.supabaseConnectStartUrl, {
      method: 'POST', headers: headers(state.session.access_token), body: '{}',
    });
    if (!data.install_url) throw new Error('URL de conexão não recebida.');
    chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: data.install_url });
    supabaseStatus.textContent = 'Conclua a autorização no Supabase e volte para este painel.';
  } catch (error) {
    supabaseStatus.textContent = error?.data?.setup_required
      ? 'O OAuth do Supabase ainda precisa ser ativado no servidor do FG AI.'
      : (error.message || 'Falha ao conectar Supabase.');
  }
}

async function linkSupabaseProject() {
  const project = selectedProject();
  const ref = supabaseProjectSelect.value;
  if (!project || !ref) return;
  try {
    const data = await callUrl(CONFIG.supabaseAccountUrl, {
      method: 'POST', headers: headers(state.session.access_token), body: JSON.stringify({ project_id: project.id, supabase_project_ref: ref }),
    });
    supabaseStatus.textContent = data?.project?.name ? `${data.project.name} conectado a este projeto.` : 'Supabase conectado a este projeto.';
    await fetchProjects();
  } catch (error) {
    supabaseStatus.textContent = error.message || 'Falha ao vincular projeto Supabase.';
  }
}

licenseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  licenseError.textContent = '';
  activateBtn.disabled = true;
  activateBtn.textContent = 'Ativando...';
  try {
    await activateLicense(licenseKey.value);
    licenseKey.value = '';
  } catch (error) {
    licenseError.textContent = error.message || 'Falha ao ativar licença.';
  } finally {
    activateBtn.disabled = false;
    activateBtn.textContent = 'Ativar FG AI';
  }
});

composer.addEventListener('submit', (event) => { event.preventDefault(); sendPrompt(); });
promptEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendPrompt();
  }
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  try { if (file) await attachFile(file); }
  catch (error) { appendMessage('system', error.message || 'Falha ao anexar arquivo.'); clearAttachment(); }
});

removeAttachmentBtn.addEventListener('click', clearAttachment);

document.addEventListener('paste', async (event) => {
  if (licenseView && !licenseView.classList.contains('hidden')) return;
  const item = [...(event.clipboardData?.items || [])].find((x) => x.kind === 'file' && x.type.startsWith('image/'));
  const file = item?.getAsFile();
  if (!file) return;
  event.preventDefault();
  try { await attachFile(file); } catch (error) { appendMessage('system', error.message || 'Falha ao colar imagem.'); }
});

micBtn.addEventListener('click', async () => {
  try { await startRecording(); }
  catch (error) {
    audioState.classList.add('hidden');
    micBtn.classList.remove('recording');
    appendMessage('system', error.message || 'Falha no microfone.');
  }
});

$('syncBtn').addEventListener('click', () => syncGithub());
$('newChatBtn').addEventListener('click', async () => {
  const projectId = projectSelect.value;
  if (!projectId) return;
  await clearLocalThread(projectId);
  await loadChatHistory();
  promptEl.focus();
});

projectSelect.addEventListener('change', async () => {
  if (projectSelect.value) await chrome.storage.local.set({ ferrolProjectId: projectSelect.value });
  await loadChatHistory();
  fetchSupabaseAccount({ quiet: true });
});

historyBtn.addEventListener('click', openHistory);
settingsBtn.addEventListener('click', openSettings);
$('closeHistoryBtn').addEventListener('click', () => historyPanel.classList.add('hidden'));
$('closeSettingsBtn').addEventListener('click', () => settingsPanel.classList.add('hidden'));
clearHistoryBtn.addEventListener('click', clearHistory);
extensionToggle.addEventListener('click', () => setExtensionEnabled(!state.extensionEnabled));
nativeModeToggle.addEventListener('click', () => setNativeMode(!state.nativeMode));
$('githubConnectBtn').addEventListener('click', connectGithub);
$('supabaseConnectBtn').addEventListener('click', connectSupabase);
$('linkSupabaseProjectBtn').addEventListener('click', linkSupabaseProject);
$('changeLicenseBtn').addEventListener('click', async () => {
  await clearSession();
  settingsPanel.classList.add('hidden');
});

window.addEventListener('focus', async () => {
  if (!state.session) return;
  try {
    await fetchGithubState();
    await syncGithub({ quiet: true });
    await fetchSupabaseAccount({ quiet: true });
  } catch {}
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  if (changes.ferrolNativeLovableMode) {
    state.nativeMode = Boolean(changes.ferrolNativeLovableMode.newValue);
    renderToggles();
  }
  if (changes.ferrolExtensionEnabled) {
    state.extensionEnabled = Boolean(changes.ferrolExtensionEnabled.newValue);
    renderToggles();
  }
  if (changes.ferrolNativeRefresh && state.session) {
    const projectId = projectSelect.value;
    if (projectId && changes.ferrolNativeRefresh.newValue?.projectId === projectId) await loadChatHistory();
  }
});

(async function init() {
  state.deviceId = await getDeviceId();
  const stored = await chrome.storage.local.get(['ferrolSession','ferrolLicenseInfo']);
  state.session = stored.ferrolSession || null;
  state.license = stored.ferrolLicenseInfo || null;
  if (!state.session) return showLicense();
  await bootWorkspace();
})();
