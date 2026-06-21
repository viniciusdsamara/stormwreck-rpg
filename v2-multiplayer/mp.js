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
    G_WIRED = true;
  }
  renderGame();
}

// card de ficha no estilo do V1
function mpCharCard(c, active){
  const pct = Math.max(0, Math.round((c.hp/c.maxHp)*100));
  const sub = `${c.race}${c.subrace?` (${c.subrace})`:''} ${c.cls}${c.fightingStyle?` · ${c.fightingStyle}`:''} Nv${c.level}`;
  const minis = (typeof RULES!=='undefined' ? RULES.abilities : ['FOR','DES','CON','INT','SAB','CAR']).map(ab=>{
    const v = c.abilities ? c.abilities[ab] : '—';
    return `<div class="mini-ab"><div class="l">${ab}</div><div class="v">${v}</div></div>`;
  }).join('');
  return `<div class="char-card ${active?'active-turn':''}">
    <div class="cc-name">${escapeHtml(c.name)}</div>
    <div class="cc-sub"><span class="player-tag ${active?'p1':'p2'}">${escapeHtml(c.ownerName||c.player||'')}</span> · ${sub}</div>
    <div class="hpbar-wrap"><div class="hpbar" style="width:${pct}%"></div><div class="hpbar-label">${c.hp} / ${c.maxHp} HP</div></div>
    <div class="stat-row"><span>AC <b>${c.ca}</b></span><span>Speed <b>${c.speed}m</b></span><span>Prof <b>+${c.prof}</b></span></div>
    <div class="mini-abilities">${minis}</div>
  </div>`;
}

function renderGame(){
  const st = ROOM.state || {};
  const sc = (typeof CAMPAIGN !== 'undefined' && CAMPAIGN.scenes[st.sceneId]) || null;
  $('#chapterLabel').textContent = sc ? sc.chapter : '';
  $('#locationLabel').textContent = sc ? sc.location : '—';
  const turnIdx = st.turnIndex||0;
  // grupo (sidebar)
  $('#charPanel').innerHTML = (st.characters||[]).map((c,idx)=> mpCharCard(c, idx===turnIdx)).join('');
  // narrativa (balões do V1)
  $('#narrative').innerHTML = (st.history||[]).map(m=>{
    if (m.role==='scene') return `<div style="align-self:center;font-family:var(--font-mono);font-size:0.74rem;letter-spacing:0.1em;color:var(--ember)">${escapeHtml(m.text)}</div>`;
    if (m.role==='player') return `<div class="msg player"><div class="who">${escapeHtml(m.who||'')}</div><div class="body">${escapeHtml(m.text)}</div></div>`;
    return `<div class="msg dm"><div class="body">${fmtNarr(escapeHtml(m.text))}</div></div>`;
  }).join('');
  $('#narrative').scrollTop = $('#narrative').scrollHeight;
  // vez / compositor
  const turnChar = (st.characters||[])[turnIdx];
  const myTurn = turnChar && turnChar.owner === ME.id && !ROOM._engineBusy;
  $('#turnIndicator').innerHTML = ROOM._engineBusy
    ? 'O Mestre está narrando…'
    : (myTurn ? `Sua vez, <b style="color:var(--ember)">${escapeHtml(turnChar.name)}</b>`
      : (turnChar ? `Aguardando <b style="color:var(--ember)">${escapeHtml(turnChar.name)}</b> (${escapeHtml(turnChar.ownerName||'')})…` : 'Aguardando o Mestre…'));
  const inp = $('#actionInput'), btn = $('#sendBtn');
  inp.disabled = !myTurn; btn.disabled = !myTurn;
  inp.placeholder = myTurn ? 'O que você faz?' : 'Aguarde sua vez…';
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
  $('#gmSkipBtn').disabled = chars.length < 2 || ROOM._engineBusy;
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
  inp.value = ''; $('#sendBtn').disabled = true;
  const { error } = await supa.from('room_actions').insert({
    room_id: ROOM.id, user_id: ME.id, display_name: active.name, text: txt
  });
  $('#sendBtn').disabled = false;
  if (error) toast('Erro ao enviar: '+error.message);
}
// admin processa a ação: registra, chama a IA, narra e passa a vez
let engineBusy = false;
async function onPlayerAction(action){
  if (!amIAdmin() || !ROOM || ROOM.status !== 'playing') return;
  if (action.processed) return;
  if (engineBusy){ setTimeout(()=>onPlayerAction(action), 800); return; }   // serializa
  engineBusy = true; ROOM._engineBusy = true; renderGame();
  try {
    const st = ROOM.state || {};
    st.history = st.history || [];
    st.history.push({ role:'player', who: action.display_name, text: action.text });
    await saveState(st);                                  // mostra a ação a todos já
    let reply;
    try { reply = await callClaudeMp(buildMpHistory(st), buildMpSystemPrompt(st), 700); }
    catch (e) { reply = `*(O Mestre tropeçou: ${e.message})*`; }
    const clean = reply.replace(/\[[^\]]*\]/g, '').trim();  // marcadores mecânicos chegam depois
    st.history.push({ role:'dm', text: clean || '…' });
    advanceTurn(st);
    await saveState(st);
  } finally {
    engineBusy = false; ROOM._engineBusy = false;
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

Esta é uma MESA MULTIJOGADOR: vários jogadores, cada um controla SEU personagem (o nome do jogador vem entre colchetes antes da ação). Dirija-se ao grupo; quando um personagem específico agir, narre o resultado dele e envolva os outros. Seja vívido e conciso (2-3 parágrafos). Português do Brasil; termos de regra em inglês. NÃO use marcadores de sistema nem decida sucessos mecânicos por conta própria — por enquanto, narre de forma aberta e plausível.

## CENA ATUAL: ${sc.chapter||''} — ${sc.location||''}
${sc.summary||''}
Objetivos: ${(sc.objectives||[]).join('; ')}
${sc.npcs?'':''}

## NPCs DESTA CENA
${npcs}

## PERSONAGENS DO GRUPO
${sheets}

Responda à ação do jogador, faça a história avançar e termine abrindo para a próxima ação do grupo.`;
}

window.addEventListener('beforeunload', ()=>{ try{ if(roomChannel) supa.removeChannel(roomChannel); }catch(e){} });
initAuth();
