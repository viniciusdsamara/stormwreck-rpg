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
// depois de autenticado: se veio por link de convite, entra direto na sala
async function afterAuth(){
  if (PENDING_CODE){ const code = PENDING_CODE; PENDING_CODE = null; clearUrlCode(); await joinByCode(code, true); }
  else enterHub();
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
function enterHub(){
  show('screen-hub');
  $('#hubEmail').textContent = ME.email;
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
  renderRoom();
}
function subscribeRoom(){
  if (roomChannel) supa.removeChannel(roomChannel);
  roomChannel = supa.channel('room-'+ROOM.id)
    .on('postgres_changes', { event:'*', schema:'public', table:'room_members', filter:`room_id=eq.${ROOM.id}` }, refreshRoom)
    .on('postgres_changes', { event:'*', schema:'public', table:'rooms', filter:`id=eq.${ROOM.id}` }, refreshRoom)
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
    return `<div class="member ${isMe?'me':''}">
      <span class="mname">${m.display_name||'?'}${isMe?' <small>(você)</small>':''}</span>
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
    $('#readyBtn').textContent = me.ready ? '✓ Pronto (clique p/ cancelar)' : 'Marcar como pronto';
    $('#readyBtn').classList.toggle('on', !!me.ready);
    $('#readyBtn').onclick = toggleReady;
    $('#readyNote').textContent = 'Na próxima fase você criará seu personagem aqui.';
  } else { readyWrap.style.display='none'; }

  // painel do admin
  const ap = $('#adminPanel');
  if (admin){
    ap.style.display='';
    $('#admModel').value = ROOM.model;
    $('#admModel').onchange = ()=> updateRoom({ model: $('#admModel').value });
    $('#admGm').checked = !!ROOM.gm_mode;
    $('#admGm').onchange = ()=> updateRoom({ gm_mode: $('#admGm').checked });
    const allReady = players.length>0 && players.every(m=>m.ready);
    $('#startBtn').disabled = true; // o início do jogo entra na Fase M3
    $('#startNote').textContent = allReady
      ? 'Todos prontos. (Iniciar a partida chega na próxima fase.)'
      : 'Aguardando todos ficarem prontos.';
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

window.addEventListener('beforeunload', ()=>{ try{ if(roomChannel) supa.removeChannel(roomChannel); }catch(e){} });
initAuth();
