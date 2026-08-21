import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const state = { session: null, projects: [], attachment: null, githubConnected: false };

const authView = $('authView');
const workspaceView = $('workspaceView');
const subscriptionBadge = $('subscriptionBadge');
const authError = $('authError');
const githubConnectBtn = $('githubConnectBtn');
const githubDot = $('githubDot');
const githubStatus = $('githubStatus');
const projectSelect = $('projectSelect');
const chat = $('chat');
const promptEl = $('prompt');
const sendBtn = $('sendBtn');
const imageInput = $('imageInput');
const attachmentName = $('attachmentName');

function headers(accessToken, json = true) {
  return {
    apikey: CONFIG.supabasePublishableKey,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function api(path, options = {}) {
  const res = await fetch(`${CONFIG.supabaseUrl}${path}`, options);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(body?.msg || body?.message || body?.error_description || body?.error || `Erro ${res.status}`);
  return body;
}

async function callUrl(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(body?.message || body?.error || `Erro ${res.status}`);
  return body;
}

async function saveSession(session) {
  state.session = session;
  await chrome.storage.local.set({ ferrolSession: session });
}

async function clearSession() {
  state.session = null;
  state.projects = [];
  state.githubConnected = false;
  await chrome.storage.local.remove(['ferrolSession', 'ferrolProjectId']);
}

function appendMessage(role, text) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

async function login(email, password) {
  const data = await api('/auth/v1/token?grant_type=password', {
    method: 'POST', headers: headers(), body: JSON.stringify({ email, password })
  });
  await saveSession(data);
  await bootWorkspace();
}

async function signup(email, password) {
  const data = await api('/auth/v1/signup', {
    method: 'POST', headers: headers(), body: JSON.stringify({ email, password })
  });
  if (data.access_token) {
    await saveSession(data);
    await bootWorkspace();
  } else {
    authError.textContent = 'Conta criada. Confirme seu e-mail e depois entre.';
  }
}

async function refreshSessionIfNeeded() {
  if (!state.session?.refresh_token) return false;
  const expiresAt = (state.session.expires_at || 0) * 1000;
  if (expiresAt && expiresAt - Date.now() > 60_000) return true;
  try {
    const data = await api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: state.session.refresh_token })
    });
    await saveSession(data);
    return true;
  } catch {
    await clearSession();
    return false;
  }
}

async function fetchSubscription() {
  const rows = await api('/rest/v1/subscriptions?select=status,current_period_end&limit=1', {
    headers: { ...headers(state.session.access_token, false), Prefer: 'return=representation' }
  });
  const sub = rows?.[0];
  const active = sub?.status === 'active' && (!sub.current_period_end || new Date(sub.current_period_end) > new Date());
  subscriptionBadge.textContent = active ? 'Assinatura ativa' : 'Assinatura inativa';
  subscriptionBadge.className = `badge ${active ? 'active' : 'muted'}`;
  return active;
}

async function fetchGithubState() {
  const rows = await api('/rest/v1/github_installations?select=installation_id,account_login&order=updated_at.desc&limit=1', {
    headers: headers(state.session.access_token, false)
  });
  const item = rows?.[0];
  state.githubConnected = Boolean(item);
  if (item) {
    githubDot.classList.add('on');
    githubStatus.textContent = item.account_login || 'Conectado';
    githubConnectBtn.querySelector('b').textContent = 'Gerenciar';
    return true;
  }
  githubDot.classList.remove('on');
  githubStatus.textContent = 'Não conectado';
  githubConnectBtn.querySelector('b').textContent = 'Conectar';
  return false;
}

async function fetchProjects() {
  state.projects = await api('/rest/v1/projects?select=id,name,github_owner,github_repo,github_default_branch,updated_at&order=updated_at.desc', {
    headers: headers(state.session.access_token, false)
  });
  const stored = await chrome.storage.local.get('ferrolProjectId');
  projectSelect.innerHTML = '';
  if (!state.projects.length) {
    projectSelect.innerHTML = `<option value="">${state.githubConnected ? 'Nenhum repositório autorizado' : 'Conecte o GitHub primeiro'}</option>`;
    return;
  }
  for (const project of state.projects) {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = `${project.name} · ${project.github_owner}/${project.github_repo}`;
    if (stored.ferrolProjectId === project.id) option.selected = true;
    projectSelect.appendChild(option);
  }
  await chrome.storage.local.set({ ferrolProjectId: projectSelect.value });
}

async function refreshWorkspace() {
  await refreshSessionIfNeeded();
  await fetchGithubState();
  await fetchProjects();
  await fetchSubscription();
}

async function bootWorkspace() {
  authError.textContent = '';
  if (!(await refreshSessionIfNeeded())) return showAuth();
  authView.classList.add('hidden');
  workspaceView.classList.remove('hidden');
  $('userEmail').textContent = state.session.user?.email || '';
  try { await refreshWorkspace(); }
  catch (e) { appendMessage('system', `Não consegui atualizar a conta: ${e.message}`); }
}

function showAuth() {
  workspaceView.classList.add('hidden');
  authView.classList.remove('hidden');
  subscriptionBadge.textContent = 'Faça login';
  subscriptionBadge.className = 'badge muted';
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  authError.textContent = '';
  try { await login($('email').value.trim(), $('password').value); }
  catch (e) { authError.textContent = e.message; }
});

$('signupBtn').addEventListener('click', async () => {
  authError.textContent = '';
  try { await signup($('email').value.trim(), $('password').value); }
  catch (e) { authError.textContent = e.message; }
});

$('logoutBtn').addEventListener('click', async () => {
  try {
    if (state.session?.access_token) await api('/auth/v1/logout', { method: 'POST', headers: headers(state.session.access_token) });
  } catch {}
  await clearSession();
  showAuth();
});

githubConnectBtn.addEventListener('click', async () => {
  if (githubConnectBtn.disabled) return;
  githubConnectBtn.disabled = true;
  try {
    if (!(await refreshSessionIfNeeded())) return showAuth();
    const data = await callUrl(CONFIG.githubConnectStartUrl, {
      method: 'POST',
      headers: headers(state.session.access_token),
      body: '{}',
    });
    if (!data?.install_url) throw new Error('O backend não retornou o link do GitHub.');
    await chrome.storage.local.set({ ferrolGithubState: data.state || null });
    chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: data.install_url });
    appendMessage('system', state.githubConnected
      ? 'Gerencie os repositórios autorizados no GitHub. Depois volte à extensão.'
      : 'Autorize o GitHub e escolha os repositórios. Depois volte à extensão.');
  } catch (e) {
    appendMessage('system', `Falha ao conectar GitHub: ${e.message}`);
  } finally {
    githubConnectBtn.disabled = false;
  }
});

projectSelect.addEventListener('change', async () => {
  if (projectSelect.value) await chrome.storage.local.set({ ferrolProjectId: projectSelect.value });
});

imageInput.addEventListener('change', async () => {
  const file = imageInput.files?.[0];
  if (!file) { state.attachment = null; attachmentName.textContent = ''; return; }
  if (file.size > 5 * 1024 * 1024) {
    appendMessage('system', 'A imagem precisa ter no máximo 5 MB nesta versão.');
    imageInput.value = '';
    return;
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  state.attachment = { name: file.name, dataUrl };
  attachmentName.textContent = `📎 ${file.name}`;
});

$('composer').addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = promptEl.value.trim();
  const projectId = projectSelect.value;
  if (!prompt) return;
  if (!projectId) return appendMessage('system', 'Escolha um projeto primeiro.');

  appendMessage('user', prompt + (state.attachment ? `\n📎 ${state.attachment.name}` : ''));
  promptEl.value = '';
  sendBtn.disabled = true;
  sendBtn.textContent = 'Trabalhando...';

  try {
    if (!(await refreshSessionIfNeeded())) return showAuth();
    const res = await fetch(CONFIG.agentFunctionUrl, {
      method: 'POST',
      headers: headers(state.session.access_token),
      body: JSON.stringify({ project_id: projectId, prompt, image_data_url: state.attachment?.dataUrl || null })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
    appendMessage('assistant', data.message || 'Alterações concluídas.');
    state.attachment = null;
    imageInput.value = '';
    attachmentName.textContent = '';
  } catch (e) {
    appendMessage('system', `Falha: ${e.message}`);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Enviar';
  }
});

(async () => {
  const stored = await chrome.storage.local.get('ferrolSession');
  state.session = stored.ferrolSession || null;
  if (state.session) await bootWorkspace(); else showAuth();
})();
