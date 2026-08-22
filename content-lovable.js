(() => {
  if (window.__fgAiLovableV11) return;
  window.__fgAiLovableV11 = true;

  let extensionEnabled = true;
  let nativeMode = true;
  let hasSession = false;
  let sending = false;
  let attachments = [];
  let dockOpen = false;
  let toastTimer = null;
  let projectState = null;
  let lastGithubWarning = '';

  const IDS = {
    style: 'fg-ai-v11-style', bubble: 'fg-ai-bubble', dock: 'fg-ai-dock', ring: 'fg-ai-native-ring',
    badge: 'fg-ai-native-badge', toast: 'fg-ai-toast', attachmentChip: 'fg-ai-attachment-chip', history: 'fg-ai-history-chat',
  };

  function runtimeAlive() { try { return Boolean(chrome?.runtime?.id); } catch { return false; } }
  function cleanupLegacy() {
    ['ferrol-ai-native-toggle','ferrol-ai-native-status','ferrol-ai-paste-chip','ferrol-ai-lovable-v07-style','fg-ai-v10-style','fg-ai-history-chat'].forEach((id) => document.getElementById(id)?.remove());
  }

  function injectStyle() {
    if (document.getElementById(IDS.style)) return;
    const style = document.createElement('style');
    style.id = IDS.style;
    style.textContent = `
      #${IDS.bubble}{position:fixed;right:24px;bottom:92px;z-index:2147483646;width:58px;height:58px;border:1px solid rgba(255,255,255,.2);border-radius:50%;background:radial-gradient(circle at 30% 25%,#3e4654 0 7%,#161b24 34%,#06080c 74%);box-shadow:0 18px 42px rgba(0,0,0,.34),0 0 0 3px rgba(255,43,67,.08),0 0 26px rgba(255,43,67,.18);display:grid;place-items:center;cursor:pointer;user-select:none;transition:.16s;color:#fff;font:950 13px/1 system-ui}
      #${IDS.bubble}:hover{transform:translateY(-2px) scale(1.035)}#${IDS.bubble}[data-on="true"]:before{content:"";position:absolute;inset:-7px;border-radius:50%;border:2px solid rgba(255,44,68,.38);animation:fgPulse 1.8s ease-out infinite}#${IDS.bubble}[data-on="false"]{filter:saturate(.2);opacity:.7}
      #${IDS.bubble} .fg-logo{width:43px;height:43px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#161b23,#06070a);border:1px solid rgba(255,255,255,.12);color:#fff;font-style:italic;text-shadow:2px 1px 0 #d71935}#${IDS.bubble} .fg-dot{position:absolute;right:0;bottom:3px;width:11px;height:11px;border-radius:50%;background:#39d77a;border:2px solid #0a0d12}
      #${IDS.dock}{position:fixed;right:29px;bottom:160px;z-index:2147483645;display:flex;flex-direction:column;align-items:center;gap:7px;padding:8px 6px;border-radius:25px;background:linear-gradient(180deg,rgba(8,12,18,.97),rgba(15,23,34,.95));border:1px solid rgba(255,255,255,.11);box-shadow:0 20px 48px rgba(0,0,0,.32);backdrop-filter:blur(18px);transform:translateY(10px) scale(.96);opacity:0;pointer-events:none;transition:.15s}#${IDS.dock}.open{transform:none;opacity:1;pointer-events:auto}
      #${IDS.dock} .fg-tool{position:relative;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:linear-gradient(145deg,#102033,#09121d);color:#eef5ff;display:grid;place-items:center;cursor:pointer;font:850 10px/1 system-ui;box-shadow:inset 0 0 0 1px rgba(74,124,255,.05),0 7px 17px rgba(0,0,0,.18)}#${IDS.dock} .fg-tool:hover{border-color:rgba(92,155,255,.45);box-shadow:0 0 18px rgba(74,124,255,.16)}#${IDS.dock} .fg-tool.supa{color:#60e6ab}#${IDS.dock} .fg-tool.power{background:#0c4d31;color:#8ff0b7;border-color:rgba(57,215,122,.28)}#${IDS.dock} .fg-tip{position:absolute;right:50px;top:50%;transform:translateY(-50%);padding:7px 9px;border-radius:9px;background:#fff;color:#203047;white-space:nowrap;font:650 11px/1 system-ui;box-shadow:0 8px 24px rgba(0,0,0,.18);opacity:0;pointer-events:none;transition:.12s}#${IDS.dock} .fg-tool:hover .fg-tip{opacity:1}
      #${IDS.ring}{position:fixed;z-index:2147483639;pointer-events:none;border:2px solid transparent;border-radius:20px;background:linear-gradient(transparent,transparent) padding-box,linear-gradient(110deg,#ff2846,#ff2846 34%,#8b54ff 72%,#4a7cff) border-box;box-shadow:0 0 22px rgba(123,88,255,.2);opacity:0;transition:.14s}#${IDS.ring}.visible{opacity:1}
      #${IDS.badge}{position:fixed;z-index:2147483640;pointer-events:none;padding:5px 9px;border-radius:999px;background:#101722;border:1px solid rgba(57,215,122,.24);color:#eaf7ef;font:800 9px/1 system-ui;letter-spacing:.03em;box-shadow:0 6px 18px rgba(0,0,0,.2);opacity:0;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#${IDS.badge}.visible{opacity:1}#${IDS.badge}.warn{border-color:rgba(255,191,91,.38);color:#ffd89b}
      #${IDS.toast}{position:fixed;right:92px;bottom:100px;z-index:2147483647;max-width:360px;padding:11px 13px;border-radius:13px;background:rgba(9,13,20,.98);border:1px solid rgba(255,255,255,.11);box-shadow:0 18px 46px rgba(0,0,0,.34);color:#eef3fb;font:650 11px/1.5 system-ui;opacity:0;transform:translateY(8px);pointer-events:none;transition:.15s;white-space:pre-wrap}#${IDS.toast}.visible{opacity:1;transform:none}#${IDS.toast}.working{border-color:rgba(123,88,255,.38)}#${IDS.toast}.error{border-color:rgba(255,63,89,.38);color:#ffc0c8}
      #${IDS.attachmentChip}{position:fixed;z-index:2147483641;pointer-events:none;padding:5px 8px;border-radius:999px;background:#111827;border:1px solid rgba(123,88,255,.3);color:#d9d2ff;font:750 9px/1 system-ui;opacity:0}#${IDS.attachmentChip}.visible{opacity:1}
      #${IDS.history}{position:fixed;right:92px;bottom:92px;width:min(380px,calc(100vw - 120px));height:min(560px,calc(100vh - 140px));z-index:2147483647;border:1px solid rgba(255,255,255,.11);border-radius:20px;background:radial-gradient(circle at 100% 0,rgba(123,88,255,.09),transparent 34%),#080b11;box-shadow:0 28px 70px rgba(0,0,0,.42);display:none;flex-direction:column;overflow:hidden;color:#f6f8fb;font-family:Inter,system-ui,sans-serif}#${IDS.history}.open{display:flex}
      #${IDS.history} .fh-head{display:flex;align-items:center;justify-content:space-between;padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.07)}#${IDS.history} .fh-title{display:flex;align-items:center;gap:9px}#${IDS.history} .fh-mark{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(145deg,#2b1835,#171323);border:1px solid rgba(255,255,255,.1);font:900 10px system-ui}#${IDS.history} .fh-title strong{display:block;font-size:12px}#${IDS.history} .fh-title small{display:block;font-size:8px;color:#77839a;margin-top:2px;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#${IDS.history} .fh-actions{display:flex;gap:6px}#${IDS.history} .fh-btn{width:31px;height:31px;border-radius:10px;border:1px solid #202a39;background:#101620;color:#cdd5e3;cursor:pointer}
      #${IDS.history} .fh-messages{flex:1;min-height:0;overflow:auto;padding:14px 12px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin;scrollbar-color:#2a3445 transparent}#${IDS.history} .fh-empty{margin:auto;color:#7f8ba0;font-size:10px;text-align:center;max-width:240px;line-height:1.5}#${IDS.history} .fh-msg{display:flex;flex-direction:column;gap:3px;max-width:88%}#${IDS.history} .fh-msg.user{align-self:flex-end;align-items:flex-end}#${IDS.history} .fh-msg.assistant{align-self:flex-start}#${IDS.history} .fh-role{font-size:7px;color:#6d7990;letter-spacing:.14em;text-transform:uppercase}#${IDS.history} .fh-bubble{padding:9px 11px;border-radius:14px;background:#101722;border:1px solid #202b3c;font-size:10px;line-height:1.52;white-space:pre-wrap;overflow-wrap:anywhere}#${IDS.history} .fh-msg.user .fh-bubble{background:linear-gradient(135deg,#641a2d,#3e1422);border-color:rgba(255,63,89,.28)}
      #${IDS.history} .fh-compose{padding:10px;border-top:1px solid rgba(255,255,255,.07);background:#090d13}#${IDS.history} .fh-composebox{border:1px solid #263145;border-radius:14px;background:#0d131c;padding:8px}#${IDS.history} textarea{width:100%;height:58px;resize:none;background:transparent;border:0;outline:0;color:#f5f7fb;font:11px/1.5 system-ui}#${IDS.history} .fh-sendrow{display:flex;justify-content:space-between;align-items:center;gap:8px}#${IDS.history} .fh-note{font-size:8px;color:#6e7a90}#${IDS.history} .fh-send{border:0;border-radius:10px;padding:8px 13px;background:linear-gradient(110deg,#ff304c,#db2146 68%,#7b58ff);color:white;font:850 10px system-ui;cursor:pointer}
      @keyframes fgPulse{0%{opacity:.72;transform:scale(.88)}80%,100%{opacity:0;transform:scale(1.25)}}@media(max-width:760px){#${IDS.bubble}{right:14px;bottom:82px}#${IDS.dock}{right:19px;bottom:150px}#${IDS.toast}{right:78px;bottom:91px;max-width:min(300px,70vw)}#${IDS.history}{right:78px;width:calc(100vw - 98px)}}
    `;
    document.documentElement.appendChild(style);
  }

  function isVisible(el) {
    if (!el) return false;
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 20 && r.height > 20;
  }

  function findChatInput() {
    const selectors = ['form#chat-input div[contenteditable="true"][aria-label="Chat input"]','#chatinput div[contenteditable="true"][aria-label="Chat input"]','textarea[placeholder*="Pergunte" i]','textarea[placeholder*="Ask Lovable" i]','textarea[placeholder*="build a web app" i]','textarea[placeholder*="analyze my data" i]','div[aria-label="Chat input"]','div[role="textbox"][contenteditable="true"]'];
    for (const selector of selectors) { const node = [...document.querySelectorAll(selector)].find(isVisible); if (node) return node; }
    return null;
  }
  function composerRoot(input) { return input?.closest('form#chat-input') || input?.closest('form') || input?.closest('#chatinput') || input?.parentElement?.parentElement || input?.parentElement || null; }
  function findSendButton(input) {
    const selectors = ['button#chatinput-send-message-button','form#chat-input button[type="submit"]','button[data-testid*="send-message"]','button[aria-label*="Send" i]','button[aria-label*="Enviar" i]'];
    for (const s of selectors) { const n = document.querySelector(s), b = n?.closest?.('button') || n; if (b && isVisible(b)) return b; }
    return null;
  }
  function readInput(input) { return input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement ? (input.value || '') : (input?.innerText || input?.textContent || ''); }
  function setInput(input, value) {
    if (!input) return; input.focus();
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value'); if (desc?.set) desc.set.call(input, value); else input.value = value;
    } else { input.textContent = ''; if (value) { try { document.execCommand('insertText', false, value); } catch { input.textContent = value; } } }
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function eventContext(target) { const input = findChatInput(), root = composerRoot(input); return input && root && (target === input || root.contains(target)) ? { input, root } : null; }
  function escapeHtml(v) { return String(v || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }

  function ensureUi() {
    if (document.getElementById(IDS.bubble)) return;
    const bubble = document.createElement('button'); bubble.id = IDS.bubble; bubble.type = 'button'; bubble.setAttribute('aria-label','FG AI'); bubble.innerHTML = '<span class="fg-logo">FG</span><span class="fg-dot"></span>';
    bubble.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); dockOpen = !dockOpen; document.getElementById(IDS.dock)?.classList.toggle('open', dockOpen); }); document.documentElement.appendChild(bubble);

    const dock = document.createElement('div'); dock.id = IDS.dock; dock.innerHTML = `
      <button class="fg-tool" data-kind="collapse">⌃<span class="fg-tip">Fechar menu</span></button>
      <button class="fg-tool" data-kind="github">GH<span class="fg-tip">GitHub</span></button>
      <button class="fg-tool supa" data-kind="supabase">S<span class="fg-tip">Supabase</span></button>
      <button class="fg-tool" data-kind="history">◷<span class="fg-tip">Conversa e histórico</span></button>
      <button class="fg-tool" data-kind="panel">▣<span class="fg-tip">Painel completo</span></button>
      <button class="fg-tool power" data-kind="power">⏻<span class="fg-tip">Ativar / desativar</span></button>`;
    dock.addEventListener('click', async (e) => {
      const b = e.target.closest('.fg-tool'); if (!b) return; e.preventDefault(); e.stopPropagation(); const kind = b.dataset.kind;
      if (kind === 'collapse') { dockOpen = false; dock.classList.remove('open'); return; }
      if (kind === 'power') { extensionEnabled = !extensionEnabled; await chrome.storage.local.set({ ferrolExtensionEnabled: extensionEnabled }); updateStateUi(); return; }
      if (kind === 'history') { await openHistoryChat(); return; }
      await openSidePanel(kind === 'panel' ? 'chat' : 'settings');
    }); document.documentElement.appendChild(dock);

    for (const id of [IDS.ring, IDS.badge, IDS.toast, IDS.attachmentChip]) { const el = document.createElement('div'); el.id = id; document.documentElement.appendChild(el); }
    document.getElementById(IDS.attachmentChip).textContent = 'Anexo pronto para FG AI';

    const history = document.createElement('div'); history.id = IDS.history; history.innerHTML = `
      <div class="fh-head"><div class="fh-title"><div class="fh-mark">FG</div><div><strong>FG AI</strong><small id="fg-history-project">Conversa do projeto</small></div></div><div class="fh-actions"><button class="fh-btn" id="fg-history-clear" title="Limpar">⌫</button><button class="fh-btn" id="fg-history-close">×</button></div></div>
      <div class="fh-messages" id="fg-history-messages"><div class="fh-empty">Carregando conversa...</div></div>
      <div class="fh-compose"><div class="fh-composebox"><textarea id="fg-history-input" placeholder="Pergunte ou peça uma alteração..."></textarea><div class="fh-sendrow"><span class="fh-note" id="fg-history-note">Enter envia para o agente</span><button class="fh-send" id="fg-history-send">Enviar</button></div></div></div>`;
    document.documentElement.appendChild(history);
    history.querySelector('#fg-history-close').addEventListener('click', () => history.classList.remove('open'));
    history.querySelector('#fg-history-clear').addEventListener('click', clearHistoryChat);
    history.querySelector('#fg-history-send').addEventListener('click', () => sendFromHistory());
    history.querySelector('#fg-history-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFromHistory(); } });
  }

  async function openSidePanel(view = 'chat') {
    if (!runtimeAlive()) return; await chrome.storage.local.set({ ferrolSidepanelView: view === 'chat' ? null : view });
    try { const r = await chrome.runtime.sendMessage({ type:'OPEN_SIDE_PANEL', view }); if (!r?.ok) throw new Error(r?.error || 'Não foi possível abrir o painel.'); }
    catch (e) { showToast(e.message || 'Recarregue a página.', 'error', 3500); }
  }
  function showToast(text, kind='info', ms=0) { const el = document.getElementById(IDS.toast); if (!el) return; el.textContent = String(text || ''); el.className = `${kind === 'working' ? 'working' : kind === 'error' ? 'error' : ''} visible`.trim(); clearTimeout(toastTimer); if (ms) toastTimer = setTimeout(() => el.classList.remove('visible'), ms); }

  async function refreshContextState(sync=false) {
    if (!runtimeAlive() || !hasSession) return;
    try {
      const data = await chrome.runtime.sendMessage({ type:'FG_CONTEXT_STATE', sync }); if (!data?.ok) throw new Error(data?.error || 'Falha ao identificar projeto.'); projectState = data;
      const badge = document.getElementById(IDS.badge);
      if (data.detectedProject) { badge.textContent = `● FG AI ATIVO · ${data.detectedProject.name}`; badge.classList.remove('warn'); }
      else if (data.context?.projectName) { badge.textContent = `● FG AI · ${data.context.projectName} · GitHub necessário`; badge.classList.add('warn'); if (lastGithubWarning !== data.context.projectName) { lastGithubWarning = data.context.projectName; showToast(`Projeto “${data.context.projectName}” detectado. Conecte/autorize o GitHub desse projeto para eu poder editar sem risco.`, 'error', 6000); } }
      else { badge.textContent = '● FG AI ATIVO'; badge.classList.remove('warn'); }
    } catch {}
  }

  function updateOverlays() {
    const input = findChatInput(), root = composerRoot(input), ring = document.getElementById(IDS.ring), badge = document.getElementById(IDS.badge), chip = document.getElementById(IDS.attachmentChip);
    const active = extensionEnabled && nativeMode && hasSession && root && isVisible(root);
    if (!active) { ring?.classList.remove('visible'); badge?.classList.remove('visible'); chip?.classList.remove('visible'); return; }
    const rect = root.getBoundingClientRect(), pad = 4; Object.assign(ring.style,{left:`${rect.left-pad}px`,top:`${rect.top-pad}px`,width:`${rect.width+pad*2}px`,height:`${rect.height+pad*2}px`,borderRadius:`${Math.max(16,parseFloat(getComputedStyle(root).borderRadius)||18)}px`}); ring.classList.add('visible');
    Object.assign(badge.style,{left:`${Math.max(8,rect.right-210)}px`,top:`${Math.max(6,rect.top-29)}px`}); badge.classList.add('visible');
    if (attachments.length) { chip.textContent = `${attachments.length} anexo${attachments.length > 1 ? 's' : ''} pronto${attachments.length > 1 ? 's' : ''} para FG AI`; Object.assign(chip.style,{left:`${Math.max(8,rect.left+8)}px`,top:`${Math.max(6,rect.top-28)}px`}); chip.classList.add('visible'); } else chip.classList.remove('visible');
  }
  function updateStateUi() { const b=document.getElementById(IDS.bubble), p=document.querySelector(`#${IDS.dock} .power`); if(b)b.dataset.on=String(extensionEnabled); if(p)p.dataset.on=String(extensionEnabled); updateOverlays(); }
  async function refreshStoredState() { if(!runtimeAlive())return; const s=await chrome.storage.local.get(['ferrolNativeLovableMode','ferrolExtensionEnabled','ferrolSession']); nativeMode=typeof s.ferrolNativeLovableMode==='boolean'?s.ferrolNativeLovableMode:true; extensionEnabled=typeof s.ferrolExtensionEnabled==='boolean'?s.ferrolExtensionEnabled:true; hasSession=Boolean(s.ferrolSession?.access_token); updateStateUi(); if(hasSession) refreshContextState(true); }

  function projectNameFromPage() {
    const title=String(document.title||'').replace(/\s*[|·-]\s*Lovable.*$/i,'').trim(); if(title && !/lovable/i.test(title) && title.length<100)return title;
    for(const selector of ['[data-testid*="project-name"]','header h1','header h2','nav [class*="project"]']){const el=[...document.querySelectorAll(selector)].find(isVisible), text=String(el?.textContent||'').trim(); if(text&&text.length<100&&!/lovable/i.test(text))return text;} return '';
  }
  async function saveContext() { if(!runtimeAlive())return; const projectName=projectNameFromPage(); const m=location.pathname.match(/\/projects\/([^/?#]+)/i); await chrome.storage.local.set({ferrolLovableContext:{projectName,lovableProjectId:m?.[1]||null,url:location.href,ts:Date.now()}}); }

  async function fileToDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result));r.onerror=rej;r.readAsDataURL(file);});}
  async function captureFile(file) {
    if (!file) return;
    if (file.type?.startsWith('image/')) { if(file.size>5*1024*1024){showToast('Imagem acima de 5 MB.','error',3000);return;} attachments.push({type:'image',name:file.name||`captura-${Date.now()}.png`,dataUrl:await fileToDataUrl(file)}); }
    else { if(file.size>900*1024){showToast('Arquivo acima de 900 KB.','error',3000);return;} const text=await file.text(); attachments.push({type:'text',name:file.name||'arquivo.txt',text:text.slice(0,120000)}); }
    attachments=attachments.slice(-8); updateOverlays();
  }

  function clearLovableAttachmentUi(root) {
    if (!root) return;
    const buttons=[...root.querySelectorAll('button')].filter((b)=>{const s=`${b.getAttribute('aria-label')||''} ${b.getAttribute('title')||''}`.toLowerCase(); return /remove attachment|remove image|remover anexo|remover imagem|excluir anexo/.test(s);});
    buttons.forEach((b)=>{try{b.click();}catch{}}); root.querySelectorAll('input[type="file"]').forEach((i)=>{try{i.value='';}catch{}});
  }

  async function sendThroughFg(input, customPrompt=null, fromHistory=false) {
    if (!(extensionEnabled&&nativeMode&&hasSession)||sending||!runtimeAlive()) return;
    const prompt=String(customPrompt ?? readInput(input)).trim(); if(!prompt&&!attachments.length)return;
    sending=true; const outgoing=attachments; attachments=[]; updateOverlays(); if(input)setInput(input,''); showToast('FG AI analisando...', 'working');
    try {
      const response=await chrome.runtime.sendMessage({type:'FERROL_NATIVE_SEND',prompt,attachments:outgoing}); if(!response?.ok)throw new Error(response?.error||'Falha no agente.');
      const root=composerRoot(input); clearLovableAttachmentUi(root); await refreshContextState(false);
      showToast(response.message || 'Concluído.', 'info', Math.max(3500,Math.min(8500,String(response.message||'').length*45)));
      if (fromHistory || document.getElementById(IDS.history)?.classList.contains('open')) await loadHistoryChat();
    } catch(e){showToast(String(e?.message||e||'Falha no agente.'),'error',6500); if(fromHistory)document.getElementById('fg-history-note').textContent=String(e?.message||'Falha no agente.');}
    finally{sending=false;}
  }

  async function loadHistoryChat() {
    const box=document.getElementById('fg-history-messages'), title=document.getElementById('fg-history-project'); if(!box)return; box.innerHTML='<div class="fh-empty">Carregando conversa...</div>';
    const data=await chrome.runtime.sendMessage({type:'FG_GET_HISTORY'}); if(!data?.ok){box.innerHTML=`<div class="fh-empty">${escapeHtml(data?.error||'Não foi possível carregar.')}</div>`;return;}
    title.textContent=data.project?.name?`${data.project.name} · ${data.project.repo||''}`:'Conversa do projeto'; box.innerHTML='';
    if(!data.messages?.length){box.innerHTML='<div class="fh-empty">Conversa vazia. Pergunte algo ou peça uma alteração abaixo.</div>';return;}
    for(const m of data.messages){const w=document.createElement('div');w.className=`fh-msg ${m.role}`;w.innerHTML=`<div class="fh-role">${m.role==='user'?'Você':'FG AI'}</div><div class="fh-bubble">${escapeHtml(m.content).replaceAll('\n','<br>')}</div>`;box.appendChild(w);} box.scrollTop=box.scrollHeight;
  }
  async function openHistoryChat(){document.getElementById(IDS.history)?.classList.add('open'); dockOpen=false; document.getElementById(IDS.dock)?.classList.remove('open'); await loadHistoryChat(); setTimeout(()=>document.getElementById('fg-history-input')?.focus(),80);}
  async function sendFromHistory(){const input=document.getElementById('fg-history-input');const text=input?.value.trim();if(!text||sending)return;input.value='';document.getElementById('fg-history-note').textContent='FG AI trabalhando...';await sendThroughFg(null,text,true);document.getElementById('fg-history-note').textContent='Enter envia para o agente';}
  async function clearHistoryChat(){if(!confirm('Limpar a conversa deste projeto?'))return;const r=await chrome.runtime.sendMessage({type:'FG_CLEAR_HISTORY'});if(!r?.ok){showToast(r?.error||'Falha ao limpar histórico.','error',4000);return;}await loadHistoryChat();showToast('Histórico limpo.','info',2500);}

  document.addEventListener('paste',(e)=>{const ctx=eventContext(e.target);if(!ctx||!(extensionEnabled&&nativeMode&&hasSession))return;const files=[...(e.clipboardData?.items||[])].filter((x)=>x.kind==='file').map((x)=>x.getAsFile()).filter(Boolean);files.forEach((f)=>captureFile(f).catch(()=>{}));},true);
  document.addEventListener('change',(e)=>{if(!(extensionEnabled&&nativeMode&&hasSession))return;const target=e.target;if(!(target instanceof HTMLInputElement)||target.type!=='file'||!target.files?.length)return;const input=findChatInput(),root=composerRoot(input);if(!root||!(root.contains(target)||target.closest('form')===root))return;[...target.files].forEach((f)=>captureFile(f).catch(()=>{}));},true);
  document.addEventListener('keydown',(e)=>{if(!(extensionEnabled&&nativeMode&&hasSession)||sending||e.key!=='Enter'||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey)return;const ctx=eventContext(e.target);if(!ctx)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();sendThroughFg(ctx.input);},true);
  document.addEventListener('click',(e)=>{if(!(extensionEnabled&&nativeMode&&hasSession)||sending)return;const input=findChatInput(),send=findSendButton(input);if(!input||!send||!(e.target===send||send.contains(e.target)))return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();sendThroughFg(input);},true);
  document.addEventListener('submit',(e)=>{if(!(extensionEnabled&&nativeMode&&hasSession)||sending)return;const input=findChatInput(),form=input?.closest('form');if(!input||!form||e.target!==form)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();sendThroughFg(input);},true);

  chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes.ferrolNativeLovableMode)nativeMode=Boolean(changes.ferrolNativeLovableMode.newValue);if(changes.ferrolExtensionEnabled)extensionEnabled=Boolean(changes.ferrolExtensionEnabled.newValue);if(changes.ferrolSession)hasSession=Boolean(changes.ferrolSession.newValue?.access_token);if(changes.ferrolLovableContext&&hasSession)refreshContextState(false);if(changes.ferrolNativeRefresh&&document.getElementById(IDS.history)?.classList.contains('open'))loadHistoryChat();updateStateUi();});

  cleanupLegacy();injectStyle();ensureUi();refreshStoredState().catch(()=>{});saveContext().catch(()=>{});
  let lastUrl=location.href;setInterval(()=>{updateOverlays();if(location.href!==lastUrl){lastUrl=location.href;saveContext().then(()=>refreshContextState(true)).catch(()=>{});}},500);
  setInterval(()=>saveContext().catch(()=>{}),4000);setInterval(()=>{if(hasSession)refreshContextState(false);},12000);
  window.addEventListener('focus',()=>{saveContext().then(()=>refreshContextState(true)).catch(()=>{});});window.addEventListener('resize',updateOverlays);window.addEventListener('scroll',updateOverlays,true);
})();