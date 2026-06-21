// ====================================================================
//  Tormenta de Stormwreck — V2 Multiplayer · M1 (salas + lobby)
//  Camada de sala/sincronização. A engine do jogo (rules/campaign/game)
//  entra nas fases seguintes. Backend: mesmo Supabase da V1.
// ====================================================================
const SUPA_URL = 'https://qyqvnokqkukhecnpykds.supabase.co';
const SUPA_KEY = 'sb_publishable_7Pnila08_CO32ae28pIM5g_3WACbxV1';

let supa, ME = null, ROOM = null, MEMBERS = [], roomChannel = null;
// código de convite vindo no link (?sala=XXXXXX) — entra direto após login
let PENDING_CODE = (new URLSearchParams(location.search).get('sala') || '').toUpperCase() || null;

function roomLink(){ return `${location.origin}${location.pathname}?sala=${ROOM.code}`; }
function clearUrlCode(){ try { history.replaceState(null, '', location.pathname); } catch(e){} }

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function show(id){ $$('.screen').forEach(s=>s.classList.remove('active')); $('#'+id).classList.add('active'); }
function toast(msg){
  const t = document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(), 3200);
}
function nameFromEmail(e){ return (e||'').split('@')[0] || 'Aventureiro'; }
function amIAdmin(){ const m = MEMBERS.find(x=>x.user_id===ME?.id); return m && m.role==='admin'; }
function myMember(){ return MEMBERS.find(x=>x.user_id===ME?.id); }

// ---------------- AUTH ----------------
async function initAuth(){
  supa = window.supabase.createClient(SUPA_URL, SUPA_KEY);
  $('#loginBtn').onclick = doLogin;
  $('#loginPass').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
  const { data:{ session } } = await supa.auth.getSession();
  if (session){ ME = session.user; afterAuth(); } else { show('screen-login'); }
}
// depois de autenticado: 1) checa autorização da conta; 2) entra por link ou hub
async function afterAuth(){
  const { data: allowed } = await supa.rpc('am_i_allowed');
  if (!allowed){ showPending(); return; }
  if (PENDING_CODE){ const code = PENDING_CODE; PENDING_CODE = null; clearUrlCode(); await joinByCode(code, true); }
  else enterHub();
}
function showPending(){
  show('screen-pending');
  $('#pendReload').onclick = ()=> location.reload();
  $('#pendLogout').onclick = doLogout;
}
async function doLogin(){
  const email = $('#loginEmail').value.trim(), pass = $('#loginPass').value;
  if (!email || !pass){ toast('Preencha e-mail e senha.'); return; }
  $('#loginBtn').disabled = true;
  const { data, error } = await supa.auth.signInWithPassword({ email, password: pass });
  $('#loginBtn').disabled = false;
  if (error){ $('#loginErr').textContent = 'Falha no login: ' + error.message; return; }
  ME = data.user; $('#loginErr').textContent=''; afterAuth();
}
async function doLogout(){
  await leaveRoomQuietly();
  try { await supa.auth.signOut(); } catch(e){}
  ME = null; show('screen-login');
}

// ---------------- HUB (criar / entrar) ----------------
async function enterHub(){
  show('screen-hub');
  $('#hubEmail').textContent = ME.email;
  supa.rpc('is_app_admin').then(({data})=>{ if (data) $('#hubAdmin').style.display='inline'; });
  $('#roomName').value = `Mesa de ${nameFromEmail(ME.email)}`;
  $('#createBtn').onclick = createRoom;
  $('#joinBtn').onclick = joinRoom;
  $('#hubLogout').onclick = doLogout;
  $('#joinCode').addEventListener('keydown', e=>{ if(e.key==='Enter') joinRoom(); });
}
function genCode(){
  const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem caracteres ambíguos
  let s=''; for(let i=0;i<6;i++) s+=A[Math.floor(Math.random()*A.length)];
  return s;
}
async function createRoom(){
  const name = $('#roomName').value.trim() || `Mesa de ${nameFromEmail(ME.email)}`;
  const adminPlays = $('#adminRole').value === 'play';   // 'play' | 'dm'
  const model = $('#roomModel').value;
  $('#createBtn').disabled = true;
  let room=null, err=null;
  for (let tries=0; tries<6 && !room; tries++){
    const code = genCode();
    const { data, error } = await supa.from('rooms')
      .insert({ code, host_id: ME.id, name, admin_plays: adminPlays, model }).select().single();
    if (!error){ room = data; break; }
    err = error;
    if (!String(error.message||'').toLowerCase().includes('duplicate')) break; // só re-tenta colisão de código
  }
  if (!room){ $('#createBtn').disabled=false; toast('Erro ao criar sala: '+(err?err.message:'desconhecido')); return; }
  // host entra como admin
  const { error: mErr } = await supa.from('room_members')
    .insert({ room_id: room.id, user_id: ME.id, display_name: nameFromEmail(ME.email), role:'admin', ready: !adminPlays });
  $('#createBtn').disabled = false;
  if (mErr){ toast('Sala criada, mas falhou ao entrar: '+mErr.message); return; }
  ROOM = room; enterRoom();
}
function joinRoom(){
  const code = ($('#joinCode').value||'').trim().toUpperCase();
  if (code.length < 4){ toast('Digite o código da sala.'); return; }
  joinByCode(code);
}
// entra numa sala pelo código (usado pelo botão e pelo link de convite)
async function joinByCode(code, fromLink){
  const btn = $('#joinBtn'); if (btn) btn.disabled = true;
  const { data, error } = await supa.rpc('join_room', { p_code: code, p_name: nameFromEmail(ME.email) });
  if (btn) btn.disabled = false;
  if (error){
    toast(error.message || 'Não foi possível entrar.');
    if (fromLink) enterHub();   // link inválido → cai no hub
    return;
  }
  const { data: room, error: rErr } = await supa.from('rooms').select('*').eq('id', data).single();
  if (rErr || !room){ toast('Sala encontrada mas não pôde ser carregada.'); if (fromLink) enterHub(); return; }
  ROOM = room; enterRoom();
}

// ---------------- SALA (lobby) ----------------
async function enterRoom(){
  show('screen-room');
  await refreshRoom();
  subscribeRoom();
}
async function refreshRoom(){
  if (!ROOM) return;
  const { data: room } = await supa.from('rooms').select('*').eq('id', ROOM.id).single();
  if (room) ROOM = room;
  const { data: members } = await supa.from('room_members').select('*').eq('room_id', ROOM.id).order('joined_at');
  MEMBERS = members || [];
  if (ROOM.status === 'ended'){ toast('A sala foi encerrada pelo mestre.'); await leaveRoomQuietly(); enterHub(); return; }
  if (ROOM.status === 'playing'){ enterGame(); return; }
  renderRoom();
}
function subscribeRoom(){
  if (roomChannel) supa.removeChannel(roomChannel);
  roomChannel = supa.channel('room-'+ROOM.id)
    .on('postgres_changes', { event:'*', schema:'public', table:'room_members', filter:`room_id=eq.${ROOM.id}` }, refreshRoom)
    .on('postgres_changes', { event:'*', schema:'public', table:'rooms', filter:`id=eq.${ROOM.id}` }, refreshRoom)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'room_actions', filter:`room_id=eq.${ROOM.id}` }, p => onPlayerAction(p.new))
    .subscribe();
}
function renderRoom(){
  const admin = amIAdmin();
  $('#roomTitle').textContent = ROOM.name || 'Sala';
  $('#roomCode').textContent = ROOM.code;
  const players = MEMBERS.filter(m=>m.role!=='admin' || ROOM.admin_plays);
  const readyCount = players.filter(m=>m.ready).length;
  $('#roomCount').textContent = `${MEMBERS.length} na sala · ${readyCount}/${players.length} prontos`;

  $('#memberList').innerHTML = MEMBERS.map(m=>{
    const isMe = m.user_id===ME.id;
    const roleTag = m.role==='admin'
      ? `<span class="tag admin">Admin${ROOM.admin_plays?' · joga':' · Mestre'}</span>`
      : `<span class="tag">Jogador</span>`;
    const isPlayer = m.role!=='admin' || ROOM.admin_plays;
    const readyTag = !isPlayer ? `<span class="tag dm">Mestre</span>`
      : (m.ready ? `<span class="tag ready">✓ Pronto</span>` : `<span class="tag wait">aguardando</span>`);
    const kick = (admin && !isMe) ? `<button class="mini-x" data-kick="${m.user_id}" title="Remover">✕</button>` : '';
    const charLine = m.sheet ? `<div class="mchar">${m.sheet.race}${m.sheet.subrace?` (${m.sheet.subrace})`:''} ${m.sheet.cls} · Nv${m.sheet.level}</div>` : '';
    return `<div class="member ${isMe?'me':''}">
      <div><span class="mname">${m.display_name||'?'}${isMe?' <small>(você)</small>':''}</span>${charLine}</div>
      <span class="mtags">${roleTag} ${readyTag} ${kick}</span>
    </div>`;
  }).join('');
  $$('#memberList [data-kick]').forEach(b=> b.onclick = ()=> kickMember(b.dataset.kick));

  // ações do próprio jogador
  const me = myMember();
  const iAmPlayer = me && (me.role!=='admin' || ROOM.admin_plays);
  const readyWrap = $('#readyWrap');
  if (iAmPlayer){
    readyWrap.style.display='';
    const sheet = me.sheet;
    if (sheet){
      $('#readyBtn').textContent = '♻️ Refazer personagem';
      $('#readyBtn').classList.remove('on');
      $('#readyBtn').onclick = openCreate;
      $('#readyNote').innerHTML = `✓ <b style="color:var(--myco)">${sheet.name}</b> — ${sheet.race}${sheet.subrace?` (${sheet.subrace})`:''} ${sheet.cls}${sheet.fightingStyle?` · ${sheet.fightingStyle}`:''}, Nv${sheet.level} · CA ${sheet.ca} · ${sheet.maxHp} HP`;
    } else {
      $('#readyBtn').textContent = '🧙 Criar meu personagem';
      $('#readyBtn').classList.add('on');
      $('#readyBtn').onclick = openCreate;
      $('#readyNote').textContent = 'Crie seu aventureiro para ficar pronto para a partida.';
    }
  } else { readyWrap.style.display='none'; }

  // painel do admin
  const ap = $('#adminPanel');
  if (admin){
    ap.style.display='';
    $('#admModel').value = ROOM.model;
    $('#admModel').onchange = ()=> updateRoom({ model: $('#admModel').value });
    $('#admGm').checked = !!ROOM.gm_mode;
    $('#admGm').onchange = ()=> updateRoom({ gm_mode: $('#admGm').checked });
    const allReady = players.length>0 && players.every(m=>m.ready && m.sheet);
    $('#startBtn').disabled = !allReady;
    $('#startBtn').onclick = startMatch;
    $('#startNote').textContent = allReady
      ? 'Todos prontos com personagem. Pode iniciar a aventura!'
      : 'Aguardando todos criarem o personagem.';
  } else { ap.style.display='none'; }

  // link de convite (visível para todos; serve para chamar mais gente)
  const link = roomLink();
  $('#inviteBox').style.display = '';
  $('#inviteLink').value = link;
  $('#copyLinkBtn').onclick = async ()=>{
    try { await navigator.clipboard.writeText(link); toast('Link de convite copiado!'); }
    catch(e){ $('#inviteLink').select(); document.execCommand && document.execCommand('copy'); toast('Link copiado.'); }
  };

  $('#leaveBtn').onclick = leaveRoom;
  $('#copyCodeBtn').onclick = ()=>{ navigator.clipboard?.writeText(ROOM.code); toast('Código copiado: '+ROOM.code); };
}
async function toggleReady(){
  const me = myMember(); if (!me) return;
  await supa.from('room_members').update({ ready: !me.ready }).eq('room_id', ROOM.id).eq('user_id', ME.id);
}
// abre a criação de personagem (creation-mp.js); ao confirmar, salva a ficha
function openCreate(){
  startCreationMp(myMember()?.display_name || nameFromEmail(ME.email), onCharacterCreated);
}
async function onCharacterCreated(char){
  const { error } = await supa.from('room_members')
    .update({ sheet: char, ready: true }).eq('room_id', ROOM.id).eq('user_id', ME.id);
  show('screen-room'); await refreshRoom();
  toast(error ? ('Erro ao salvar: '+error.message) : ('Personagem pronto: '+char.name));
}
async function updateRoom(patch){
  await supa.from('rooms').update(patch).eq('id', ROOM.id);
}
async function kickMember(uid){
  if (!confirm('Remover este jogador da sala?')) return;
  await supa.from('room_members').delete().eq('room_id', ROOM.id).eq('user_id', uid);
}
async function leaveRoomQuietly(){
  try {
    if (roomChannel){ await supa.removeChannel(roomChannel); roomChannel=null; }
    if (ROOM && ME){
      if (amIAdmin()) { await supa.from('rooms').update({ status:'ended' }).eq('id', ROOM.id); }
      else { await supa.from('room_members').delete().eq('room_id', ROOM.id).eq('user_id', ME.id); }
    }
  } catch(e){}
  clearTyping(); revealedCount = -1; localBusy = false;
  ROOM = null; MEMBERS = [];
}
async function leaveRoom(){
  const admin = amIAdmin();
  if (!confirm(admin ? 'Você é o admin — sair encerra a sala. Continuar?' : 'Sair desta sala?')) return;
  await leaveRoomQuietly();
  enterHub();
}

// ---------------- PARTIDA (M3: estado compartilhado) ----------------
function escapeHtml(s){ return (s||'').replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

// admin inicia a partida: monta o estado a partir das fichas e grava na sala
async function startMatch(){
  const players = MEMBERS.filter(m => (m.role!=='admin' || ROOM.admin_plays) && m.sheet);
  if (!players.length){ toast('Ninguém tem personagem ainda.'); return; }
  const characters = players.map(m => ({ ...m.sheet, owner: m.user_id, ownerName: m.display_name }));
  const sc = CAMPAIGN.scenes['chegada'];
  const state = {
    characters, sceneId:'chegada', turnIndex:0, visited:[], revealed:[], combat:null,
    history:[ { role:'scene', text:`⚔ ${sc.chapter} — ${sc.location} ⚔` }, { role:'dm', text: sc.readAloud } ],
    version:1, started_at: new Date().toISOString()
  };
  $('#startBtn').disabled = true;
  const { error } = await supa.from('rooms')
    .update({ status:'playing', scene_id:'chegada', state, turn_owner: players[0].user_id }).eq('id', ROOM.id);
  if (error){ toast('Erro ao iniciar: '+error.message); $('#startBtn').disabled=false; return; }
  // o Realtime leva todos para a tela de jogo
}

let G_WIRED = false;
function enterGame(){
  show('screen-game');
  if (!G_WIRED){
    $('#rollsToggleBtn').onclick = () => $('.game-layout').classList.toggle('rolls-hidden');
    $('#hideRollsBtn').onclick = () => $('.game-layout').classList.add('rolls-hidden');
    $('#gLeaveBtn').onclick = leaveRoom;
    $('#sendBtn').onclick = submitAction;
    $('#actionInput').addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); submitAction(); } });
    // M5 — controles do Mestre
    $('#gmCtrlBtn').onclick = openGmModal;
    $('#gmCloseBtn').onclick = closeGmModal;
    $('#gmModalBack').onclick = e => { if (e.target === $('#gmModalBack')) closeGmModal(); };
    $('#gmModel').onchange = () => updateRoom({ model: $('#gmModel').value });
    $('#gmSkipBtn').onclick = gmSkipTurn;
    $('#gmEndBtn').onclick = gmEndMatch;
    $('#micBtn').onclick = toggleDictation;   // ditado por voz
    G_WIRED = true;
  }
  renderGame();
}

// ---------------- DITADO POR VOZ (Web Speech API, sem servidor) ----------------
let recog = null, recording = false;
function toggleDictation(){
  if (recording){ try { recog && recog.stop(); } catch(e){} return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR){ toast('Seu navegador não suporta ditado por voz. Use Chrome/Edge.'); return; }
  recog = new SR();
  recog.lang = 'pt-BR'; recog.interimResults = true; recog.continuous = false;
  const inp = $('#actionInput');
  const base = inp.value ? inp.value.trim() + ' ' : '';
  recog.onstart = () => { recording = true; $('#micBtn').classList.add('rec'); $('#micBtn').textContent = '⏺'; };
  recog.onresult = (ev) => {
    let txt = '';
    for (let i=0;i<ev.results.length;i++) txt += ev.results[i][0].transcript;
    inp.value = base + txt;
  };
  recog.onerror = (ev) => { toast('Voz: ' + (ev.error||'erro')); };
  recog.onend = () => { recording = false; $('#micBtn').classList.remove('rec'); $('#micBtn').textContent = '🎤'; inp.focus(); };
  try { recog.start(); } catch(e){ toast('Não consegui iniciar o microfone.'); }
}

// card de ficha no estilo do V1 (clicável → abre a ficha completa)
function mpCharCard(c, active, idx){
  const pct = Math.max(0, Math.round((c.hp/c.maxHp)*100));
  const sub = `${c.race}${c.subrace?` (${c.subrace})`:''} ${c.cls}${c.fightingStyle?` · ${c.fightingStyle}`:''} Nv${c.level}`;
  const minis = (typeof RULES!=='undefined' ? RULES.abilities : ['FOR','DES','CON','INT','SAB','CAR']).map(ab=>{
    const v = c.abilities ? c.abilities[ab] : '—';
    return `<div class="mini-ab"><div class="l">${ab}</div><div class="v">${v}</div></div>`;
  }).join('');
  const conds = (c.conditions||[]).length
    ? `<div class="cond-chips">${c.conditions.map(n=>`<span class="cond-chip ro" title="${escapeHtml((((typeof RULES!=='undefined'&&RULES.conditions[n])||{}).desc)||'')}">${escapeHtml(n)}</span>`).join('')}</div>`
    : '';
  return `<div class="char-card ${active?'active-turn':''}" data-sheet="${idx}" title="Ver ficha completa">
    <div class="cc-name">${escapeHtml(c.name)}</div>
    <div class="cc-sub"><span class="player-tag ${active?'p1':'p2'}">${escapeHtml(c.ownerName||c.player||'')}</span> · ${sub}</div>
    <div class="hpbar-wrap"><div class="hpbar" style="width:${pct}%"></div><div class="hpbar-label">${c.hp} / ${c.maxHp} HP</div></div>
    <div class="stat-row"><span>AC <b>${c.ca}</b></span><span>Speed <b>${c.speed}m</b></span><span>Prof <b>+${c.prof}</b></span></div>
    <div class="mini-abilities">${minis}</div>
    ${conds}
  </div>`;
}

// --- digitação do Mestre (efeito "sendo escrito", local em cada cliente) ---
let TYPING = false, typeTimer = null, revealedCount = -1, localBusy = false;
function clearTyping(){ if (typeTimer){ clearInterval(typeTimer); typeTimer = null; } TYPING = false; }
function msgHtml(m){
  if (m.role==='scene') return `<div style="align-self:center;font-family:var(--font-mono);font-size:0.74rem;letter-spacing:0.1em;color:var(--ember)">${escapeHtml(m.text)}</div>`;
  if (m.role==='player') return `<div class="msg player"><div class="who">${escapeHtml(m.who||'')}</div><div class="body">${escapeHtml(m.text)}</div></div>`;
  return `<div class="msg dm"><div class="body">${fmtNarr(escapeHtml(m.text))}</div></div>`;
}
function renderNarrative(st){
  const narr = $('#narrative');
  const hist = st.history || [];
  const lastIdx = hist.length - 1;
  const last = hist[lastIdx];
  const animate = !!last && last.role==='dm' && revealedCount < hist.length && !st.busy;
  // já estou digitando exatamente esta última fala? não reconstruo (preservo o que já apareceu)
  if (TYPING && animate) return;
  narr.innerHTML = hist.map((m,i)=> (animate && i===lastIdx) ? `<div class="msg dm"><div class="body"></div></div>` : msgHtml(m)).join('');
  narr.scrollTop = narr.scrollHeight;
  if (animate) startTyping(narr.lastElementChild.querySelector('.body'), last.text, hist.length);
}
function startTyping(bodyEl, full, count){
  clearTyping();
  TYPING = true;
  const narr = $('#narrative');
  const perTick = Math.max(2, Math.ceil(full.length / 180));   // longas terminam em ~3s
  let i = 0;
  typeTimer = setInterval(()=>{
    i += perTick;
    if (i >= full.length){
      bodyEl.innerHTML = fmtNarr(escapeHtml(full));
      narr.scrollTop = narr.scrollHeight;
      clearTyping();
      revealedCount = count;
      renderGame();                 // libera o input de quem é a vez
      return;
    }
    bodyEl.innerHTML = fmtNarr(escapeHtml(full.slice(0, i)));
    narr.scrollTop = narr.scrollHeight;
  }, 16);
}

function renderGame(){
  const st = ROOM.state || {};
  if (revealedCount < 0) revealedCount = (st.history||[]).length;   // não anima o histórico já existente
  if (st.busy) localBusy = false;                                   // a engine assumiu: solta o lock otimista
  const sc = (typeof CAMPAIGN !== 'undefined' && CAMPAIGN.scenes[st.sceneId]) || null;
  $('#chapterLabel').textContent = sc ? sc.chapter : '';
  $('#locationLabel').textContent = sc ? sc.location : '—';
  const turnIdx = st.turnIndex||0;
  // grupo (sidebar) — cards clicáveis abrem a ficha completa
  $('#charPanel').innerHTML = (st.characters||[]).map((c,idx)=> mpCharCard(c, idx===turnIdx, idx)).join('');
  $$('#charPanel [data-sheet]').forEach(el => el.onclick = () => openSheet(+el.dataset.sheet));
  // narrativa (com digitação do Mestre)
  renderNarrative(st);
  // vez / compositor — trava para TODOS enquanto o Mestre pensa (st.busy) ou digita (TYPING)
  const turnChar = (st.characters||[])[turnIdx];
  const locked = !!st.busy || TYPING || localBusy;
  const myTurn = turnChar && turnChar.owner === ME.id && !locked;
  $('#turnIndicator').innerHTML = st.busy
    ? 'O Mestre está pensando…'
    : (TYPING ? 'O Mestre está narrando…'
      : (myTurn ? `Sua vez, <b style="color:var(--ember)">${escapeHtml(turnChar.name)}</b>`
        : (turnChar ? `Aguardando <b style="color:var(--ember)">${escapeHtml(turnChar.name)}</b> (${escapeHtml(turnChar.ownerName||'')})…` : 'Aguardando o Mestre…')));
  const inp = $('#actionInput'), btn = $('#sendBtn');
  inp.disabled = !myTurn; btn.disabled = !myTurn;
  $('#micBtn').disabled = !myTurn;
  inp.placeholder = myTurn ? 'O que você faz?' : (locked ? 'O Mestre está narrando…' : 'Aguarde sua vez…');
  // sugestões de ação (só para quem é a vez, fora de "pensando/narrando")
  const sug = $('#suggestions'); const list = (myTurn && Array.isArray(st.suggestions)) ? st.suggestions : [];
  if (list.length){
    sug.style.display = '';
    sug.innerHTML = list.map((s,n)=>`<button class="sugg-chip" data-sg="${n}"><span class="sg">${n+1}</span>${escapeHtml(s)}</button>`).join('');
    $$('#suggestions [data-sg]').forEach(b => b.onclick = () => { inp.value = list[+b.dataset.sg]; inp.focus(); });
  } else { sug.style.display = 'none'; sug.innerHTML = ''; }
  // M5 — botão do Mestre só para o admin; painel acompanha o estado ao vivo
  $('#gmCtrlBtn').style.display = amIAdmin() ? '' : 'none';
  if ($('#gmModalBack').classList.contains('open')) renderGmModal();
}

// ---------------- M5: CONTROLES DO MESTRE (só admin) ----------------
function openGmModal(){
  if (!amIAdmin()) return;
  $('#gmModalBack').classList.add('open');
  renderGmModal();
}
function closeGmModal(){ $('#gmModalBack').classList.remove('open'); }

function renderGmModal(){
  const st = ROOM.state || {};
  $('#gmModel').value = ROOM.model || 'claude-haiku-4-5';
  const chars = st.characters || [];
  const turnChar = chars[st.turnIndex||0];
  $('#gmTurnNote').innerHTML = turnChar
    ? `Vez de <b style="color:var(--ember)">${escapeHtml(turnChar.name)}</b> (${escapeHtml(turnChar.ownerName||'')}).`
    : 'Sem personagens na vez.';
  $('#gmSkipBtn').disabled = chars.length < 2 || !!st.busy;
  // editor de HP
  $('#gmHpList').innerHTML = chars.map((c,idx)=>`
    <div class="gm-hp-row">
      <div><div class="nm">${escapeHtml(c.name)}</div><div class="sub2">${escapeHtml(c.ownerName||'')}</div></div>
      <div class="gm-steppers">
        <button class="gm-step" data-hp="${idx}" data-d="-5">−5</button>
        <button class="gm-step" data-hp="${idx}" data-d="-1">−1</button>
        <span class="gm-hpv">${c.hp} / ${c.maxHp}</span>
        <button class="gm-step" data-hp="${idx}" data-d="1">+1</button>
        <button class="gm-step" data-hp="${idx}" data-d="5">+5</button>
      </div>
    </div>`).join('');
  $$('#gmHpList [data-hp]').forEach(b => b.onclick = () => gmAdjustHp(+b.dataset.hp, +b.dataset.d));
}

async function gmAdjustHp(idx, delta){
  if (!amIAdmin()) return;
  const st = ROOM.state || {}; const c = (st.characters||[])[idx]; if (!c) return;
  c.hp = Math.max(0, Math.min(c.maxHp, (c.hp||0) + delta));
  await saveState(st);
  renderGame();
}

async function gmSkipTurn(){
  if (!amIAdmin()) return;
  const st = ROOM.state || {};
  if (!st.characters || st.characters.length < 2) return;
  const skipped = st.characters[st.turnIndex||0];
  st.history = st.history || [];
  st.history.push({ role:'scene', text:`(O Mestre passou a vez de ${skipped?skipped.name:'—'}.)` });
  advanceTurn(st);
  await saveState(st);
  renderGame();
  toast('Vez passada.');
}

async function gmEndMatch(){
  if (!amIAdmin()) return;
  if (!confirm('Encerrar a partida para todos? O grupo volta ao hub.')) return;
  await updateRoom({ status:'ended' });
  // o Realtime leva todos (inclusive você) de volta ao hub via refreshRoom
}

// ---------------- FICHA COMPLETA (clique no card) ----------------
function openSheet(i){
  const c = ((ROOM.state||{}).characters||[])[i]; if (!c) return;
  $('#sheetCard').innerHTML = mpSheetHtml(c, i);
  $('#sheetModal').classList.remove('hide');
  $('#sheetModal').onclick = e => { if (e.target.id === 'sheetModal') closeSheet(); };
  $('#sheetCloseBtn').onclick = closeSheet;
}
function closeSheet(){ $('#sheetModal').classList.add('hide'); }
// versão somente-leitura da ficha do V1 (atributos, perícias, magias, bolsa, perfil)
function mpSheetHtml(c, i){
  const A = (typeof RULES!=='undefined' ? RULES.abilities : ['FOR','DES','CON','INT','SAB','CAR']);
  const SK = (typeof RULES!=='undefined' ? RULES.skills : {});
  const abil = A.map(a => {
    const save = (c.saves||[]).includes(a), sm = abilityMod(c.abilities[a]) + (save?c.prof:0);
    return `<div class="sh-ab"><div class="l">${a}</div><div class="v">${c.abilities[a]}</div><div class="m">${fmtMod(abilityMod(c.abilities[a]))}</div><div class="sv ${save?'prof':''}">save ${fmtMod(sm)}</div></div>`;
  }).join('');
  const skills = Object.entries(SK).map(([name,ab]) => {
    const prof = (c.skills||[]).includes(name), m = abilityMod(c.abilities[ab]) + (prof?c.prof:0);
    return `<div class="sh-skill ${prof?'prof':''}"><span>${prof?'●':'○'} ${name} <small>(${ab})</small></span><b>${fmtMod(m)}</b></div>`;
  }).join('');
  const traits = (c.traits||[]).map(t=>`<span class="sh-tag">${escapeHtml(t)}</span>`).join('') || '—';
  const feats  = (c.features||[]).map(t=>`<span class="sh-tag">${escapeHtml(t)}</span>`).join('') || '—';
  const conds  = (c.conditions||[]).length ? `<h4>Condições</h4><div class="sh-tags">${c.conditions.map(t=>`<span class="sh-tag" title="${escapeHtml(((RULES.conditions[t]||{}).desc)||'')}">${escapeHtml(t)}</span>`).join('')}</div>` : '';
  const spell  = c.spellSlots ? `<div class="sh-line">Conjuração — habilidade ${c.spellAbility}, CD ${c.spellDC}, slots nv${c.spellSlots.level||1} ${c.spellSlots.max-c.spellSlots.used}/${c.spellSlots.max}${c.spellSlots2&&c.spellSlots2.max?`, nv2 ${c.spellSlots2.max-c.spellSlots2.used}/${c.spellSlots2.max}`:''}${c.cantripsKnown?`, truques ${c.cantripsKnown}`:''}</div>` : '';
  const known  = ((c.cantripsChosen&&c.cantripsChosen.length)||(c.spellsChosen&&c.spellsChosen.length))
    ? `<h4>Magias conhecidas</h4><div class="sh-tags">${(c.cantripsChosen||[]).map(s=>`<span class="sh-tag" title="${escapeHtml((RULES.spells[s]||{}).desc||'')}">${escapeHtml(s)} <small>(truque)</small></span>`).join('')}${(c.spellsChosen||[]).map(s=>`<span class="sh-tag" title="${escapeHtml((RULES.spells[s]||{}).desc||'')}">${escapeHtml(s)}</span>`).join('')}</div>` : '';
  const exp    = (c.expertise&&c.expertise.length) ? `<div class="sh-line" style="color:var(--myco)">Especialização (proficiência dobrada): ${c.expertise.join(', ')}</div>` : '';
  const inv    = (c.inventory||[]).map(it=>`<li>${escapeHtml(it)}</li>`).join('') || '<li>—</li>';
  const p = c.profile || {};
  const pf = (k,label) => `<div><span class="sh-prof-lbl">${label}</span><div class="sh-prof-txt">${escapeHtml(p[k]||'—')}</div></div>`;
  return `
  <div class="sh-top">
    <div><div class="sh-name">${escapeHtml(c.name)}</div><div class="sh-sub">${c.race}${c.subrace?` (${c.subrace})`:''} · ${c.cls}${c.archetype?` [${c.archetype}]`:''}${c.fightingStyle?` · ${c.fightingStyle}`:''} · Nível ${c.level} · ${escapeHtml(c.ownerName||c.player||'')}</div></div>
    <button class="rp-close" id="sheetCloseBtn">✕</button>
  </div>
  <div class="sh-stats">
    <div class="sh-stat"><span>CA</span><b>${c.ca}</b></div>
    <div class="sh-stat"><span>HP</span><b>${c.hp}/${c.maxHp}</b></div>
    <div class="sh-stat"><span>Deslocamento</span><b>${c.speed}m</b></div>
    <div class="sh-stat"><span>Iniciativa</span><b>${fmtMod(abilityMod(c.abilities.DES))}</b></div>
    <div class="sh-stat"><span>Proficiência</span><b>+${c.prof}</b></div>
    <div class="sh-stat"><span>Visão escuro</span><b>${c.darkvision?(c.darkvisionRange||18)+'m':'—'}</b></div>
  </div>
  <div class="sh-cols">
    <div class="sh-col">
      <h4>Atributos &amp; Saves</h4><div class="sh-abgrid">${abil}</div>
      <h4>Perícias</h4><div class="sh-skills">${skills}</div>
    </div>
    <div class="sh-col">
      <h4>Traços raciais</h4><div class="sh-tags">${traits}</div>
      <h4>Características de classe</h4><div class="sh-tags">${feats}</div>
      ${spell}${exp}${conds}${known}
      <h4>Idiomas</h4><div style="color:var(--stone-300);font-size:0.84rem">${(c.languages||[]).join(', ')||'—'}</div>
      <h4>Bolsa <span class="sh-gold">${c.gold!=null?c.gold:0} po</span></h4>
      <ul class="sh-inv">${inv}</ul>
    </div>
  </div>
  <h4>História do personagem</h4>
  <div class="sh-prof-grid">
    ${pf('appearance','Descrição física')}
    ${pf('context','Por que está aqui')}
    ${pf('motivation','Motivações')}
    ${pf('flaw','Defeitos')}
    ${pf('quality','Qualidades')}
  </div>`;
}

// condições: casar nome com RULES.conditions e localizar personagem (tolerante a caixa/acento)
function mpMatchCondition(name){
  if (!name || typeof RULES==='undefined') return null;
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const q = norm(name), keys = Object.keys(RULES.conditions||{});
  return keys.find(k=>norm(k)===q) || keys.find(k=>norm(k).startsWith(q)||q.startsWith(norm(k))) || null;
}
function mpFindChar(chars, name){
  if (!name) return -1;
  const q = name.trim().toLowerCase(), first = q.split(/\s+/)[0];
  let i = chars.findIndex(c=>c.name.toLowerCase()===q);
  if (i<0) i = chars.findIndex(c=>c.name.toLowerCase().split(/\s+/)[0]===first);
  if (i<0) i = chars.findIndex(c=>c.name.toLowerCase().includes(q)||q.includes(c.name.toLowerCase()));
  if (i<0) i = chars.findIndex(c=>(c.ownerName||'').toLowerCase()===q);
  return i;
}
// processa os marcadores [CONDICAO]/[REMOVER_CONDICAO]/[SUGESTOES] de uma resposta do Mestre
function applyMpMarkers(reply, st){
  const chars = st.characters || [];
  [...reply.matchAll(/\[CONDICAO:([^:\]]+):([^:\]]+)\]/gi)].forEach(m => {
    const ci = mpFindChar(chars, m[1]), key = mpMatchCondition(m[2]);
    if (ci>=0 && key){ chars[ci].conditions = chars[ci].conditions || []; if (!chars[ci].conditions.includes(key)) chars[ci].conditions.push(key); }
  });
  [...reply.matchAll(/\[REMOVER_CONDICAO:([^:\]]+):([^:\]]+)\]/gi)].forEach(m => {
    const ci = mpFindChar(chars, m[1]), key = mpMatchCondition(m[2]);
    if (ci>=0 && key && chars[ci].conditions) chars[ci].conditions = chars[ci].conditions.filter(n=>n!==key);
  });
  const sm = reply.match(/\[SUGESTOES:([^\]]+)\]/i);
  st.suggestions = sm ? sm[1].split('|').map(s=>s.trim()).filter(Boolean).slice(0,3) : [];
}

// ---------------- ENGINE (roda no cliente do ADMIN) ----------------
async function saveState(st){
  ROOM.state = st;
  await supa.from('rooms').update({ state: st, scene_id: st.sceneId, turn_owner: (st.characters[st.turnIndex]||{}).owner || null }).eq('id', ROOM.id);
}
function advanceTurn(st){
  if (!st.characters || !st.characters.length) return;
  st.turnIndex = ((st.turnIndex||0) + 1) % st.characters.length;
}
// jogador envia ação → vai para a fila room_actions
async function submitAction(){
  const inp = $('#actionInput'); const txt = inp.value.trim(); if (!txt) return;
  const st = ROOM.state || {}; const active = (st.characters||[])[st.turnIndex||0];
  if (!active || active.owner !== ME.id){ toast('Não é sua vez.'); return; }
  inp.value = ''; localBusy = true; renderGame();   // trava já, antes da engine confirmar
  const { error } = await supa.from('room_actions').insert({
    room_id: ROOM.id, user_id: ME.id, display_name: active.name, text: txt
  });
  if (error){ localBusy = false; toast('Erro ao enviar: '+error.message); renderGame(); }
}
// admin processa a ação: registra, chama a IA, narra e passa a vez
let engineBusy = false;
async function onPlayerAction(action){
  if (!amIAdmin() || !ROOM || ROOM.status !== 'playing') return;
  if (action.processed) return;
  if (engineBusy){ setTimeout(()=>onPlayerAction(action), 800); return; }   // serializa
  engineBusy = true;
  const st = ROOM.state || {};
  try {
    st.history = st.history || [];
    st.history.push({ role:'player', who: action.display_name, text: action.text });
    st.busy = true;                                       // trava TODOS (via Realtime) enquanto o Mestre pensa
    await saveState(st);                                  // mostra a ação a todos já + estado "pensando"
    renderGame();
    let reply;
    try { reply = await callClaudeMp(buildMpHistory(st), buildMpSystemPrompt(st), 700); }
    catch (e) { reply = `*(O Mestre tropeçou: ${e.message})*`; }
    applyMpMarkers(reply, st);                                // condições + sugestões antes de limpar
    const clean = reply.replace(/\[[^\]]*\]/g, '').trim();    // remove os marcadores do texto exibido
    st.history.push({ role:'dm', text: clean || '…' });
    advanceTurn(st);
    st.busy = false;                                       // libera; cada cliente ainda digita a fala localmente
    await saveState(st);
  } finally {
    engineBusy = false;
    if (st.busy){ st.busy = false; try { await saveState(st); } catch(e){} }  // nunca deixa o grupo travado
    try { await supa.from('room_actions').update({ processed:true }).eq('id', action.id); } catch(e){}
    renderGame();
  }
}
function buildMpHistory(st){
  const msgs = [];
  (st.history||[]).slice(-16).forEach(m => {
    if (m.role==='dm') msgs.push({ role:'assistant', content: m.text });
    else if (m.role==='player') msgs.push({ role:'user', content:`[${m.who}]: ${m.text}` });
  });
  if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({ role:'user', content:'(Apresente a cena e abra para a ação dos jogadores.)' });
  return msgs;
}
function buildMpSystemPrompt(st){
  const sc = CAMPAIGN.scenes[st.sceneId] || {};
  const sheets = (st.characters||[]).map(c =>
    `- ${c.name} (jogador ${c.ownerName||'?'}): ${c.race}${c.subrace?` (${c.subrace})`:''} ${c.cls} Nv${c.level}. HP ${c.hp}/${c.maxHp}, CA ${c.ca}. ` +
    `Atributos: ${RULES.abilities.map(a=>`${a} ${c.abilities[a]}(${fmtMod(abilityMod(c.abilities[a]))})`).join(', ')}.` +
    ((c.cantripsChosen&&c.cantripsChosen.length)?` Truques: ${c.cantripsChosen.join(', ')}.`:'') +
    ((c.spellsChosen&&c.spellsChosen.length)?` Magias nv1: ${c.spellsChosen.join(', ')}.`:'')
  ).join('\n');
  const npcs = sc.npcs ? Object.entries(sc.npcs).map(([n,d])=>`- ${n}: ${d}`).join('\n') : 'Nenhum NPC fixo.';
  return `Você é o Mestre (DM) de uma aventura de D&D 5e: "${CAMPAIGN.title}".
${CAMPAIGN.premise||''}

Esta é uma MESA MULTIJOGADOR: vários jogadores, cada um controla SEU personagem (o nome do jogador vem entre colchetes antes da ação). Dirija-se ao grupo; quando um personagem específico agir, narre o resultado dele e envolva os outros. Seja vívido e conciso (2-3 parágrafos). Português do Brasil; termos de regra em inglês. NÃO role dados nem decida sucesso/falha de testes incertos — isso é do sistema; narre de forma aberta e plausível.

## CENA ATUAL: ${sc.chapter||''} — ${sc.location||''}
${sc.summary||''}
Objetivos: ${(sc.objectives||[]).join('; ')}
${sc.npcs?'':''}

## NPCs DESTA CENA
${npcs}

## PERSONAGENS DO GRUPO
${sheets}

## MARCADORES (o sistema processa e REMOVE do texto exibido — não os explique)
- Quando um personagem passar a sofrer uma CONDIÇÃO (Apêndice A): [CONDICAO:NomeDoPersonagem:Condição] — ex.: [CONDICAO:${(st.characters&&st.characters[0]?st.characters[0].name:'Garrett')}:Envenenado]. Quando a condição acabar: [REMOVER_CONDICAO:NomeDoPersonagem:Condição]. Condições válidas: ${Object.keys(RULES.conditions).join(', ')}.
- SEMPRE termine a resposta com 2 ou 3 sugestões curtas de ação para o próximo jogador, no formato exato: [SUGESTOES: ação curta 1 | ação curta 2 | ação curta 3]. São atalhos clicáveis; o jogador ainda pode digitar livremente.

Responda à ação do jogador, faça a história avançar e termine abrindo para a próxima ação do grupo (com as sugestões no final).`;
}

window.addEventListener('beforeunload', ()=>{ try{ if(roomChannel) supa.removeChannel(roomChannel); }catch(e){} });
initAuth();
