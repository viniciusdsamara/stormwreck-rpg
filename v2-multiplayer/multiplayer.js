// ====================================================================
//  Camada MULTIPLAYER sobre a engine/UI do V1 (game.js).
//  Reaproveita STATE, $, supa, showScreen, renderSidebar, addMsg,
//  beginScene, askDM, etc. — a tela de jogo e a criação são as do V1.
//  Só o ADMIN roda a engine; jogadores enviam ações e renderizam o estado.
// ====================================================================
window.MP = { active: true };

let R_ROOM = null, R_MEMBERS = [], R_CHANNEL = null, R_ENGINE_BUSY = false;
let R_PENDING_CODE = (new URLSearchParams(location.search).get('sala') || '').toUpperCase() || null;

MP.isAdmin = () => { const m = R_MEMBERS.find(x => x.user_id === STATE.user?.id); return m && m.role === 'admin'; };
const myMember = () => R_MEMBERS.find(x => x.user_id === STATE.user?.id);
const mpName = () => (STATE.user?.email || 'Jogador').split('@')[0];
function roomLink(){ return `${location.origin}${location.pathname}?sala=${R_ROOM.code}`; }

// ---------- ponto de entrada (chamado por enterApp do game.js) ----------
MP.enterLobby = async function(){
  const { data: allowed } = await supa.rpc('am_i_allowed');
  if (!allowed){ MP.showPending(); return; }
  if (R_PENDING_CODE){ const code = R_PENDING_CODE; R_PENDING_CODE = null; history.replaceState(null,'',location.pathname); await MP.joinByCode(code, true); return; }
  MP.showHub();
};
MP.showPending = function(){
  showScreen('screen-mp-pending');
  $('#mpPendReload').onclick = () => location.reload();
  $('#mpPendLogout').onclick = doLogout;
};
MP.showHub = function(){
  showScreen('screen-mp-hub');
  $('#mpHubEmail').textContent = STATE.user.email;
  $('#mpRoomName').value = `Mesa de ${mpName()}`;
  supa.rpc('is_app_admin').then(({data})=>{ if (data) $('#mpAdminLink').style.display='inline'; });
  $('#mpHubLogout').onclick = doLogout;
  $('#mpCreateBtn').onclick = MP.createRoom;
  $('#mpJoinBtn').onclick = () => { const c=($('#mpJoinCode').value||'').trim().toUpperCase(); if(c.length>=4) MP.joinByCode(c); else toast('Digite o código.'); };
  $('#mpJoinCode').onkeydown = e => { if(e.key==='Enter') $('#mpJoinBtn').click(); };
};
function genCode(){ const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<6;i++) s+=A[Math.floor(Math.random()*A.length)]; return s; }

MP.createRoom = async function(){
  const name = $('#mpRoomName').value.trim() || `Mesa de ${mpName()}`;
  const adminPlays = $('#mpAdminRole').value === 'play';
  const model = $('#mpRoomModel').value;
  $('#mpCreateBtn').disabled = true;
  let room=null, err=null;
  for (let t=0; t<6 && !room; t++){
    const { data, error } = await supa.from('rooms').insert({ code:genCode(), host_id:STATE.user.id, name, admin_plays:adminPlays, model }).select().single();
    if (!error){ room=data; break; } err=error;
    if (!String(error.message||'').toLowerCase().includes('duplicate')) break;
  }
  if (!room){ $('#mpCreateBtn').disabled=false; toast('Erro ao criar sala: '+(err?err.message:'?')); return; }
  await supa.from('room_members').insert({ room_id:room.id, user_id:STATE.user.id, display_name:mpName(), role:'admin', ready: !adminPlays });
  $('#mpCreateBtn').disabled=false;
  R_ROOM = room; MP.enterRoom();
};
MP.joinByCode = async function(code, fromLink){
  const { data, error } = await supa.rpc('join_room', { p_code: code, p_name: mpName() });
  if (error){ toast(error.message||'Não foi possível entrar.'); if(fromLink) MP.showHub(); return; }
  const { data:room } = await supa.from('rooms').select('*').eq('id', data).single();
  if (!room){ toast('Sala não pôde ser carregada.'); if(fromLink) MP.showHub(); return; }
  R_ROOM = room; MP.enterRoom();
};

// ---------- sala (lobby) ----------
MP.enterRoom = async function(){ await MP.refresh(); MP.subscribe(); };
MP.subscribe = function(){
  if (R_CHANNEL) supa.removeChannel(R_CHANNEL);
  R_CHANNEL = supa.channel('room-'+R_ROOM.id)
    .on('postgres_changes', { event:'*', schema:'public', table:'room_members', filter:`room_id=eq.${R_ROOM.id}` }, MP.refresh)
    .on('postgres_changes', { event:'*', schema:'public', table:'rooms', filter:`id=eq.${R_ROOM.id}` }, MP.refresh)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'room_actions', filter:`room_id=eq.${R_ROOM.id}` }, p => MP.onAction(p.new))
    .subscribe();
};
MP.refresh = async function(){
  if (!R_ROOM) return;
  const { data:room } = await supa.from('rooms').select('*').eq('id', R_ROOM.id).single(); if (room) R_ROOM = room;
  const { data:members } = await supa.from('room_members').select('*').eq('room_id', R_ROOM.id).order('joined_at'); R_MEMBERS = members||[];
  if (R_ROOM.status === 'ended'){ toast('A sala foi encerrada.'); await MP.leaveQuiet(); MP.showHub(); return; }
  if (R_ROOM.status === 'playing'){ MP.syncGame(); return; }
  MP.renderRoom();
};
MP.renderRoom = function(){
  showScreen('screen-mp-room');
  const admin = MP.isAdmin();
  $('#mpRoomTitle').textContent = R_ROOM.name || 'Sala';
  $('#mpRoomCode').textContent = R_ROOM.code;
  $('#mpCopyLink').onclick = async ()=>{ try{ await navigator.clipboard.writeText(roomLink()); toast('Link copiado!'); }catch(e){ toast('Link: '+roomLink()); } };
  const players = R_MEMBERS.filter(m => m.role!=='admin' || R_ROOM.admin_plays);
  const ready = players.filter(m=>m.ready && m.sheet).length;
  $('#mpRoomCount').textContent = `· ${R_MEMBERS.length} na sala · ${ready}/${players.length} prontos`;
  $('#mpMemberList').innerHTML = R_MEMBERS.map(m=>{
    const me = m.user_id===STATE.user.id;
    const role = m.role==='admin' ? `<span class="mp-tag adm">Admin${R_ROOM.admin_plays?'·joga':'·Mestre'}</span>` : `<span class="mp-tag">Jogador</span>`;
    const isP = m.role!=='admin' || R_ROOM.admin_plays;
    const st = !isP ? `<span class="mp-tag dm">Mestre</span>` : (m.sheet ? `<span class="mp-tag ok">✓ pronto</span>` : `<span class="mp-tag wait">criando…</span>`);
    const ch = m.sheet ? `<div class="mp-mc">${m.sheet.race}${m.sheet.subrace?` (${m.sheet.subrace})`:''} ${m.sheet.cls} Nv${m.sheet.level}</div>` : '';
    const kick = (admin && !me) ? `<button class="mp-x" data-kick="${m.user_id}">✕</button>` : '';
    return `<div class="mp-member ${me?'me':''}"><div><b>${m.display_name||'?'}</b>${me?' <small>(você)</small>':''}${ch}</div><div class="mp-tags">${role}${st}${kick}</div></div>`;
  }).join('');
  $$('#mpMemberList [data-kick]').forEach(b=> b.onclick = async ()=>{ if(confirm('Remover este jogador?')) await supa.from('room_members').delete().eq('room_id',R_ROOM.id).eq('user_id',b.dataset.kick); });

  const me = myMember();
  const iAmPlayer = me && (me.role!=='admin' || R_ROOM.admin_plays);
  $('#mpReadyWrap').style.display = iAmPlayer ? '' : 'none';
  if (iAmPlayer){
    if (me.sheet){ $('#mpReadyBtn').textContent='♻️ Refazer personagem'; $('#mpReadyNote').innerHTML = `✓ <b style="color:var(--myco)">${me.sheet.name}</b> — ${me.sheet.race} ${me.sheet.cls} Nv${me.sheet.level}`; }
    else { $('#mpReadyBtn').textContent='🧙 Criar meu personagem'; $('#mpReadyNote').textContent='Crie seu aventureiro para ficar pronto.'; }
    $('#mpReadyBtn').onclick = MP.openCreate;
  }
  const ap = $('#mpAdminPanel');
  if (admin){
    ap.style.display='';
    const allReady = players.length>0 && players.every(m=>m.ready && m.sheet);
    $('#mpStartBtn').disabled = !allReady;
    $('#mpStartBtn').onclick = MP.startMatch;
    $('#mpStartNote').textContent = allReady ? 'Todos prontos. Pode iniciar a aventura!' : 'Aguardando todos criarem o personagem.';
  } else ap.style.display='none';
  $('#mpLeaveBtn').onclick = MP.leave;
};

// ---------- criação (reusa a do V1; hook chama MP.onCharacter) ----------
MP.openCreate = function(){
  STATE.creationSlot = 0;
  if ($('#creationStepLabel')) $('#creationStepLabel').textContent = 'Seu personagem';
  showScreen('screen-creation');
  showCreationModePick();
};
MP.onCharacter = async function(char){
  char.player = mpName();
  await supa.from('room_members').update({ sheet: char, ready: true }).eq('room_id', R_ROOM.id).eq('user_id', STATE.user.id);
  toast('Personagem pronto: ' + char.name);
  await MP.refresh();
};

// ---------- sair ----------
MP.leaveQuiet = async function(){
  try { if (R_CHANNEL){ await supa.removeChannel(R_CHANNEL); R_CHANNEL=null; }
    if (R_ROOM && STATE.user){ if (MP.isAdmin()) await supa.from('rooms').update({status:'ended'}).eq('id',R_ROOM.id);
      else await supa.from('room_members').delete().eq('room_id',R_ROOM.id).eq('user_id',STATE.user.id); } } catch(e){}
  R_ROOM=null; R_MEMBERS=[];
};
MP.leave = async function(){
  if (!confirm(MP.isAdmin() ? 'Você é o admin — sair encerra a sala. Continuar?' : 'Sair desta sala?')) return;
  await MP.leaveQuiet(); MP.showHub();
};

// ---------- INÍCIO DA PARTIDA (admin) ----------
MP.serialize = () => ({ characters:STATE.characters, activeChar:STATE.activeChar, sceneId:STATE.sceneId,
  history:STATE.history, inCombat:STATE.inCombat, combat:STATE.combat, visited:STATE.visited, revealed:STATE.revealed, gmMode:STATE.gmMode, model:STATE.model });
MP.load = (s) => { s=s||{}; STATE.characters=s.characters||[]; STATE.activeChar=s.activeChar||0; STATE.sceneId=s.sceneId||'chegada';
  STATE.history=s.history||[]; STATE.inCombat=!!s.inCombat; STATE.combat=s.combat||null; STATE.visited=s.visited||[]; STATE.revealed=s.revealed||[]; STATE.gmMode=!!s.gmMode; if(s.model) STATE.model=s.model; };
MP.saveState = async () => { try{ await supa.from('rooms').update({ state: MP.serialize(), scene_id: STATE.sceneId, status:'playing' }).eq('id', R_ROOM.id); }catch(e){} };

MP.startMatch = async function(){
  const players = R_MEMBERS.filter(m => (m.role!=='admin' || R_ROOM.admin_plays) && m.sheet);
  if (!players.length){ toast('Ninguém tem personagem.'); return; }
  STATE.characters = players.map(m => Object.assign({}, m.sheet, { owner:m.user_id, ownerName:m.display_name }));
  STATE.model = R_ROOM.model; STATE.gmMode = !!R_ROOM.gm_mode;
  STATE.activeChar=0; STATE.sceneId='chegada'; STATE.history=[]; STATE.visited=[]; STATE.revealed=[]; STATE.inCombat=false; STATE.combat=null;
  $('#mpStartBtn').disabled = true;
  await supa.from('rooms').update({ status:'playing', scene_id:'chegada', state: MP.serialize() }).eq('id', R_ROOM.id);
  MP.enterGameScreen();
  R_ENGINE_BUSY = true;
  try { await beginScene('chegada', true); } catch(e){ addMsg('dm', 'Erro: '+e.message); }
  R_ENGINE_BUSY = false;
  await MP.saveState();
};

// ---------- TELA DE JOGO (a do V1) ----------
let R_ON_GAME = false;
MP.enterGameScreen = function(){
  showScreen('screen-game'); R_ON_GAME = true;
  const set=(id,fn)=>{ const el=$('#'+id); if(el) el.onclick=fn; };
  if ($('#rollLogList')) $('#rollLogList').innerHTML = '<div class="rolllog-empty">Nenhuma rolagem ainda.</div>';
  if ($('#saveBtn')) $('#saveBtn').style.display='none';
  set('menuBtn', openOptionsMenu);
  set('rollsToggleBtn', ()=>$('.game-layout').classList.toggle('rolls-hidden'));
  set('hideRollsBtn', ()=>$('.game-layout').classList.add('rolls-hidden'));
  set('mapBtn', openMap);
  set('sendBtn', MP.submitAction);
  const inp=$('#actionInput'); if(inp) inp.onkeydown = e => { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); MP.submitAction(); } };
  renderSidebar(); updateTopbar(); updateQuickActions(); updateTurnIndicator();
};
MP.renderNarrativeFromHistory = function(){
  const n = $('#narrative'); if(!n) return; n.innerHTML='';
  (STATE.history||[]).forEach(m=>{
    if (m.role==='assistant'){ const clean=(m.content||'').replace(/\[[^\]]+\]/g,'').trim(); if(clean) addMsg('dm', formatNarration(clean)); }
    else if (m.role==='user' && !m.content.startsWith('[RESULTADO') && !m.content.includes('Apresente a cena') && !m.content.includes('Continue a partir')){
      const mt=m.content.match(/^\[([^\]]+)\]:\s*(.+)/s); if(mt) addMsg('player', mt[2], mt[1]); }
  });
};
MP.syncGame = function(){
  if (MP.isAdmin() && R_ENGINE_BUSY) return;        // admin no meio da engine: não sobrescreve
  MP.load(R_ROOM.state||{});
  if (!R_ON_GAME) MP.enterGameScreen();
  renderSidebar(); updateTopbar(); updateQuickActions(); updateTurnIndicator();
  if (typeof renderCombatBar==='function') renderCombatBar();
  if (!MP.isAdmin()) MP.renderNarrativeFromHistory();   // admin já vê ao vivo (com roll cards)
};

// ---------- AÇÕES ----------
MP.submitAction = async function(){
  const inp=$('#actionInput'); const txt=(inp.value||'').trim(); if(!txt) return;
  const active = STATE.characters[STATE.activeChar];
  if (!active || active.owner !== STATE.user.id){ toast('Não é sua vez.'); return; }
  inp.value='';
  const { error } = await supa.from('room_actions').insert({ room_id:R_ROOM.id, user_id:STATE.user.id, display_name:active.name, text:txt });
  if (error) toast('Erro ao enviar: '+error.message);
};
// admin processa a ação rodando a engine do V1, depois serializa
MP.onAction = async function(a){
  if (!MP.isAdmin() || !R_ROOM || R_ROOM.status!=='playing' || a.processed) return;
  if (R_ENGINE_BUSY){ setTimeout(()=>MP.onAction(a), 800); return; }
  R_ENGINE_BUSY = true;
  try {
    const idx = STATE.characters.findIndex(c => c.owner === a.user_id);
    if (idx>=0) STATE.activeChar = idx;
    const nm = (STATE.characters[STATE.activeChar]||{}).name || a.display_name;
    addMsg('player', a.text, nm);
    await askDM(`[${nm}]: ${a.text}`, false);
    await MP.saveState();
  } catch(e){ addMsg('dm','Erro: '+e.message); }
  finally {
    R_ENGINE_BUSY=false;
    try{ await supa.from('room_actions').update({processed:true}).eq('id', a.id); }catch(e){}
  }
};

window.addEventListener('beforeunload', ()=>{ try{ if(R_CHANNEL) supa.removeChannel(R_CHANNEL); }catch(e){} });
