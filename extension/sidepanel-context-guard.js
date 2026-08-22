import { CONFIG } from './config.js';

const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\|\s*lovable/gi, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
let applying = false;
let lastKey = '';

async function json(res) {
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(body?.error || body?.message || `Erro ${res.status}`);
  return body;
}

async function guardProjectSelection({ sync = false } = {}) {
  if (applying) return;
  const select = document.getElementById('projectSelect');
  if (!select) return;
  const stored = await chrome.storage.local.get(['ferrolSession','ferrolLovableContext']);
  const session = stored.ferrolSession;
  const context = stored.ferrolLovableContext;
  if (!session?.access_token || !context?.projectName) return;
  applying = true;
  try {
    const state = await chrome.runtime.sendMessage({ type: 'FG_CONTEXT_STATE', sync });
    if (!state?.ok) return;
    const target = String(context.projectName || '').trim();
    const key = `${target}:${state.detectedProject?.id || 'missing'}`;
    if (state.detectedProject) {
      const id = state.detectedProject.id;
      const exists = [...select.options].some((o) => o.value === id);
      if (!exists) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `${state.detectedProject.name} · ${state.detectedProject.repo}`;
        select.prepend(option);
      }
      select.value = id;
      await chrome.storage.local.set({ ferrolProjectId: id });
      select.style.borderColor = '';
      select.title = `Projeto detectado automaticamente: ${state.detectedProject.name}`;
      const text = document.getElementById('contextText');
      if (text) text.textContent = `Lovable · ${target} · GitHub confirmado`;
    } else {
      let placeholder = [...select.options].find((o) => o.dataset.fgDetected === 'missing');
      if (!placeholder) {
        placeholder = document.createElement('option');
        placeholder.dataset.fgDetected = 'missing';
        placeholder.value = '';
        select.prepend(placeholder);
      }
      placeholder.textContent = `⚠ ${target} · conecte/autorize o GitHub`;
      select.value = '';
      await chrome.storage.local.remove('ferrolProjectId');
      select.style.borderColor = '#ffbf5b';
      select.title = `O projeto ${target} foi detectado no Lovable, mas o repositório ainda não está autorizado no FG AI.`;
      const text = document.getElementById('contextText');
      if (text) text.textContent = state.githubConnected ? `Lovable · ${target} · autorize este repositório no GitHub` : `Lovable · ${target} · conecte o GitHub`;
    }
    lastKey = key;
  } catch {}
  finally { applying = false; }
}

const observer = new MutationObserver(() => {
  clearTimeout(observer._t);
  observer._t = setTimeout(() => guardProjectSelection({ sync: false }), 120);
});

function start() {
  const select = document.getElementById('projectSelect');
  if (select) observer.observe(select, { childList: true });
  guardProjectSelection({ sync: true });
  document.getElementById('syncBtn')?.addEventListener('click', () => setTimeout(() => guardProjectSelection({ sync: true }), 900), true);
  window.addEventListener('focus', () => guardProjectSelection({ sync: true }));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.ferrolLovableContext || changes.ferrolSession || changes.ferrolNativeRefresh)) guardProjectSelection({ sync: Boolean(changes.ferrolLovableContext) });
  });
  setInterval(() => guardProjectSelection({ sync: false }), 6000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();