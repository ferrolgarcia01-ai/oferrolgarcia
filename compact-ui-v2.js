(() => {
  if (window.__fgAiCompactUiV2) return;
  window.__fgAiCompactUiV2 = true;

  const SB_URL = 'https://ypegwpoykntbpburndjf.supabase.co';
  const SB_KEY = 'sb_publishable_sQc1cYuZ43yi8BBJJlclng_JLo8TcKW';
  const LOGO = chrome.runtime.getURL('fg-logo.svg');
  const $ = (s) => document.querySelector(s);
  let session = null;
  let state = null;
  let panelOpen = false;

  const headers = (token, json = true) => ({
    apikey: SB_KEY,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  });

  async function readJson(res) {
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { error: text }; }
    if (!res.ok) {
      const e = new Error(body?.error || body?.message || `Erro ${res.status}`);
      e.data = body;
      throw e;
    }
    return body;
  }

  function injectCss() {
    if ($('#fg-ui-v2-style')) return;
    const style = document.createElement('style');
    style.id = 'fg-ui-v2-style';
    style.textContent = `
      #fg-ai-dock{display:none!important}
      #fg-ai-bubble{right:24px!important;bottom:88px!important;width:64px!important;height:64px!important;border-radius:50%!important;border:2px solid #151a23!important;background:#05070a!important;box-shadow:0 16px 38px rgba(0,0,0,.36),0 0 0 3px rgba(255,41,68,.12),0 0 30px rgba(255,41,68,.24)!important;overflow:visible!important}
      #fg-ai-bubble .fg-logo{width:54px!important;height:54px!important;border-radius:50%!important;padding:0!important;border:0!important;background:#05070a!important;overflow:hidden!important;font-size:0!important;text-shadow:none!important}
      #fg-ai-bubble .fg-logo img{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%}
      #fg-ai-bubble .fg-dot{right:-1px!important;bottom:3px!important}
      #fg-compact-v2{position:fixed;right:100px;bottom:90px;z-index:2147483647;width:302px;border-radius:20px;background:#fff;border:1px solid #e2e7ee;box-shadow:0 28px 72px rgba(7,13,24,.28);font-family:Inter,system-ui,sans-serif;color:#182235;display:none;overflow:hidden}
      #fg-compact-v2.open{display:block}
      #fg-compact-v2 .head{display:flex;align-items:center;gap:10px;padding:13px 14px 11px;border-bottom:1px solid #edf0f4}
      #fg-compact-v2 .logo{width:40px;height:40px;border-radius:11px;overflow:hidden;background:#07090d;box-shadow:0 4px 12px rgba(0,0,0,.15)}#fg-compact-v2 .logo img{width:100%;height:100%;object-fit:cover}
      #fg-compact-v2 .brand{flex:1;min-width:0}#fg-compact-v2 .brand strong{font-size:14px;letter-spacing:-.02em}#fg-compact-v2 .brand .ai{color:#eb2745}#fg-compact-v2 .brand small{display:block;font-size:8px;color:#8a95a6;letter-spacing:.09em;margin-top:2px}
      #fg-compact-v2 .power{width:34px;height:34px;border-radius:10px;border:1px solid #c8efd9;background:#e9fbf1;color:#12a55b;font-size:17px;cursor:pointer}
      #fg-compact-v2 .project{margin:11px 12px 7px;padding:11px 12px;border-radius:13px;border:1px solid #dce3ec;background:#f7f9fc;cursor:pointer}#fg-compact-v2 .kicker{font-size:7px;color:#8a95a6;letter-spacing:.15em;font-weight:800}#fg-compact-v2 .project strong{display:block;margin-top:4px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#fg-compact-v2 .project small{display:block;margin-top:3px;color:#7e899a;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #fg-compact-v2 .row{display:flex;align-items:center;gap:10px;margin:0 9px;padding:9px 7px;border-radius:11px;cursor:pointer}#fg-compact-v2 .row:hover{background:#f5f7fa}#fg-compact-v2 .ico{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#edf1f6;color:#26364b;font-size:14px;font-weight:900}#fg-compact-v2 .ico.gh{background:#111827;color:#fff;font-size:10px}#fg-compact-v2 .ico.sb{background:#e8fbf2;color:#20b278;font-size:18px}
      #fg-compact-v2 .copy{flex:1;min-width:0}#fg-compact-v2 .copy strong{display:block;font-size:10px}#fg-compact-v2 .copy small{display:block;margin-top:2px;color:#8b96a6;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#fg-compact-v2 .state{font-size:8px;font-weight:800;padding:5px 7px;border-radius:999px;background:#edf1f5;color:#8490a1}#fg-compact-v2 .state.on{background:#dff8e9;color:#12975a}#fg-compact-v2 .state.warn{background:#fff0d8;color:#c97900}
      #fg-compact-v2 .foot{display:flex;gap:7px;padding:10px 12px 12px;border-top:1px solid #edf0f4;margin-top:5px}#fg-compact-v2 .foot button{flex:1;height:34px;border-radius:10px;border:1px solid #dce3eb;background:#fff;color:#536174;font-size:9px;font-weight:800;cursor:pointer}#fg-compact-v2 .foot .danger{color:#c82941;background:#fff7f8;border-color:#f0d5da}
      #fg-license-v2{position:fixed;right:100px;bottom:90px;z-index:2147483647;width:322px;border-radius:20px;padding:1px;background:linear-gradient(135deg,#ff2948,#744fff 72%);box-shadow:0 28px 74px rgba(0,0,0,.36);font-family:Inter,system-ui,sans-serif;color:#f8f9fc}#fg-license-v2 .inner{border-radius:19px;background:#080b11;padding:17px}#fg-license-v2 .lh{display:flex;align-items:center;gap:10px;margin-bottom:15px}#fg-license-v2 .lh img{width:42px;height:42px;border-radius:11px}#fg-license-v2 .lh strong{font-size:14px}#fg-license-v2 .lh small{display:block;font-size:8px;color:#7d899d;margin-top:2px}#fg-license-v2 h2{font-size:23px;margin:0 0 8px;line-height:1.05}#fg-license-v2 p{font-size:10px;line-height:1.5;color:#9ba7b9;margin:0 0 14px}#fg-license-v2 input{box-sizing:border-box;width:100%;height:43px;border-radius:12px;border:1px solid #29354a;background:#0d141e;color:#fff;padding:0 12px;outline:0;text-transform:uppercase;font:750 11px system-ui}#fg-license-v2 button{width:100%;height:42px;margin-top:9px;border:0;border-radius:12px;background:linear-gradient(110deg,#ff304d,#e32247 65%,#8055ff);color:#fff;font-weight:900;cursor:pointer}#fg-license-v2 .err{min-height:15px;margin-top:7px;color:#ff8da0;font-size:9px}
      #fg-projects-v2,#fg-supa-v2{position:fixed;right:100px;bottom:90px;z-index:2147483647;width:302px;max-height:420px;overflow:auto;border-radius:18px;background:#090d13;border:1px solid #222c39;box-shadow:0 26px 66px rgba(0,0,0,.42);padding:10px;color:#fff;font-family:Inter,system-ui,sans-serif;display:none}#fg-projects-v2.open,#fg-supa-v2.open{display:block}#fg-projects-v2 .item{padding:10px;border-radius:11px;border:1px solid #202a37;background:#0f151e;margin-top:6px;cursor:pointer;font-size:10px}#fg-projects-v2 .item small{display:block;color:#79869a;font-size:8px;margin-top:3px}#fg-supa-v2 input{box-sizing:border-box;width:100%;height:38px;border-radius:10px;border:1px solid #2a374b;background:#0e151f;color:#fff;padding:0 10px;margin-top:7px;font-size:9px}#fg-supa-v2 button{width:100%;height:35px;border:0;border-radius:10px;margin-top:8px;background:#0f6e4b;color:#d6ffea;font-weight:800}
      @media(max-width:760px){#fg-compact-v2,#fg-license-v2,#fg-projects-v2,#fg-supa-v2{right:82px;max-width:calc(100vw - 96px)}}
    `;
    document.documentElement.appendChild(style);
  }

  async function ensureDeviceId() {
    const s = await chrome.storage.local.get('ferrolDeviceId');
    if (s.ferrolDeviceId) return s.ferrolDeviceId;
    const id = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    await chrome.storage.local.set({ ferrolDeviceId: id });
    return id;
  }

  function buildPanel() {
    if ($('#fg-compact-v2')) return;
    const p = document.createElement('div');
    p.id = 'fg-compact-v2';
    p.innerHTML = `
      <div class="head"><div class="logo"><img src="${LOGO}" alt="FG"></div><div class="brand"><strong>FG <span class="ai">AI</span> <span style="font-size:8px;color:#3478ff">PRO</span></strong><small>DEVELOPER AGENT</small></div><button class="power" id="fg-v2-power">⏻</button></div>
      <div class="project" id="fg-v2-project"><div class="kicker">PROJETO ATUAL</div><strong id="fg-v2-project-name">Aguardando projeto...</strong><small id="fg-v2-project-repo">Abra um projeto no Lovable</small></div>
      <div class="row"><div class="ico">♙</div><div class="copy"><strong>Usuário</strong><small id="fg-v2-license">Licença FG AI</small></div><span class="state on">ativa</span></div>
      <div class="row" id="fg-v2-github"><div class="ico gh">GH</div><div class="copy"><strong>GitHub</strong><small id="fg-v2-github-text">Não conectado</small></div><span class="state warn" id="fg-v2-github-state">conectar</span></div>
      <div class="row" id="fg-v2-supabase"><div class="ico sb">⚡</div><div class="copy"><strong>Supabase</strong><small id="fg-v2-supabase-text">Banco, Auth e Storage</small></div><span class="state warn" id="fg-v2-supabase-state">conectar</span></div>
      <div class="row" id="fg-v2-history"><div class="ico">↶</div><div class="copy"><strong>Conversa</strong><small>Mensagens e histórico do agente</small></div><span class="state">abrir</span></div>
      <div class="foot"><button id="fg-v2-refresh">Atualizar</button><button class="danger" id="fg-v2-logout">Sair</button></div>`;
    document.documentElement.appendChild(p);
    $('#fg-v2-project').onclick = openProjects;
    $('#fg-v2-github').onclick = connectGithub;
    $('#fg-v2-supabase').onclick = connectSupabase;
    $('#fg-v2-history').onclick = () => $('#fg-ai-dock [data-kind="history"]')?.click();
    $('#fg-v2-refresh').onclick = () => refresh(true);
    $('#fg-v2-logout').onclick = logout;
    $('#fg-v2-power').onclick = async () => {
      const s = await chrome.storage.local.get('ferrolExtensionEnabled');
      await chrome.storage.local.set({ ferrolExtensionEnabled: s.ferrolExtensionEnabled === false });
    };
  }

  function showLicense() {
    if ($('#fg-license-v2')) return;
    const d = document.createElement('div');
    d.id = 'fg-license-v2';
    d.innerHTML = `<div class="inner"><div class="lh"><img src="${LOGO}" alt="FG"><div><strong>Ativar FG AI</strong><small>modo de teste</small></div></div><h2>Ative sua licença.</h2><p>Digite a chave para liberar o chat nativo e suas integrações.</p><input id="fg-v2-key" placeholder="FG-XXXX-XXXX-XXXX-XXXX"><button id="fg-v2-activate">Ativar FG AI</button><div class="err" id="fg-v2-error"></div></div>`;
    document.documentElement.appendChild(d);
    $('#fg-v2-activate').onclick = activate;
  }

  async function activate() {
    const key = $('#fg-v2-key')?.value?.trim().toUpperCase();
    if (!key) return;
    const btn = $('#fg-v2-activate'), err = $('#fg-v2-error');
    btn.disabled = true; btn.textContent = 'Ativando...'; err.textContent = '';
    try {
      const data = await readJson(await fetch(`${SB_URL}/functions/v1/license-activate`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ license_key: key, device_id: await ensureDeviceId(), device_name: 'Chrome · FG AI' })
      }));
      session = data.session;
      await chrome.storage.local.set({ ferrolSession: data.session, ferrolLicenseInfo: data.license || {} });
      $('#fg-license-v2')?.remove();
      await refresh(true);
    } catch (e) { err.textContent = e.message || 'Falha ao ativar.'; }
    finally { btn.disabled = false; btn.textContent = 'Ativar FG AI'; }
  }

  function applyLogo() {
    const mark = $('#fg-ai-bubble .fg-logo');
    if (mark && !mark.querySelector('img')) mark.innerHTML = `<img src="${LOGO}" alt="FG AI">`;
    const h = $('#fg-ai-history-chat .fh-mark');
    if (h && !h.querySelector('img')) h.innerHTML = `<img src="${LOGO}" alt="FG AI" style="width:100%;height:100%;object-fit:cover;border-radius:9px">`;
  }

  async function refresh(sync = false) {
    const s = await chrome.storage.local.get(['ferrolSession', 'ferrolLicenseInfo']);
    session = s.ferrolSession || null;
    applyLogo(); buildPanel();
    if (!session?.access_token) { showLicense(); $('#fg-compact-v2')?.classList.remove('open'); panelOpen = false; return; }
    $('#fg-license-v2')?.remove();
    const r = await chrome.runtime.sendMessage({ type: 'FG_CONTEXT_STATE', sync });
    if (!r?.ok) return;
    state = r;
    render();
  }

  function render() {
    if (!state) return;
    const p = state.detectedProject || state.selectedProject;
    const contextName = state.context?.projectName || '';
    $('#fg-v2-project-name').textContent = p?.name || contextName || 'Projeto não identificado';
    $('#fg-v2-project-repo').textContent = p?.repo || (contextName ? 'Projeto detectado · conecte/autorize o GitHub' : 'Abra um projeto no Lovable');
    $('#fg-v2-github-text').textContent = state.githubConnected ? (state.githubAccount || 'Conectado') : 'Conecte sua conta';
    $('#fg-v2-github-state').textContent = state.githubConnected ? 'conectado' : 'conectar';
    $('#fg-v2-github-state').className = `state ${state.githubConnected ? 'on' : 'warn'}`;
    const row = p ? (state.projects || []).find(x => x.id === p.id) : null;
    const supa = Boolean(row?.supabase_project_ref);
    $('#fg-v2-supabase-state').textContent = supa ? 'conectado' : 'conectar';
    $('#fg-v2-supabase-state').className = `state ${supa ? 'on' : 'warn'}`;
    $('#fg-v2-supabase-text').textContent = supa ? `Projeto ${row.supabase_project_ref}` : 'Banco, Auth e Storage';
  }

  async function connectGithub() {
    if (!session?.access_token) return showLicense();
    try {
      const d = await readJson(await fetch(`${SB_URL}/functions/v1/github-connect-start`, { method: 'POST', headers: headers(session.access_token), body: '{}' }));
      const url = d.authorize_url || d.install_url;
      if (url) window.open(url, '_blank');
      setTimeout(() => refresh(true), 2500);
    } catch (e) { alert(e.message || 'Falha ao conectar GitHub.'); }
  }

  async function connectSupabase() {
    if (!session?.access_token) return showLicense();
    try {
      const d = await readJson(await fetch(`${SB_URL}/functions/v1/supabase-connect-start`, { method: 'POST', headers: headers(session.access_token), body: '{}' }));
      if (d.install_url) window.open(d.install_url, '_blank');
    } catch (e) {
      if (e.data?.setup_required) return openSupabaseManual();
      alert(e.message || 'Falha ao conectar Supabase.');
    }
  }

  function openSupabaseManual() {
    let m = $('#fg-supa-v2');
    if (!m) {
      m = document.createElement('div'); m.id = 'fg-supa-v2';
      m.innerHTML = `<strong style="font-size:12px">Conectar Supabase</strong><div style="font-size:8px;color:#7d899a;margin-top:4px">Modo de teste: use somente URL e publishable key.</div><input id="fg-v2-sb-url" placeholder="https://seu-projeto.supabase.co"><input id="fg-v2-sb-key" placeholder="sb_publishable_..."><button id="fg-v2-sb-save">Conectar projeto</button><button id="fg-v2-sb-close" style="background:#202938;color:#ccd5e2">Fechar</button>`;
      document.documentElement.appendChild(m);
      $('#fg-v2-sb-close').onclick = () => m.classList.remove('open');
      $('#fg-v2-sb-save').onclick = saveSupabase;
    }
    m.classList.add('open');
  }

  async function saveSupabase() {
    const p = state?.detectedProject || state?.selectedProject;
    if (!p) return alert('Primeiro conecte o projeto correto no GitHub.');
    try {
      await readJson(await fetch(`${SB_URL}/functions/v1/project-integrations`, {
        method: 'POST', headers: headers(session.access_token), body: JSON.stringify({ project_id: p.id, type: 'supabase', supabase_url: $('#fg-v2-sb-url').value.trim(), supabase_publishable_key: $('#fg-v2-sb-key').value.trim() })
      }));
      $('#fg-supa-v2').classList.remove('open'); await refresh(false);
    } catch (e) { alert(e.message || 'Falha ao conectar Supabase.'); }
  }

  function openProjects() {
    if (!state) return;
    let box = $('#fg-projects-v2');
    if (!box) { box = document.createElement('div'); box.id = 'fg-projects-v2'; document.documentElement.appendChild(box); }
    box.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px"><strong style="font-size:11px">Projetos</strong><button id="fg-v2-pclose" style="width:28px;height:28px;border-radius:8px;border:1px solid #293447;background:#161d28;color:#fff">×</button></div>`;
    for (const p of state.projects || []) {
      const i = document.createElement('div'); i.className = 'item'; i.innerHTML = `<strong>${p.name}</strong><small>${p.repo}</small>`;
      i.onclick = async () => { await chrome.storage.local.set({ ferrolProjectId: p.id }); box.classList.remove('open'); await refresh(false); };
      box.appendChild(i);
    }
    box.classList.add('open'); $('#fg-v2-pclose').onclick = () => box.classList.remove('open');
  }

  async function logout() {
    await chrome.runtime.sendMessage({ type: 'FG_LOGOUT' }).catch(() => {});
    await chrome.storage.local.remove(['ferrolSession','ferrolLicenseInfo','ferrolProjectId','ferrolThreads','ferrolChatCache']);
    session = null; panelOpen = false; $('#fg-compact-v2')?.classList.remove('open'); showLicense();
  }

  function autoPreview() {
    setTimeout(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /atualizar pr[eé]via|reload preview|refresh preview/i.test((b.textContent || '').trim()) && b.offsetParent !== null);
      if (btn) try { btn.click(); } catch {}
    }, 1100);
  }

  function hookBubble() {
    const bubble = $('#fg-ai-bubble');
    if (!bubble || bubble.dataset.fgV2Hooked) return;
    bubble.dataset.fgV2Hooked = '1';
    bubble.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (!session?.access_token) return showLicense();
      panelOpen = !panelOpen; $('#fg-compact-v2')?.classList.toggle('open', panelOpen); refresh(true).catch(() => {});
    }, true);
  }

  injectCss(); buildPanel();
  const timer = setInterval(() => { applyLogo(); hookBubble(); if ($('#fg-ai-bubble')) clearInterval(timer); }, 150);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.ferrolSession) refresh(false).catch(() => {});
    if (changes.ferrolNativeRefresh) { autoPreview(); refresh(false).catch(() => {}); }
  });
  window.addEventListener('focus', () => refresh(true).catch(() => {}));
  setInterval(() => refresh(false).catch(() => {}), 12000);
  refresh(true).catch(() => {});
})();