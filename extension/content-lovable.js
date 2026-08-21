(() => {
  if (window.__ferrolAiLovableV07) return;
  window.__ferrolAiLovableV07 = true;

  let nativeMode = true;
  let nativeSending = false;
  let pastedImage = null;
  let micRecorder = null;
  let micStream = null;
  let micChunks = [];

  const STYLE_ID = 'ferrol-ai-lovable-v07-style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #ferrol-ai-native-toggle{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 10px;border:1px solid rgba(124,92,255,.22);border-radius:10px;background:rgba(20,18,30,.94);color:#e9e6ff;font:700 11px/1 system-ui;cursor:pointer;white-space:nowrap;transition:.15s ease;margin:2px;box-shadow:0 8px 22px rgba(0,0,0,.10)}
      #ferrol-ai-native-toggle:hover{transform:translateY(-1px);border-color:rgba(124,92,255,.45)}
      #ferrol-ai-native-toggle[data-active="true"]{background:linear-gradient(135deg,rgba(33,23,55,.98),rgba(47,30,78,.98));border-color:rgba(124,92,255,.48)}
      #ferrol-ai-native-toggle .fai-dot{width:7px;height:7px;border-radius:50%;background:#677084}
      #ferrol-ai-native-toggle[data-active="true"] .fai-dot{background:#42df86;box-shadow:0 0 10px rgba(66,223,134,.7)}
      #ferrol-ai-native-status{position:absolute;left:14px;right:14px;bottom:calc(100% + 10px);z-index:999999;background:rgba(12,14,20,.97);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:11px 12px;color:#e9eef9;font:500 12px/1.45 system-ui;box-shadow:0 18px 40px rgba(0,0,0,.25);display:none;white-space:pre-wrap}
      #ferrol-ai-native-status.visible{display:block}
      #ferrol-ai-native-status .fai-status-head{display:flex;align-items:center;gap:7px;color:#9ba7c0;font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px}
      #ferrol-ai-native-status .fai-status-dot{width:6px;height:6px;border-radius:50%;background:#7c5cff}
      #ferrol-ai-native-status.working .fai-status-dot{animation:faiPulse 1s infinite}
      #ferrol-ai-native-status.error{border-color:rgba(255,82,97,.25);color:#ffc1c7}
      #ferrol-ai-paste-chip{display:none;align-items:center;gap:6px;border:1px solid rgba(124,92,255,.22);background:rgba(124,92,255,.08);color:#cfc8ff;border-radius:999px;padding:5px 9px;font:600 10px/1 system-ui;margin:2px}
      #ferrol-ai-paste-chip.visible{display:inline-flex}
      @keyframes faiPulse{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}
    `;
    document.documentElement.appendChild(style);
  }

  function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function findChatInput() {
    const selectors = [
      'form#chat-input div[contenteditable="true"][aria-label="Chat input"]',
      '#chatinput div[contenteditable="true"][aria-label="Chat input"]',
      'textarea[placeholder*="Pergunte" i]',
      'textarea[placeholder*="Ask Lovable" i]',
      'textarea[placeholder*="build a web app" i]',
      'div[aria-label="Chat input"]',
      'div[role="textbox"]',
      '[contenteditable="true"]',
      'textarea',
    ];
    for (const selector of selectors) {
      const node = [...document.querySelectorAll(selector)].find((el) => {
        if (!isVisible(el)) return false;
        if (el.tagName === 'TEXTAREA') return true;
        if (el.isContentEditable) return true;
        return (el.getAttribute('role') || '').toLowerCase() === 'textbox';
      });
      if (node) return node;
    }
    return null;
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
    const form = input?.closest('form');
    if (form) {
      const buttons = [...form.querySelectorAll('button')].filter(isVisible);
      return buttons.find((b) => {
        const label = `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''} ${b.getAttribute('data-testid') || ''}`.toLowerCase();
        return label.includes('send') || label.includes('enviar');
      }) || null;
    }
    return null;
  }

  function composerRoot(input) {
    return input?.closest('form#chat-input') || input?.closest('form') || input?.closest('#chatinput') || input?.parentElement?.parentElement || input?.parentElement || null;
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
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor?.set) descriptor.set.call(input, value);
      else input.value = value;
    } else {
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('delete', false);
        if (value) document.execCommand('insertText', false, value);
      } catch {
        input.textContent = value;
      }
    }
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function ensureUi() {
    const input = findChatInput();
    if (!input) return;
    const root = composerRoot(input);
    if (!root) return;

    if (getComputedStyle(root).position === 'static') root.style.position = 'relative';

    let toggle = document.getElementById('ferrol-ai-native-toggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'ferrol-ai-native-toggle';
      toggle.type = 'button';
      toggle.innerHTML = '<span class="fai-dot"></span><span>Ferrol AI</span>';
      toggle.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        nativeMode = !nativeMode;
        await chrome.storage.local.set({ ferrolNativeLovableMode: nativeMode });
        updateToggle();
        showStatus(nativeMode ? 'Modo Ferrol ativo. As mensagens deste campo vão para o seu agente.' : 'Modo Ferrol pausado. O chat voltou ao comportamento normal do Lovable.', 'info', 2600);
      });

      const sendButton = findSendButton(input);
      const target = sendButton?.parentElement || root;
      target.appendChild(toggle);
    }

    if (!document.getElementById('ferrol-ai-paste-chip')) {
      const chip = document.createElement('span');
      chip.id = 'ferrol-ai-paste-chip';
      chip.textContent = 'Imagem pronta para o Ferrol AI';
      toggle.parentElement?.insertBefore(chip, toggle);
    }

    if (!document.getElementById('ferrol-ai-native-status')) {
      const card = document.createElement('div');
      card.id = 'ferrol-ai-native-status';
      card.innerHTML = '<div class="fai-status-head"><span class="fai-status-dot"></span><span>Ferrol AI</span></div><div class="fai-status-text"></div>';
      root.appendChild(card);
    }

    updateToggle();
  }

  function updateToggle() {
    const toggle = document.getElementById('ferrol-ai-native-toggle');
    if (!toggle) return;
    toggle.dataset.active = String(nativeMode);
    toggle.title = nativeMode ? 'Ferrol AI ativo neste chat' : 'Clique para usar o Ferrol AI neste chat';
  }

  let statusTimer = null;
  function showStatus(text, kind = 'info', ms = 0) {
    ensureUi();
    const card = document.getElementById('ferrol-ai-native-status');
    if (!card) return;
    card.className = `visible ${kind === 'working' ? 'working' : kind === 'error' ? 'error' : ''}`.trim();
    const body = card.querySelector('.fai-status-text');
    if (body) body.textContent = text;
    clearTimeout(statusTimer);
    if (ms) statusTimer = setTimeout(() => card.classList.remove('visible'), ms);
  }

  function updatePasteChip() {
    const chip = document.getElementById('ferrol-ai-paste-chip');
    if (!chip) return;
    chip.classList.toggle('visible', Boolean(pastedImage));
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
    if (!nativeMode) return;
    const items = [...(event.clipboardData?.items || [])];
    const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    const file = imageItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    if (file.size > 5 * 1024 * 1024) {
      showStatus('A imagem do Ctrl+V precisa ter no máximo 5 MB.', 'error', 3500);
      return;
    }
    try {
      pastedImage = { name: file.name || `captura-${Date.now()}.png`, dataUrl: await fileToDataUrl(file) };
      ensureUi();
      updatePasteChip();
    } catch {}
  }

  async function sendThroughFerrol(input) {
    if (!nativeMode || nativeSending) return;
    const prompt = readInput(input).trim();
    if (!prompt && !pastedImage) return;

    nativeSending = true;
    const image = pastedImage;
    pastedImage = null;
    updatePasteChip();
    setInput(input, '');
    showStatus('Analisando seu pedido…', 'working');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FERROL_NATIVE_SEND',
        prompt: prompt || 'Analise a imagem anexada e faça a alteração adequada no projeto.',
        image_data_url: image?.dataUrl || null,
      });
      if (!response?.ok) throw new Error(response?.error || 'Falha no agente.');
      showStatus(response.message || 'Concluído.', 'info', 12000);
    } catch (error) {
      showStatus(`Falha: ${error?.message || error}`, 'error', 7000);
    } finally {
      nativeSending = false;
    }
  }

  function isOurComposerEventTarget(target) {
    const input = findChatInput();
    if (!input) return null;
    const root = composerRoot(input);
    if (!root) return null;
    if (target === input || root.contains(target)) return { input, root };
    return null;
  }

  document.addEventListener('paste', (event) => {
    const ctx = isOurComposerEventTarget(event.target);
    if (!ctx) return;
    capturePastedImage(event);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!nativeMode || nativeSending || event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    const ctx = isOurComposerEventTarget(event.target);
    if (!ctx) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sendThroughFerrol(ctx.input);
  }, true);

  document.addEventListener('click', (event) => {
    if (!nativeMode || nativeSending) return;
    const input = findChatInput();
    if (!input) return;
    const send = findSendButton(input);
    if (!send || !(event.target === send || send.contains(event.target))) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sendThroughFerrol(input);
  }, true);

  document.addEventListener('submit', (event) => {
    if (!nativeMode || nativeSending) return;
    const input = findChatInput();
    if (!input) return;
    const form = input.closest('form');
    if (!form || event.target !== form) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sendThroughFerrol(input);
  }, true);

  async function startMic() {
    if (micRecorder?.state === 'recording') return { ok: true, recording: true };
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error('Gravação de áudio não disponível nesta página.');
    }
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    const mimeType = preferred.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    micRecorder = mimeType ? new MediaRecorder(micStream, { mimeType }) : new MediaRecorder(micStream);
    micChunks = [];
    micRecorder.ondataavailable = (e) => { if (e.data?.size) micChunks.push(e.data); };
    micRecorder.start(250);
    return { ok: true, recording: true };
  }

  async function stopMic() {
    if (!micRecorder || micRecorder.state !== 'recording') throw new Error('Nenhuma gravação em andamento.');
    return new Promise((resolve, reject) => {
      const recorder = micRecorder;
      recorder.onstop = async () => {
        try {
          micStream?.getTracks().forEach((t) => t.stop());
          const blob = new Blob(micChunks, { type: recorder.mimeType || 'audio/webm' });
          if (!blob.size) throw new Error('A gravação ficou vazia.');
          const dataUrl = await fileToDataUrl(blob);
          micRecorder = null;
          micStream = null;
          micChunks = [];
          resolve({ ok: true, audio_data_url: dataUrl });
        } catch (e) { reject(e); }
      };
      recorder.stop();
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'FERROL_MIC_START') {
      startMic().then(sendResponse).catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }
    if (message?.type === 'FERROL_MIC_STOP') {
      stopMic().then(sendResponse).catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }
    if (message?.type === 'FERROL_NATIVE_MODE_SET') {
      nativeMode = Boolean(message.active);
      updateToggle();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  function findPreviewUrl() {
    const iframeUrls = [...document.querySelectorAll('iframe[src]')].map((iframe) => iframe.src).filter(Boolean);
    return iframeUrls.find((src) => /lovable\.app|lovableproject\.com|vercel\.app/i.test(src)) || '';
  }

  function readContext() {
    const title = document.title || '';
    const url = location.href;
    const projectId = url.match(/\/projects\/([^/?#]+)/)?.[1] || '';
    let projectName = title.split('|')[0].trim();
    if (!projectName || /^lovable$/i.test(projectName)) projectName = '';
    chrome.storage.local.set({
      ferrolLovableContext: {
        url,
        title,
        projectId,
        projectName,
        previewUrl: findPreviewUrl(),
        updatedAt: Date.now(),
      },
    });
  }

  async function initMode() {
    const stored = await chrome.storage.local.get('ferrolNativeLovableMode');
    nativeMode = typeof stored.ferrolNativeLovableMode === 'boolean' ? stored.ferrolNativeLovableMode : true;
    ensureUi();
  }

  function sync() {
    ensureUi();
    readContext();
  }

  initMode();
  sync();
  setInterval(sync, 1800);
  new MutationObserver(sync).observe(document.documentElement, { subtree: true, childList: true });
})();
