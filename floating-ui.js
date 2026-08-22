(() => {
  if (window.__fgAiFloatingUiV14) return;
  window.__fgAiFloatingUiV14 = true;

  const SB_URL = 'https://ypegwpoykntbpburndjf.supabase.co';
  const SB_KEY = 'sb_publishable_sQc1cYuZ43yi8BBJJlclng_JLo8TcKW';
  const API = {
    licenseActivate: `${SB_URL}/functions/v1/license-activate`,
    githubStart: `${SB_URL}/functions/v1/github-connect-start`,
    supabaseStart: `${SB_URL}/functions/v1/supabase-connect-start`,
    projectIntegrations: `${SB_URL}/functions/v1/project-integrations`,
  };

  const IDS = {
    style: 'fg-ai-floating-v14-style',
    license: 'fg-ai-floating-license',
    center: 'fg-ai-control-center',
    projects: 'fg-ai-projects-popover',
  };

  let session = null;
  let license = null;
  let contextState = null;
  let centerOpen = false;
  let refreshTimer = null;

  const logoSvg = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="fgs" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f6f7f8"/><stop offset=".45" stop-color="#8993a1"/><stop offset=".5" stop-color="#ff1f3d"/><stop offset="1" stop-color="#920014"/></linearGradient><filter id="fgg"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="32" cy="32" r="29" fill="#07090d" stroke="#ff243f" stroke-width="2"/><path d="M13 45 22 17h22l-2.8 8H28.5l-1.7 5.4h11l-2.5 7.4H24.5L22 45Z" fill="url(#fgs)" filter="url(#fgg)"/><path d="M31 45 39 22h14l-2.6 7.4h-7.5l-1.2 3.8h8.1L46 45Z" fill="#ef1736" filter="url(#fgg)"/></svg>`;
  const githubSvg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .8a11.4 11.4 0 0 0-3.6 22.2c.6.1.8-.25.8-.56v-2.2c-3.3.72-4-1.4-4-1.4-.54-1.37-1.32-1.74-1.32-1.74-1.08-.74.08-.72.08-.72 1.2.08 1.83 1.23 1.83 1.23 1.06 1.82 2.79 1.3 3.47.99.1-.77.42-1.3.76-1.6-2.64-.3-5.42-1.32-5.42-5.87 0-1.3.46-2.36 1.22-3.2-.12-.3-.53-1.52.12-3.16 0 0 1-.32 3.26 1.22A11.3 11.3 0 0 1 12 6.07c.97 0 1.95.13 2.86.38 2.26-1.54 3.25-1.22 3.25-1.22.66 1.64.25 2.86.13 3.16.76.84 1.22 1.9 1.22 3.2 0 4.56-2.79 5.56-5.44 5.86.43.37.81 1.1.81 2.22v3.29c0 .31.2.67.82.56A11.4 11.4 0 0 0 12 .8Z"/></svg>`;
  const supaSvg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.4 2.1 5.3 13.4h6.5l-1.2 8.5 8.1-11.3h-6.5l1.2-8.5Z"/></svg>`;

  function injectStyles() {
    if (document.getElementById(IDS.style)) return;
    const s = document.createElement('style');
    s.id = IDS.style;
    s.textContent = `
      #fg-ai-bubble .fg-logo{font-size:0!important;overflow:hidden!important;background:#05070b!important}#fg-ai-bubble .fg-logo svg{width:100%;height:100%;display:block}
      #fg-ai-dock{border-color:rgba(255,41,64,.26)!important;box-shadow:0 22px 55px rgba(0,0,0,.38),0 0 24px rgba(255,32,61,.08)!important}
      #fg-ai-dock .fg-tool{font-size:0!important;overflow:visible}#fg-ai-dock .fg-tool svg{width:19px;height:19px}#fg-ai-dock .fg-tool[data-kind="github"]{color:#fff!important}#fg-ai-dock .fg-tool[data-kind="supabase"]{color:#45e1a4!important}
      #fg-ai-dock .fg-tool[data-kind="panel"]{display:none!important}
      #fg-ai-dock .fg-tool[data-kind="account"]{color:#ff8ea0!important}#fg-ai-dock .fg-tool[data-kind="projects"]{color:#9bb8ff!important}
      #${IDS.license}{position:fixed;right:92px;bottom:92px;z-index:2147483647;width:340px;max-width:calc(100vw - 120px);border-radius:22px;padding:1px;background:linear-gradient(135deg,#ff2748,#542cff 60%,#27d89a);box-shadow:0 28px 80px rgba(0,0,0,.44),0 0 50px rgba(255,32,64,.13);font-family:Inter,system-ui,sans-serif;color:#f7f9fc}
      #${IDS.license} .fl-inner{border-radius:21px;background:radial-gradient(circle at 100% 0,rgba(112,65,255,.16),transparent 42%),#080b11;padding:18px}#${IDS.license} .fl-head{display:flex;align-items:center;gap:11px;margin-bottom:18px}#${IDS.license} .fl-logo{width:42px;height:42px}#${IDS.license} .fl-head strong{font-size:15px}#${IDS.license} .fl-head small{display:block;color:#778299;font-size:9px;margin-top:2px;letter-spacing:.12em}#${IDS.license} h2{font-size:25px;line-height:1.02;margin:0 0 8px;letter-spacing:-.035em}#${IDS.license} p{margin:0 0 17px;color:#a6b0c2;font-size:11px;line-height:1.55}#${IDS.license} label{display:block;font-size:8px;letter-spacing:.14em;color:#75829b;margin:0 0 6px}#${IDS.license} input{box-sizing:border-box;width:100%;height:44px;border-radius:13px;border:1px solid #273247;background:#0b111a;color:#fff;padding:0 13px;outline:0;font:750 11px system-ui;text-transform:uppercase}#${IDS.license} input:focus{border-color:#7b58ff;box-shadow:0 0 0 3px rgba(123,88,255,.12)}#${IDS.license} button{width:100%;height:43px;margin-top:10px;border:0;border-radius:13px;background:linear-gradient(110deg,#ff304c,#df2145 62%,#7854ff);color:#fff;font:850 11px system-ui;cursor:pointer}#${IDS.license} .fl-error{min-height:16px;margin-top:8px;color:#ff8da0;font-size:9px;line-height:1.4}#${IDS.license} .fl-foot{display:flex;align-items:center;gap:6px;margin-top:7px;color:#6f7b90;font-size:8px}#${IDS.license} .fl-dot{width:6px;height:6px;border-radius:50%;background:#31d77a}
      #${IDS.center}{position:fixed;right:92px;bottom:92px;z-index:2147483647;width:330px;max-width:calc(100vw - 120px);border-radius:19px;border:1px solid rgba(255,255,255,.1);background:radial-gradient(circle at 100% 0,rgba(124,83,255,.11),transparent 38%),#080b11;box-shadow:0 26px 70px rgba(0,0,0,.42);font-family:Inter,system-ui,sans-serif;color:#f5f8fc;overflow:hidden;display:none}#${IDS.center}.open{display:block}
      #${IDS.center} .fc-head{padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between}#${IDS.center} .fc-brand{display:flex;align-items:center;gap:9px}#${IDS.center} .fc-logo{width:32px;height:32px}#${IDS.center} .fc-brand strong{font-size:12px}#${IDS.center} .fc-brand small{display:block;color:#77839a;font-size:8px;margin-top:2px}#${IDS.center} .fc-close{width:30px;height:30px;border-radius:9px;border:1px solid #222c3a;background:#0e141e;color:#b9c2d2;cursor:pointer}
      #${IDS.center} .fc-body{padding:12px}#${IDS.center} .fc-project{padding:11px;border-radius:13px;background:#0d141e;border:1px solid #202c3d;margin-bottom:10px}#${IDS.center} .fc-kicker{font-size:7px;letter-spacing:.15em;color:#6e7a91;text-transform:uppercase}#${IDS.center} .fc-project strong{display:block;font-size:11px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#${IDS.center} .fc-project small{display:block;font-size:8px;color:#748097;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${IDS.center} .fc-row{display:flex;align-items:center;gap:10px;padding:10px 8px;border-radius:12px;cursor:pointer;border:1px solid transparent}#${IDS.center} .fc-row:hover{background:#0c121b;border-color:#1b2636}#${IDS.center} .fc-icon{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:#101824;color:#fff;border:1px solid #202c3b}#${IDS.center} .fc-icon svg{width:18px;height:18px}#${IDS.center} .fc-icon.supa{color:#45e1a4;background:#09271e;border-color:#124333}#${IDS.center} .fc-copy{min-width:0;flex:1}#${IDS.center} .fc-copy strong{display:block;font-size:10px}#${IDS.center} .fc-copy small{display:block;color:#6f7c91;font-size:8px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#${IDS.center} .fc-state{font-size:8px;font-weight:800;padding:5px 7px;border-radius:999px;background:#101822;color:#8491a6}#${IDS.center} .fc-state.on{background:#0b3825;color:#77e5a9}#${IDS.center} .fc-state.warn{background:#3a2910;color:#ffc76a}#${IDS.center} .fc-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}#${IDS.center} .fc-actions button{height:35px;border-radius:10px;border:1px solid #202b3b;background:#0e151f;color:#d7deea;font:750 9px system-ui;cursor:pointer}#${IDS.center} .fc-actions button.danger{color:#ff9bac;border-color:#43202a;background:#1b0d12}
      #${IDS.center} .fc-manual{display:none;padding:11px;border-radius:13px;margin-top:10px;background:#091019;border:1px solid #213044}#${IDS.center} .fc-manual.open{display:block}#${IDS.center} .fc-manual p{font-size:8px;color:#76839a;line-height:1.45;margin:0 0 8px}#${IDS.center} .fc-manual input{box-sizing:border-box;width:100%;height:37px;margin-top:6px;border-radius:10px;border:1px solid #253248;background:#0b1119;color:#eef3fa;padding:0 10px;outline:0;font-size:9px}#${IDS.center} .fc-manual button{height:35px;width:100%;margin-top:8px;border:0;border-radius:10px;background:#0f6c49;color:#caffdf;font:800 9px system-ui;cursor:pointer}
      #${IDS.projects}{position:fixed;right:92px;bottom:92px;z-index:2147483647;width:330px;max-height:440px;overflow:auto;border-radius:18px;background:#080b11;border:1px solid rgba(255,255,255,.1);box-shadow:0 24px 64px rgba(0,0,0,.4);padding:10px;font-family:Inter,system-ui,sans-serif;color:#f4f7fb;display:none}#${IDS.projects}.open{display:block}#${IDS.projects} .fp-head{display:flex;justify-content:space-between;align-items:center;padding:5px 4px 10px}#${IDS.projects} .fp-head strong{font-size:11px}#${IDS.projects} .fp-item{padding:10px;border-radius:11px;border:1px solid #1c2736;background:#0c121b;margin-top:6px;font-size:9px;cursor:pointer}#${IDS.projects} .fp-item.current{border-color:#8a4fff;box-shadow:inset 0 0 0 1px rgba(138,79,255,.15)}#${IDS.projects} .fp-item small{display:block;color:#6e7a8e;margin-top:3px}
      #fg-ai-history-chat{border-color:rgba(255,45,72,.18)!important;box-shadow:0 30px 80px rgba(0,0,0,.48),0 0 35px rgba(255,30,60,.07)!important}#fg-ai-history-chat .fh-bubble{font-size:11px!important}#fg-ai-history-chat .fh-msg.assistant .fh-bubble{background:linear-gradient(145deg,#101a29,#0d1420)!important;border-color:#233148!important}#fg-ai-history-chat .fh-msg.user .fh-bubble{background:linear-gradient(145deg,#5c1628,#35101c)!important}
      @media(max-width:760px){#${IDS.license},#${IDS.center},#${IDS.projects}{right:78px;max-width:calc(100vw - 92px)}}
    `;
    document.documentElement.appendChild(s);
  }

  async function getStored() {
    const s = await chrome.storage.local.get(['ferrolSession', 'ferrolLicenseInfo', 'ferrolDeviceId']);
    session = s.ferrolSession || null;
    license = s.ferrolLicenseInfo || null;
    return s;
  }

  async function getDeviceId() {
    const s = await chrome.storage.local.get('ferrolDeviceId');
    if (s.ferrolDeviceId) return s.ferrolDeviceId;
    const id = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    await chrome.storage.local.set({ ferrolDeviceId: id });
    return id;
  }

  function apiHeaders(token, json = true) {
    return {
      apikey: SB_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  async function readJson(res) {
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
    if (!res.ok) {
      const e = new Error(data?.error || data?.message || `Erro ${res.status}`);
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return data;
  }

  function replaceBubbleLogo() {
    const mark = document.querySelector('#fg-ai-bubble .fg-logo');
    if (mark && !mark.querySelector('svg')) mark.innerHTML = logoSvg;
    const gh = document.querySelector('#fg-ai-dock .fg-tool[data-kind="github"]');
    const su = document.querySelector('#fg-ai-dock .fg-tool[data-kind="supabase"]');
    if (gh && !gh.querySelector('svg')) gh.innerHTML = `${githubSvg}<span class="fg-tip">GitHub</span>`;
    if (su && !su.querySelector('svg')) su.innerHTML = `${supaSvg}<span class="fg-tip">Supabase</span>`;
    const dock = document.getElementById('fg-ai-dock');
    if (dock && !dock.querySelector('[data-kind="projects"]')) {
      const history = dock.querySelector('[data-kind="history"]');
      const p = document.createElement('button');
      p.className = 'fg-tool'; p.dataset.kind = 'projects'; p.innerHTML = `<span style="font-size:17px">⌘</span><span class="fg-tip">Projetos</span>`;
      history?.before(p);
      const a = document.createElement('button');
      a.className = 'fg-tool'; a.dataset.kind = 'account'; a.innerHTML = `<span style="font-size:16px">⚙</span><span class="fg-tip">Conta e conexões</span>`;
      dock.insertBefore(a, dock.querySelector('[data-kind="power"]'));
    }
  }

  function ensureLicenseModal() {
    let el = document.getElementById(IDS.license);
    if (session?.access_token) { el?.remove(); return; }
    if (el) return;
    el = document.createElement('div'); el.id = IDS.license;
    el.innerHTML = `<div class="fl-inner"><div class="fl-head"><div class="fl-logo">${logoSvg}</div><div><strong>FG AI</strong><small>DEVELOPER AGENT</small></div></div><h2>Ative e comece.</h2><p>Use sua chave de licença. Durante os testes ela pode ser ativada em mais de uma instalação.</p><form id="fg-floating-license-form"><label>CHAVE DE LICENÇA</label><input id="fg-floating-key" autocomplete="off" placeholder="FG-XXXX-XXXX-XXXX-XXXX"><button id="fg-floating-activate" type="submit">Ativar FG AI</button><div class="fl-error" id="fg-floating-error"></div></form><div class="fl-foot"><span class="fl-dot"></span> Motor protegido no backend · sem senha</div></div>`;
    document.documentElement.appendChild(el);
    el.querySelector('form').addEventListener('submit', activateLicense);
    setTimeout(() => el.querySelector('input')?.focus(), 100);
  }

  async function activateLicense(e) {
    e.preventDefault();
    const key = String(document.getElementById('fg-floating-key')?.value || '').trim().toUpperCase();
    const err = document.getElementById('fg-floating-error');
    const btn = document.getElementById('fg-floating-activate');
    if (!key) { err.textContent = 'Digite a chave de licença.'; return; }
    btn.disabled = true; btn.textContent = 'Ativando...'; err.textContent = '';
    try {
      const deviceId = await getDeviceId();
      const data = await readJson(await fetch(API.licenseActivate, { method:'POST', headers:apiHeaders(null), body:JSON.stringify({ license_key:key, device_id:deviceId, device_name:`${navigator.platform || 'Chrome'} · Browser` }) }));
      if (!data?.session?.access_token) throw new Error('Sessão não criada.');
      session = data.session; license = data.license || {};
      await chrome.storage.local.set({ ferrolSession:session, ferrolLicenseInfo:license, ferrolExtensionEnabled:true, ferrolNativeLovableMode:true });
      document.getElementById(IDS.license)?.remove();
      setTimeout(() => refreshState(true), 250);
    } catch (error) { err.textContent = error.message || 'Falha na ativação.'; }
    finally { btn.disabled = false; btn.textContent = 'Ativar FG AI'; }
  }

  function ensureControlCenter() {
    if (document.getElementById(IDS.center)) return;
    const el = document.createElement('div'); el.id = IDS.center;
    el.innerHTML = `<div class="fc-head"><div class="fc-brand"><div class="fc-logo">${logoSvg}</div><div><strong>FG AI</strong><small>COMMAND CENTER</small></div></div><button class="fc-close">×</button></div><div class="fc-body"><div class="fc-project"><span class="fc-kicker">Projeto detectado</span><strong id="fg-cc-project">Aguardando Lovable...</strong><small id="fg-cc-repo">Abra um projeto para identificar automaticamente</small></div><div class="fc-row" data-action="github"><div class="fc-icon">${githubSvg}</div><div class="fc-copy"><strong>GitHub</strong><small id="fg-cc-github-copy">Não conectado</small></div><span class="fc-state" id="fg-cc-github">conectar</span></div><div class="fc-row" data-action="supabase"><div class="fc-icon supa">${supaSvg}</div><div class="fc-copy"><strong>Supabase</strong><small id="fg-cc-supa-copy">Banco, Auth e Storage</small></div><span class="fc-state" id="fg-cc-supa">opcional</span></div><div class="fc-row" data-action="projects"><div class="fc-icon">⌘</div><div class="fc-copy"><strong>Projetos</strong><small id="fg-cc-projects-copy">Repositórios autorizados</small></div><span class="fc-state">ver</span></div><div class="fc-row" data-action="history"><div class="fc-icon">◷</div><div class="fc-copy"><strong>Conversa</strong><small>Histórico + chat com o agente</small></div><span class="fc-state">abrir</span></div><div class="fc-manual" id="fg-supa-manual"><p>O OAuth oficial do Supabase ainda está em configuração. Para testar agora, conecte somente a URL do projeto e a publishable key. Nunca use service_role.</p><input id="fg-supa-url" placeholder="https://seu-projeto.supabase.co"><input id="fg-supa-key" placeholder="sb_publishable_..."><button id="fg-supa-save">Conectar projeto</button></div><div class="fc-actions"><button id="fg-cc-refresh">Sincronizar</button><button class="danger" id="fg-cc-logout">Sair da licença</button></div></div>`;
    document.documentElement.appendChild(el);
    el.querySelector('.fc-close').addEventListener('click', () => setCenter(false));
    el.querySelector('[data-action="github"]').addEventListener('click', connectGithub);
    el.querySelector('[data-action="supabase"]').addEventListener('click', connectSupabase);
    el.querySelector('[data-action="projects"]').addEventListener('click', openProjects);
    el.querySelector('[data-action="history"]').addEventListener('click', () => { setCenter(false); document.querySelector('#fg-ai-dock [data-kind="history"]')?.click(); });
    el.querySelector('#fg-cc-refresh').addEventListener('click', () => refreshState(true));
    el.querySelector('#fg-cc-logout').addEventListener('click', logout);
    el.querySelector('#fg-supa-save').addEventListener('click', saveSupabaseManual);
  }

  function setCenter(open) {
    centerOpen = Boolean(open);
    document.getElementById(IDS.center)?.classList.toggle('open', centerOpen);
    if (open) { document.getElementById('fg-ai-dock')?.classList.remove('open'); refreshState(true); }
  }

  async function refreshState(sync = false) {
    await getStored();
    ensureLicenseModal();
    if (!session?.access_token) return;
    try {
      const r = await chrome.runtime.sendMessage({ type:'FG_CONTEXT_STATE', sync });
      if (!r?.ok) throw new Error(r?.error || 'Falha ao sincronizar.');
      contextState = r;
      renderState();
    } catch (e) {
      if (/ative sua licença|sessão/i.test(String(e.message || ''))) {
        session = null; await chrome.storage.local.remove(['ferrolSession','ferrolLicenseInfo']); ensureLicenseModal();
      }
    }
  }

  function renderState() {
    const p = contextState?.detectedProject || contextState?.selectedProject;
    const ctx = contextState?.context?.projectName;
    const projectName = p?.name || ctx || 'Nenhum projeto detectado';
    const repo = p?.repo || (ctx ? 'Conecte/autorize o GitHub deste projeto' : 'Abra um projeto no Lovable');
    const projectEl = document.getElementById('fg-cc-project'); if (projectEl) projectEl.textContent = projectName;
    const repoEl = document.getElementById('fg-cc-repo'); if (repoEl) repoEl.textContent = repo;
    const gh = document.getElementById('fg-cc-github'), ghc = document.getElementById('fg-cc-github-copy');
    if (gh) { gh.textContent = contextState?.githubConnected ? 'conectado' : 'conectar'; gh.className = `fc-state ${contextState?.githubConnected ? 'on' : 'warn'}`; }
    if (ghc) ghc.textContent = contextState?.githubConnected ? (contextState.githubAccount || 'GitHub conectado') : 'Autorize sua conta e repositórios';
    const pc = document.getElementById('fg-cc-projects-copy'); if (pc) pc.textContent = `${contextState?.projects?.length || 0} repositório(s) autorizado(s)`;
    const su = document.getElementById('fg-cc-supa');
    if (su) { const connected = Boolean(p?.supabase_project_ref); su.textContent = connected ? 'conectado' : 'opcional'; su.className = `fc-state ${connected ? 'on' : ''}`; }
  }

  async function connectGithub() {
    if (!session?.access_token) return ensureLicenseModal();
    try {
      const data = await readJson(await fetch(API.githubStart, { method:'POST', headers:apiHeaders(session.access_token), body:'{}' }));
      const url = data.install_url || data.authorize_url;
      if (!url) throw new Error('URL do GitHub não recebida.');
      await chrome.runtime.sendMessage({ type:'OPEN_TAB', url });
      scheduleRefresh();
    } catch (e) { toast(e.message || 'Falha ao conectar GitHub.', 'error'); }
  }

  async function connectSupabase() {
    if (!session?.access_token) return ensureLicenseModal();
    try {
      const data = await readJson(await fetch(API.supabaseStart, { method:'POST', headers:apiHeaders(session.access_token), body:'{}' }));
      if (data?.install_url) { await chrome.runtime.sendMessage({ type:'OPEN_TAB', url:data.install_url }); scheduleRefresh(); return; }
      throw new Error('OAuth não disponível.');
    } catch (e) {
      if (e?.data?.setup_required || /oauth.*não.*configur/i.test(String(e.message || ''))) {
        document.getElementById('fg-supa-manual')?.classList.add('open');
        toast('OAuth do Supabase ainda está em configuração. Liberei o modo seguro de teste por publishable key.', 'info');
      } else toast(e.message || 'Falha ao conectar Supabase.', 'error');
    }
  }

  async function saveSupabaseManual() {
    const project = contextState?.detectedProject || contextState?.selectedProject;
    if (!project?.id) return toast('Abra ou selecione um projeto conectado ao GitHub primeiro.', 'error');
    const url = String(document.getElementById('fg-supa-url')?.value || '').trim();
    const key = String(document.getElementById('fg-supa-key')?.value || '').trim();
    try {
      await readJson(await fetch(API.projectIntegrations, { method:'POST', headers:apiHeaders(session.access_token), body:JSON.stringify({ project_id:project.id, type:'supabase', supabase_url:url, supabase_publishable_key:key }) }));
      document.getElementById('fg-supa-manual')?.classList.remove('open');
      toast('Supabase conectado ao projeto.', 'info'); await refreshState(false);
    } catch (e) { toast(e.message || 'Não foi possível conectar o Supabase.', 'error'); }
  }

  function ensureProjectsPopover() {
    if (document.getElementById(IDS.projects)) return;
    const el = document.createElement('div'); el.id = IDS.projects; document.documentElement.appendChild(el);
  }

  async function openProjects() {
    await refreshState(true); ensureProjectsPopover();
    const el = document.getElementById(IDS.projects); const current = contextState?.detectedProject?.id || contextState?.selectedProject?.id;
    el.innerHTML = `<div class="fp-head"><strong>Projetos autorizados</strong><button id="fg-projects-close" style="border:0;background:transparent;color:#8b97aa;cursor:pointer">×</button></div>${(contextState?.projects || []).map(p => `<div class="fp-item ${p.id===current?'current':''}" data-id="${p.id}"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.repo)}</small></div>`).join('') || '<div class="fp-item">Nenhum repositório autorizado.<small>Conecte o GitHub primeiro.</small></div>'}`;
    el.classList.add('open'); setCenter(false);
    el.querySelector('#fg-projects-close')?.addEventListener('click', () => el.classList.remove('open'));
    el.querySelectorAll('.fp-item[data-id]').forEach(item => item.addEventListener('click', async () => { await chrome.storage.local.set({ ferrolProjectId:item.dataset.id }); el.classList.remove('open'); toast('Projeto selecionado.', 'info'); }));
  }

  function escapeHtml(v) { return String(v || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }

  function toast(text, kind = 'info') {
    const el = document.getElementById('fg-ai-toast');
    if (!el) return;
    el.textContent = String(text || ''); el.className = `${kind === 'error' ? 'error' : ''} visible`.trim();
    setTimeout(() => el.classList.remove('visible'), kind === 'error' ? 5500 : 3500);
  }

  async function logout() {
    try { await chrome.runtime.sendMessage({ type:'FG_LOGOUT' }); } catch {}
    session = null; license = null; contextState = null;
    await chrome.storage.local.remove(['ferrolSession','ferrolLicenseInfo','ferrolProjectId','ferrolThreads','ferrolChatCache']);
    setCenter(false); document.getElementById(IDS.projects)?.classList.remove('open'); ensureLicenseModal();
  }

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    let rounds = 0;
    refreshTimer = setInterval(async () => { rounds += 1; await refreshState(true); if (rounds >= 20) clearInterval(refreshTimer); }, 3000);
  }

  function autoPreview() {
    const texts = ['atualizar prévia','recarregar prévia','reload preview','update preview'];
    for (const b of document.querySelectorAll('button')) {
      const t = String(b.textContent || '').trim().toLowerCase();
      if (texts.some(x => t.includes(x)) && !b.disabled && b.offsetParent !== null) {
        try { b.click(); toast('Prévia atualizada automaticamente.', 'info'); } catch {}
        return true;
      }
    }
    return false;
  }

  function installInterceptors() {
    document.addEventListener('click', (e) => {
      const tool = e.target.closest?.('#fg-ai-dock .fg-tool');
      if (!tool) return;
      const kind = tool.dataset.kind;
      if (!['github','supabase','projects','account','panel'].includes(kind)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (kind === 'github') connectGithub();
      else if (kind === 'supabase') connectSupabase();
      else if (kind === 'projects') openProjects();
      else setCenter(true);
    }, true);

    window.addEventListener('fg-ai-open-request', () => {
      if (!session?.access_token) ensureLicenseModal();
      else document.getElementById('fg-ai-bubble')?.click();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.ferrolSession) {
        session = changes.ferrolSession.newValue || null;
        ensureLicenseModal();
        if (session?.access_token) refreshState(true);
      }
      if (changes.ferrolNativeRefresh) {
        let tries = 0;
        const timer = setInterval(() => { tries += 1; if (autoPreview() || tries >= 20) clearInterval(timer); }, 1500);
      }
    });
  }

  async function boot() {
    injectStyles(); ensureControlCenter(); ensureProjectsPopover(); installInterceptors();
    await getStored();
    const timer = setInterval(() => { replaceBubbleLogo(); if (document.getElementById('fg-ai-bubble')) clearInterval(timer); }, 200);
    ensureLicenseModal();
    if (session?.access_token) refreshState(true);
    setInterval(() => { replaceBubbleLogo(); if (session?.access_token) refreshState(false); }, 12000);
  }

  boot().catch(() => {});
})();