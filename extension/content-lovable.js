(() => {
  if (window.__fgAiLovableV10) return;
  window.__fgAiLovableV10 = true;

  let extensionEnabled = true;
  let nativeMode = true;
  let hasSession = false;
  let sending = false;
  let pastedImage = null;
  let dockOpen = false;
  let toastTimer = null;

  const IDS = {
    style: 'fg-ai-v10-style',
    bubble: 'fg-ai-bubble',
    dock: 'fg-ai-dock',
    ring: 'fg-ai-native-ring',
    badge: 'fg-ai-native-badge',
    toast: 'fg-ai-toast',
    imageChip: 'fg-ai-image-chip',
  };

  function runtimeAlive() {
    try { return Boolean(chrome?.runtime?.id); } catch { return false; }
  }

  function cleanupLegacy() {
    ['ferrol-ai-native-toggle','ferrol-ai-native-status','ferrol-ai-paste-chip','ferrol-ai-lovable-v07-style'].forEach((id) => document.getElementById(id)?.remove());
  }

  function injectStyle() {
    if (document.getElementById(IDS.style)) return;
    const style = document.createElement('style');
    style.id = IDS.style;
    style.textContent = `
      #${IDS.bubble}{position:fixed;right:24px;bottom:92px;z-index:2147483646;width:58px;height:58px;border:1px solid rgba(255,255,255,.22);border-radius:50%;background:linear-gradient(145deg,rgba(21,25,37,.98),rgba(42,28,57,.98));box-shadow:0 14px 38px rgba(0,0,0,.3),0 0 0 3px rgba(123,88,255,.12);display:grid;place-items:center;cursor:pointer;user-select:none;transition:.18s ease;color:#fff;font:900 13px/1 system-ui;letter-spacing:-.03em}
      #${IDS.bubble}:hover{transform:translateY(-2px) scale(1.03)}
      #${IDS.bubble}[data-on="true"]:before{content:"";position:absolute;inset:-7px;border-radius:50%;border:2px solid rgba(255,63,89,.36);animation:fgPulse 1.8s ease-out infinite}
      #${IDS.bubble}[data-on="false"]{filter:saturate(.25);opacity:.76}
      #${IDS.bubble} .fg-logo{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,rgba(255,63,89,.2),rgba(123,88,255,.28));border:1px solid rgba(255,255,255,.1)}
      #${IDS.bubble} .fg-dot{position:absolute;right:1px;bottom:4px;width:10px;height:10px;border-radius:50%;background:#39d77a;border:2px solid #121722}
      #${IDS.bubble}[data-on="false"] .fg-dot{background:#6d7688}
      #${IDS.dock}{position:fixed;right:29px;bottom:160px;z-index:2147483645;display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 6px;border-radius:24px;background:linear-gradient(180deg,rgba(28,34,49,.91),rgba(28,36,50,.82));border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 42px rgba(0,0,0,.24);backdrop-filter:blur(16px);transform:translateY(12px) scale(.96);opacity:0;pointer-events:none;transition:.16s ease}
      #${IDS.dock}.open{transform:translateY(0) scale(1);opacity:1;pointer-events:auto}
      #${IDS.dock} .fg-tool{position:relative;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.13);background:#102033;color:#e9eef7;display:grid;place-items:center;cursor:pointer;font:800 10px/1 system-ui;box-shadow:0 7px 17px rgba(0,0,0,.16)}
      #${IDS.dock} .fg-tool:hover{background:#162b43;border-color:rgba(255,255,255,.24);transform:translateX(-1px)}
      #${IDS.dock} .fg-tool.power{background:#159b52;color:#fff;border-color:rgba(255,255,255,.2)}
      #${IDS.dock} .fg-tool.power[data-on="false"]{background:#4b5568}
      #${IDS.dock} .fg-tip{position:absolute;right:50px;top:50%;transform:translateY(-50%);padding:7px 9px;border-radius:9px;background:#fff;color:#203047;white-space:nowrap;font:600 11px/1 system-ui;box-shadow:0 8px 24px rgba(0,0,0,.18);opacity:0;pointer-events:none;transition:.12s}
      #${IDS.dock} .fg-tool:hover .fg-tip{opacity:1}
      #${IDS.ring}{position:fixed;z-index:2147483639;pointer-events:none;border:2px solid transparent;border-radius:20px;background:linear-gradient(transparent,transparent) padding-box,linear-gradient(120deg,#ff3f59 0%,#ff3f59 38%,#7b58ff 74%,#4a7cff 100%) border-box;box-shadow:0 0 0 1px rgba(255,63,89,.08),0 0 20px rgba(123,88,255,.18);transition:opacity .16s,transform .16s;opacity:0}
      #${IDS.ring}.visible{opacity:1}
      #${IDS.badge}{position:fixed;z-index:2147483640;pointer-events:none;padding:5px 9px;border-radius:999px;background:linear-gradient(100deg,#172036,#22355f);border:1px solid rgba(93,160,255,.32);color:#eef5ff;font:800 9px/1 system-ui;letter-spacing:.04em;box-shadow:0 6px 18px rgba(0,0,0,.2);opacity:0;transition:.15s}
      #${IDS.badge}.visible{opacity:1}
      #${IDS.toast}{position:fixed;right:92px;bottom:100px;z-index:2147483647;max-width:330px;padding:10px 12px;border-radius:12px;background:rgba(13,17,25,.97);border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 46px rgba(0,0,0,.3);color:#eef2f9;font:600 11px/1.45 system-ui;opacity:0;transform:translateY(8px);pointer-events:none;transition:.16s;white-space:pre-wrap}
      #${IDS.toast}.visible{opacity:1;transform:translateY(0)}
      #${IDS.toast}.working{border-color:rgba(123,88,255,.35)}
      #${IDS.toast}.error{border-color:rgba(255,63,89,.34);color:#ffc0c8}
      #${IDS.imageChip}{position:fixed;z-index:2147483641;pointer-events:none;padding:5px 8px;border-radius:999px;background:rgba(123,88,255,.11);border:1px solid rgba(123,88,255,.25);color:#d7cfff;font:700 9px/1 system-ui;opacity:0;transition:.15s}
      #${IDS.imageChip}.visible{opacity:1}
      @keyframes fgPulse{0%{opacity:.7;transform:scale(.88)}80%,100%{opacity:0;transform:scale(1.25)}}
      @media(max-width:760px){#${IDS.bubble}{right:14px;bottom:82px}#${IDS.dock}{right:19px;bottom:150px}#${IDS.toast}{right:78px;bottom:91px;max-width:min(300px,70vw)}}
    `;
    document.documentElement.appendChild(style);
  }

  function isVisible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 20 && r.height > 20;
  }

  function findChatInput() {
    const selectors = [
      'form#chat-input div[contenteditable="true"][aria-label="Chat input"]',
      '#chatinput div[contenteditable="true"][aria-label="Chat input"]',
      'textarea[placeholder*="Pergunte" i]',
      'textarea[placeholder*="Ask Lovable" i]',
      'textarea[placeholder*="build a web app" i]',
      'textarea[placeholder*="analyze my data" i]',
      'div[aria-label="Chat input"]',
      'div[role="textbox"][contenteditable="true"]',
      'textarea',
    ];
    for (const selector of selectors) {
      const node = [...document.querySelectorAll(selector)].find(isVisible);
      if (node) return node;
    }
    return null;
  }

  function composerRoot(input) {
    return input?.closest('form#chat-input') || input?.closest('form') || input?.closest('#chatinput') || input?.parentElement?.parentElement || input?.parentElement || null;
  }

  function findSendButton(input) {
    const selectors = [
      'button#chatinput-send-message-button',
      'form#chat-input button[type="submit"]',
      'button[data-testid*="send-message"]',
      'button[data-testid*="send"]',
      'button[aria-label*="Send" i]',
      'button[aria-label*="Enviar" i]',
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const button = node?.closest?.('button') || node;
      if (button && isVisible(button)) return button;
    }
    const root = composerRoot(input);
    if (!root) return null;
    return [...root.querySelectorAll('button')].find((b) => {
      if (!isVisible(b)) return false;
      const label = `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''} ${b.getAttribute('data-testid') || ''}`.toLowerCase();
      return label.includes('send') || label.includes('enviar');
    }) || null;
  }

  function readInput(input) {
    if (!input) return '';
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) return input.value || '';
    return input.innerText || input.textContent || '';
  }

  function setInput(input, value) {
    if (!input) return;
    input.focus();
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      const proto = Object.getPrototypeOf(input);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc?.set) desc.set.call(input, value);
      else input.value = value;
    } else {
      try {
        input.textContent = '';
        if (value) document.execCommand('insertText', false, value);
      } catch { input.textContent = value; }
    }
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function ensureBubble() {
    if (document.getElementById(IDS.bubble)) return;
    const bubble = document.createElement('button');
    bubble.id = IDS.bubble;
    bubble.type = 'button';
    bubble.setAttribute('aria-label', 'FG AI');
    bubble.innerHTML = '<span class="fg-logo">FG</span><span class="fg-dot"></span>';
    bubble.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      dockOpen = !dockOpen;
      document.getElementById(IDS.dock)?.classList.toggle('open', dockOpen);
    });
    document.documentElement.appendChild(bubble);

    const dock = document.createElement('div');
    dock.id = IDS.dock;
    dock.innerHTML = `
      <button class="fg-tool" data-view="settings" data-kind="license">FG<span class="fg-tip">Licença e conta</span></button>
      <button class="fg-tool" data-view="settings" data-kind="github">GH<span class="fg-tip">GitHub</span></button>
      <button class="fg-tool" data-view="settings" data-kind="supabase">S<span class="fg-tip">Supabase</span></button>
      <button class="fg-tool" data-view="history" data-kind="history">◷<span class="fg-tip">Histórico</span></button>
      <button class="fg-tool" data-view="chat" data-kind="panel">▣<span class="fg-tip">Painel lateral</span></button>
      <button class="fg-tool power" data-kind="power">⏻<span class="fg-tip">Ativar / desativar</span></button>
    `;
    dock.addEventListener('click', async (event) => {
      const button = event.target.closest('.fg-tool');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const kind = button.dataset.kind;
      if (kind === 'power') {
        extensionEnabled = !extensionEnabled;
        await chrome.storage.local.set({ ferrolExtensionEnabled: extensionEnabled });
        updateStateUi();
        return;
      }
      const view = button.dataset.view || 'chat';
      await openSidePanel(view);
    });
    document.documentElement.appendChild(dock);

    const ring = document.createElement('div');
    ring.id = IDS.ring;
    document.documentElement.appendChild(ring);
    const badge = document.createElement('div');
    badge.id = IDS.badge;
    badge.textContent = '● FG ATIVO';
    document.documentElement.appendChild(badge);
    const toast = document.createElement('div');
    toast.id = IDS.toast;
    document.documentElement.appendChild(toast);
    const chip = document.createElement('div');
    chip.id = IDS.imageChip;
    chip.textContent = 'Imagem pronta para o FG AI';
    document.documentElement.appendChild(chip);
  }

  async function openSidePanel(view = 'chat') {
    if (!runtimeAlive()) return;
    await chrome.storage.local.set({ ferrolSidepanelView: view === 'chat' ? null : view });
    try {
      const response = await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', view });
      if (!response?.ok) throw new Error(response?.error || 'Não foi possível abrir o painel.');
    } catch (error) {
      showToast(error.message || 'Recarregue a página para reativar o FG AI.', 'error', 3500);
    }
  }

  function showToast(text, kind = 'info', ms = 0) {
    const toast = document.getElementById(IDS.toast);
    if (!toast) return;
    toast.textContent = String(text || '');
    toast.className = `${kind === 'working' ? 'working' : kind === 'error' ? 'error' : ''} visible`.trim();
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => toast.classList.remove('visible'), ms);
  }

  function updateOverlays() {
    const input = findChatInput();
    const root = composerRoot(input);
    const ring = document.getElementById(IDS.ring);
    const badge = document.getElementById(IDS.badge);
    const chip = document.getElementById(IDS.imageChip);
    const active = extensionEnabled && nativeMode && hasSession && root && isVisible(root);
    if (!active) {
      ring?.classList.remove('visible');
      badge?.classList.remove('visible');
      chip?.classList.remove('visible');
      return;
    }
    const rect = root.getBoundingClientRect();
    const pad = 4;
    Object.assign(ring.style, { left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px`, borderRadius: `${Math.max(16, parseFloat(getComputedStyle(root).borderRadius) || 18)}px` });
    ring.classList.add('visible');
    Object.assign(badge.style, { left: `${Math.max(8, rect.right - 82)}px`, top: `${Math.max(6, rect.top - 29)}px` });
    badge.classList.add('visible');
    if (pastedImage) {
      Object.assign(chip.style, { left: `${Math.max(8, rect.left + 8)}px`, top: `${Math.max(6, rect.top - 27)}px` });
      chip.classList.add('visible');
    } else chip.classList.remove('visible');
  }

  function updateStateUi() {
    const bubble = document.getElementById(IDS.bubble);
    const power = document.querySelector(`#${IDS.dock} .fg-tool.power`);
    if (bubble) bubble.dataset.on = String(extensionEnabled);
    if (power) power.dataset.on = String(extensionEnabled);
    updateOverlays();
  }

  async function refreshStoredState() {
    if (!runtimeAlive()) return;
    const stored = await chrome.storage.local.get(['ferrolNativeLovableMode','ferrolExtensionEnabled','ferrolSession']);
    nativeMode = typeof stored.ferrolNativeLovableMode === 'boolean' ? stored.ferrolNativeLovableMode : true;
    extensionEnabled = typeof stored.ferrolExtensionEnabled === 'boolean' ? stored.ferrolExtensionEnabled : true;
    hasSession = Boolean(stored.ferrolSession?.access_token);
    updateStateUi();
  }

  function projectNameFromPage() {
    const title = String(document.title || '').replace(/\s*[|·-]\s*Lovable.*$/i, '').trim();
    if (title && !/lovable/i.test(title) && title.length < 90) return title;
    const candidates = [
      '[data-testid*="project-name"]',
      'header h1',
      'header h2',
      'nav [class*="project"]',
    ];
    for (const selector of candidates) {
      const el = [...document.querySelectorAll(selector)].find(isVisible);
      const text = String(el?.textContent || '').trim();
      if (text && text.length < 90 && !/lovable/i.test(text)) return text;
    }
    return '';
  }

  async function saveContext() {
    if (!runtimeAlive()) return;
    const projectName = projectNameFromPage();
    await chrome.storage.local.set({ ferrolLovableContext: { projectName, url: location.href, ts: Date.now() } });
  }

  function eventContext(target) {
    const input = findChatInput();
    const root = composerRoot(input);
    if (!input || !root) return null;
    if (target === input || root.contains(target)) return { input, root };
    return null;
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function capturePastedImage(event) {
    if (!(extensionEnabled && nativeMode && hasSession)) return;
    const item = [...(event.clipboardData?.items || [])].find((x) => x.kind === 'file' && x.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('A imagem precisa ter no máximo 5 MB.', 'error', 3000);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pastedImage = { name: file.name || `captura-${Date.now()}.png`, dataUrl: await fileToDataUrl(file) };
    updateOverlays();
  }

  async function sendThroughFg(input) {
    if (!(extensionEnabled && nativeMode && hasSession) || sending) return;
    if (!runtimeAlive()) {
      showToast('FG AI foi atualizado. Recarregue a página.', 'error', 3500);
      return;
    }
    const prompt = readInput(input).trim();
    if (!prompt && !pastedImage) return;
    sending = true;
    const image = pastedImage;
    pastedImage = null;
    updateOverlays();
    setInput(input, '');
    showToast('FG AI analisando...', 'working');
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FERROL_NATIVE_SEND',
        prompt: prompt || 'Analise a imagem anexada e faça a alteração adequada no projeto.',
        image_data_url: image?.dataUrl || null,
      });
      if (!response?.ok) throw new Error(response?.error || 'Falha no agente.');
      if ((response.changes || []).length) showToast('Concluído.', 'info', 2500);
      else showToast(response.message || 'Concluído.', 'info', 7000);
    } catch (error) {
      const message = String(error?.message || error || 'Falha no agente.');
      if (/Extension context invalidated/i.test(message)) {
        extensionEnabled = false;
        updateStateUi();
        showToast('FG AI foi atualizado. Recarregue a página.', 'error', 4000);
      } else showToast(message, 'error', 5500);
    } finally {
      sending = false;
    }
  }

  document.addEventListener('paste', (event) => {
    const ctx = eventContext(event.target);
    if (!ctx) return;
    capturePastedImage(event).catch(() => {});
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!(extensionEnabled && nativeMode && hasSession) || sending || event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    const ctx = eventContext(event.target);
    if (!ctx) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sendThroughFg(ctx.input);
  }, true);

  document.addEventListener('click', (event) => {
    if (!(extensionEnabled && nativeMode && hasSession) || sending) return;
    const input = findChatInput();
    const send = findSendButton(input);
    if (!input || !send || !(event.target === send || send.contains(event.target))) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sendThroughFg(input);
  }, true);

  document.addEventListener('submit', (event) => {
    if (!(extensionEnabled && nativeMode && hasSession) || sending) return;
    const input = findChatInput();
    const form = input?.closest('form');
    if (!input || !form || event.target !== form) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sendThroughFg(input);
  }, true);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.ferrolNativeLovableMode) nativeMode = Boolean(changes.ferrolNativeLovableMode.newValue);
    if (changes.ferrolExtensionEnabled) extensionEnabled = Boolean(changes.ferrolExtensionEnabled.newValue);
    if (changes.ferrolSession) hasSession = Boolean(changes.ferrolSession.newValue?.access_token);
    updateStateUi();
  });

  cleanupLegacy();
  injectStyle();
  ensureBubble();
  refreshStoredState().catch(() => {});
  saveContext().catch(() => {});
  setInterval(updateOverlays, 500);
  setInterval(() => saveContext().catch(() => {}), 5000);
  window.addEventListener('resize', updateOverlays);
  window.addEventListener('scroll', updateOverlays, true);
})();
