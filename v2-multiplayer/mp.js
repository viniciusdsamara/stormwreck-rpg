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
// robustez: presença do Mestre, estado de conexão e reconexão
let MESTRE_PRESENTE = true, CONN = 'live', reconnectTimer = null, reconnectDelay = 1000, backlogRunning = false;
const PROCESSED_IDS = new Set();   // evita reprocessar a mesma ação (backlog × Realtime)

function roomLink(){ return `${location.origin}${location.pathname}?sala=${ROOM.code}`; }
function clearUrlCode(){ try { history.replaceState(null, '', location.pathname); } catch(e){} }

// ---------------- MAPA DA ILHA (mesmas regras do V1: névoa de guerra) ----------------
const MAP_LOCS = {
  praia:        { x:208, y:322, label:"Praia de Dragon's Rest", chapter:'Cap. 1', icon:'⚓',
                  summary:'Onde o naufrágio do Próspero lançou os heróis. Areia escura e destroços fumegantes.' },
  claustro:     { x:250, y:236, label:"Claustro de Dragon's Rest", chapter:'Cap. 1', icon:'🏯',
                  summary:'Refúgio dos monges sob a guarda da dragão de bronze Runara. Porto seguro da campanha.' },
  cavernas:     { x:118, y:262, label:'Cavernas Seagrow', chapter:'Cap. 2', icon:'🍄',
                  summary:'Túneis úmidos tomados por fungos myconídeos — e a tumba selada de Sharruth.' },
  naufragio:    { x:168, y:108, label:'Naufrágio Amaldiçoado', chapter:'Cap. 3', icon:'☠️',
                  summary:'Casco apodrecido na costa norte, assombrado por mortos-vivos e maré sombria.' },
  observatorio: { x:236, y:64,  label:'Observatório do Penhasco', chapter:'Cap. 4', icon:'🔭',
                  summary:'No alto do penhasco de basalto, palco do confronto final com a dragão das tempestades.' }
};
// cada cena do roteiro → local no mapa (chegada = alto-mar, sem local)
const SCENE_LOC = {
  praia:'praia',
  claustro:'claustro', claustro_volta:'claustro', epilogo:'claustro',
  cavernas:'cavernas', sharruth:'cavernas',
  naufragio:'naufragio', observatorio:'observatorio'
};
const MAP_ROUTE = ['praia','claustro','cavernas','claustro','naufragio','observatorio'];

function mpMapKnown(st, id){ return (st.visited||[]).includes(id) || (st.revealed||[]).includes(id); }
// marca o local da cena atual como visitado (roda na engine do admin)
function mpMarkSceneVisited(st){
  const loc = SCENE_LOC[st.sceneId];
  if (loc){ st.visited = st.visited || []; if (!st.visited.includes(loc)) st.visited.push(loc); }
  // revela no mapa o destino da PRÓXIMA cena (ex.: em alto-mar já dá pra ver a praia)
  const sc = (typeof CAMPAIGN!=='undefined' && CAMPAIGN.scenes[st.sceneId]) || {};
  const nextLoc = sc.next && SCENE_LOC[sc.next];
  if (nextLoc && !mpMapKnown(st, nextLoc)){ st.revealed = st.revealed || []; st.revealed.push(nextLoc); }
}
// revela um local avistado/ouvido pelo Mestre ([REVELAR_LOCAL:id]); retorna true se novo
function mpRevealLocation(st, id){
  if (!MAP_LOCS[id] || mpMapKnown(st, id)) return false;
  st.revealed = st.revealed || []; st.revealed.push(id);
  return true;
}
function mapSvg(st){
  const cur = SCENE_LOC[st.sceneId];
  let paths = '';
  for (let i = 0; i < MAP_ROUTE.length - 1; i++){
    const a = MAP_LOCS[MAP_ROUTE[i]], b = MAP_LOCS[MAP_ROUTE[i+1]];
    if (!a || !b) continue;
    if (!mpMapKnown(st, MAP_ROUTE[i]) || !mpMapKnown(st, MAP_ROUTE[i+1])) continue;
    const done = (st.visited||[]).includes(MAP_ROUTE[i]) && (st.visited||[]).includes(MAP_ROUTE[i+1]);
    paths += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="map-route ${done?'done':''}" />`;
  }
  const markers = Object.entries(MAP_LOCS).map(([id, m]) => {
    const isCur = id === cur, visited = (st.visited||[]).includes(id), known = mpMapKnown(st, id);
    if (!known){
      return `<g class="map-marker unknown" data-loc="${id}" tabindex="0" role="button" aria-label="Área desconhecida">
        <circle cx="${m.x}" cy="${m.y}" r="11" class="map-dot" />
        <text x="${m.x}" y="${m.y+4}" class="map-icon" text-anchor="middle">?</text>
        <text x="${m.x}" y="${m.y+26}" class="map-lbl" text-anchor="middle">???</text>
      </g>`;
    }
    const cls = isCur ? 'cur' : (visited ? 'seen' : 'revealed');
    return `<g class="map-marker ${cls}" data-loc="${id}" tabindex="0" role="button" aria-label="${m.label}">
      ${isCur ? `<circle cx="${m.x}" cy="${m.y}" r="16" class="map-pulse" />` : ''}
      <circle cx="${m.x}" cy="${m.y}" r="11" class="map-dot" />
      <text x="${m.x}" y="${m.y+4}" class="map-icon" text-anchor="middle">${m.icon}</text>
      <text x="${m.x}" y="${m.y+26}" class="map-lbl" text-anchor="middle">${m.label}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 360 400" xmlns="http://www.w3.org/2000/svg" class="map-svg" aria-label="Mapa de Stormwreck Isle">
    <defs>
      <radialGradient id="mapSea" cx="50%" cy="40%" r="75%">
        <stop offset="0%" stop-color="#15303f"/><stop offset="100%" stop-color="#0a1822"/>
      </radialGradient>
      <linearGradient id="mapLand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3a3030"/><stop offset="100%" stop-color="#241c20"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="360" height="400" fill="url(#mapSea)"/>
    <g class="map-waves" opacity="0.18">
      <path d="M0 350 q 30 -10 60 0 t 60 0 t 60 0 t 60 0 t 60 0" fill="none" stroke="#5fa8c7" stroke-width="1.2"/>
      <path d="M0 372 q 30 -10 60 0 t 60 0 t 60 0 t 60 0 t 60 0" fill="none" stroke="#5fa8c7" stroke-width="1.2"/>
    </g>
    <path class="map-island" fill="url(#mapLand)" stroke="#52443f" stroke-width="2"
      d="M150 40 C 200 30 250 48 268 90 C 300 110 312 150 296 188 C 318 222 300 270 262 286
         C 256 322 214 350 178 338 C 140 356 92 332 86 292 C 52 280 70 236 96 224
         C 82 188 104 150 138 142 C 130 96 120 56 150 40 Z"/>
    <path class="map-island-inner" fill="none" stroke="#6b574f" stroke-width="1" opacity="0.5"
      d="M150 70 C 188 64 228 86 232 120 C 262 150 250 196 220 210 C 224 250 190 286 158 280
         C 124 292 104 256 116 230 C 92 206 110 168 140 166 C 132 120 130 86 150 70 Z"/>
    ${paths}
    ${markers}
  </svg>`;
}
function openMapMp(){
  const st = ROOM.state || {};
  $('#mapCard').innerHTML = `
    <div class="map-head">
      <div><h3>🗺️ Stormwreck Isle</h3><span class="map-sub">A jornada até aqui</span></div>
      <button class="rp-close" id="mapCloseBtn" title="Fechar">✕</button>
    </div>
    <div class="map-body">${mapSvg(st)}</div>
    <div class="map-detail" id="mapDetail"></div>`;
  $('#mapModal').classList.remove('hide');
  $('#mapModal').onclick = e => { if (e.target.id === 'mapModal') closeMapMp(); };
  $('#mapCloseBtn').onclick = closeMapMp;
  const showDetail = id => {
    const loc = MAP_LOCS[id]; if (!loc) return;
    if (!mpMapKnown(st, id)){
      $('#mapDetail').innerHTML = `<div class="map-d-head">❔ <b>Área desconhecida</b> <span class="map-tag dim">não revelada</span></div>
        <p>Uma região da ilha que vocês ainda não alcançaram nem ouviram falar. Explore ou deixe o Mestre revelá-la.</p>`;
      return;
    }
    const here = id === SCENE_LOC[st.sceneId], seen = (st.visited||[]).includes(id);
    const tag = here ? '<span class="map-tag here">você está aqui</span>'
              : seen ? '<span class="map-tag seen">visitado</span>'
              : '<span class="map-tag revealed">no horizonte</span>';
    $('#mapDetail').innerHTML = `<div class="map-d-head">${loc.icon} <b>${loc.label}</b> ${tag}</div>
      <div class="map-d-chap">${loc.chapter}</div>
      <p>${loc.summary}</p>`;
  };
  $$('#mapCard .map-marker').forEach(g => {
    g.onclick = () => showDetail(g.dataset.loc);
    g.onkeydown = e => { if (e.key==='Enter'||e.key===' '){ e.preventDefault(); showDetail(g.dataset.loc); } };
  });
  const curLoc = SCENE_LOC[st.sceneId];
  if (curLoc) showDetail(curLoc);
  else $('#mapDetail').innerHTML = `<p>Vocês ainda estão em alto-mar, a caminho da ilha. As áreas serão reveladas conforme exploram.</p>`;
}
function closeMapMp(){ $('#mapModal').classList.add('hide'); }

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
  loadMyRooms();
  renderRoster();
}

// ==================================================================
//  ROSTER — personagens salvos na conta (reaproveitáveis entre campanhas)
// ==================================================================
let ROSTER = [];
// reconstrói a ficha do nível 1 (base) até `level`, aplicando as escolhas salvas
function mpLevelCharacterTo(base, level, choices){
  const c = JSON.parse(JSON.stringify(base));
  choices = choices || {};
  for (let L = 2; L <= level; L++){
    const cd = RULES.classes[c.cls] || {};
    c.maxHp += Math.max(1, hitDieAverage(cd.hitDie||8) + abilityMod(c.abilities.CON));
    c.level = L; c.prof = profBonus(L);
    const need = levelUpNeeds(c, L);
    if (need.subclass && choices.archetype) c.archetype = choices.archetype;
    if (need.fightingStyle && choices.fightingStyle && c.fightingStyle !== choices.fightingStyle){
      c.fightingStyle = choices.fightingStyle;
      if (choices.fightingStyle === 'Defesa') c.ca += 1;
    }
    if (typeof recomputeSpellSlots === 'function') recomputeSpellSlots(c);
    if (c.spellAbility) c.spellDC = 8 + c.prof + abilityMod(c.abilities[c.spellAbility]);
  }
  c.level = level; c.hp = c.maxHp;
  return c;
}
// o que ainda falta ESCOLHER para chegar a `level` (subclasse/estilo)
function mpNeededChoices(base, level, choices){
  choices = choices || {}; const cd = RULES.classes[base.cls] || {}; const out = {};
  if (cd.subclassLevel >= 2 && cd.subclassLevel <= level && !choices.archetype && !base.archetype && (cd.subclasses||[]).length) out.sub = cd.subclasses.slice();
  if ((base.cls==='Paladino' || base.cls==='Patrulheiro') && level >= 2 && !choices.fightingStyle && !base.fightingStyle) out.style = Object.keys(RULES.fightingStyles);
  return out;
}
async function loadRoster(){
  try { const { data } = await supa.from('characters').select('*').eq('user_id', ME.id).order('updated_at', { ascending:false }); ROSTER = data || []; }
  catch(e){ ROSTER = []; }
  return ROSTER;
}
// salva um personagem novo (char = ficha de nível 1 saída da criação)
async function rosterCreateFromChar(char){
  const choices = { archetype: null, fightingStyle: (fightingStyleLevel(char.cls)===1 ? char.fightingStyle : null) };
  const { data, error } = await supa.from('characters')
    .insert({ user_id: ME.id, name: char.name, level: char.level||1, base: char, sheet: char, choices }).select().single();
  if (!error && data) ROSTER.unshift(data);
  return error ? null : data;
}
async function rosterSetLevel(id, level, extra){
  const row = ROSTER.find(r=>r.id===id); if (!row) return;
  const choices = Object.assign({}, row.choices||{}, extra||{});
  const sheet = mpLevelCharacterTo(row.base, level, choices);
  const { data } = await supa.from('characters').update({ level, choices, sheet, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (data){ const i = ROSTER.findIndex(r=>r.id===id); if (i>=0) ROSTER[i] = data; }
}
async function rosterDelete(id){
  await supa.from('characters').delete().eq('id', id);
  ROSTER = ROSTER.filter(r=>r.id!==id);
}
function rosterCardHtml(r){
  const s = r.sheet || r.base || {};
  const lvlBtns = [1,2,3].map(n=>`<button class="lvl-btn ${r.level===n?'on':''}" data-lvl="${n}" data-cid="${r.id}">${n}</button>`).join('');
  return `<div class="ros-card">
    <div class="ros-top">
      <div><div class="ros-name">${escapeHtml(s.name||r.name||'Herói')}</div>
        <div class="ros-sub">${s.race||''}${s.subrace?` (${s.subrace})`:''} ${s.cls||''}${s.archetype?` [${s.archetype}]`:''}${s.fightingStyle?` · ${s.fightingStyle}`:''} · CA ${s.ca} · ${s.maxHp} HP</div></div>
      <button class="mini-x" data-del="${r.id}" title="Excluir">✕</button>
    </div>
    <div class="ros-actions">
      <span class="ros-lvl">Nível <span class="lvl-set">${lvlBtns}</span></span>
      <button class="btn ghost" data-view="${r.id}" style="padding:5px 11px;font-size:0.78rem">Ver ficha</button>
    </div>
  </div>`;
}
async function renderRoster(){
  const box = $('#myChars'); if (!box) return;
  await loadRoster();
  $('#myCharsList').innerHTML = ROSTER.length ? ROSTER.map(rosterCardHtml).join('') : '<div class="note" style="margin:0">Nenhum personagem salvo ainda. Crie um abaixo — ele fica guardado na sua conta.</div>';
  $$('#myChars [data-lvl]').forEach(b => b.onclick = () => changeRosterLevel(b.dataset.cid, +b.dataset.lvl));
  $$('#myChars [data-del]').forEach(b => b.onclick = async () => { const r = ROSTER.find(x=>x.id===b.dataset.del); if (confirm(`Excluir ${r?.name||'este personagem'}?`)){ await rosterDelete(b.dataset.del); renderRoster(); } });
  $$('#myChars [data-view]').forEach(b => b.onclick = () => { const r = ROSTER.find(x=>x.id===b.dataset.view); if (r) openSheetObj(r.sheet||r.base); });
  $('#newCharBtn').onclick = () => startCreationMp(nameFromEmail(ME.email), async (char) => {
    const row = await rosterCreateFromChar(char);
    show('screen-hub'); enterHub();
    toast(row ? `Personagem salvo: ${char.name}` : 'Erro ao salvar o personagem.');
  });
}
// muda o nível de um personagem salvo (pede subclasse/estilo se faltar)
async function changeRosterLevel(id, level){
  const r = ROSTER.find(x=>x.id===id); if (!r) return;
  const needed = mpNeededChoices(r.base, level, r.choices);
  if (needed.sub || needed.style){ openLevelChooser(r, level, needed); return; }
  await rosterSetLevel(id, level); renderRoster();
}
// modal de escolha (reusa #levelupModal) para subir de nível no roster
function openLevelChooser(r, level, needed){
  const sel = { sub:null, style:null };
  const back = $('#levelupModal');
  function render(){
    const subBlock = needed.sub ? `<h4>Escolha a subclasse (${r.base.cls})</h4><div class="lu-opts">${needed.sub.map(s=>`<button class="lu-opt ${sel.sub===s?'sel':''}" data-sub="${escapeHtml(s)}"><b>${escapeHtml(s)}</b></button>`).join('')}</div>` : '';
    const styleBlock = needed.style ? `<h4>Escolha o estilo de luta</h4><div class="lu-opts">${needed.style.map(s=>`<button class="lu-opt ${sel.style===s?'sel':''}" data-style="${escapeHtml(s)}"><b>${escapeHtml(s)}</b><span class="lu-desc">${escapeHtml((RULES.fightingStyles&&RULES.fightingStyles[s])||'')}</span></button>`).join('')}</div>` : '';
    const ready = (!needed.sub||sel.sub) && (!needed.style||sel.style);
    $('#levelupCard').innerHTML = `<div class="sh-top"><div><div class="sh-name">⬆ Nível ${level}</div><div class="sh-sub">${escapeHtml(r.name||'Herói')} — ${escapeHtml(r.base.cls)}</div></div><button class="rp-close" id="luCloseBtn">✕</button></div>${subBlock}${styleBlock}<button class="btn block" id="luConfirmBtn" ${ready?'':'disabled'} style="margin-top:18px">Confirmar nível ${level}</button>`;
    $('#luCloseBtn').onclick = ()=> back.classList.add('hide');
    $$('#levelupCard [data-sub]').forEach(b=> b.onclick = ()=>{ sel.sub = b.dataset.sub; render(); });
    $$('#levelupCard [data-style]').forEach(b=> b.onclick = ()=>{ sel.style = b.dataset.style; render(); });
    $('#luConfirmBtn').onclick = async ()=>{ back.classList.add('hide'); await rosterSetLevel(r.id, level, { archetype: sel.sub, fightingStyle: sel.style }); renderRoster(); };
  }
  back.classList.remove('hide');
  back.onclick = e => { if (e.target.id==='levelupModal') back.classList.add('hide'); };
  render();
}
// abre a ficha completa a partir de um objeto de ficha avulso (roster)
function openSheetObj(sheet){
  if (!sheet) return;
  $('#sheetCard').innerHTML = mpSheetHtml(sheet, 0);
  $('#sheetModal').classList.remove('hide');
  $('#sheetModal').onclick = e => { if (e.target.id==='sheetModal') $('#sheetModal').classList.add('hide'); };
  $('#sheetCloseBtn').onclick = () => $('#sheetModal').classList.add('hide');
}
// lista salas retomáveis (em que sou membro e que não foram encerradas)
async function loadMyRooms(){
  const box = $('#myRooms'); if (!box) return;
  box.style.display = 'none';
  try {
    const { data: mems } = await supa.from('room_members').select('room_id').eq('user_id', ME.id);
    const ids = [...new Set((mems||[]).map(m=>m.room_id))];
    if (!ids.length) return;
    const { data: rooms } = await supa.from('rooms').select('*').in('id', ids).neq('status','ended').order('created_at', { ascending:false });
    if (!rooms || !rooms.length) return;
    box.style.display = '';
    $('#myRoomsList').innerHTML = rooms.map(r => {
      const host = r.host_id === ME.id;
      const delBtn = `<button class="mini-x" data-${host?'delroom':'leaveroom'}="${r.id}" title="${host?'Excluir sala':'Sair da lista'}">✕</button>`;
      return `<div class="member"><div><span class="mname">${escapeHtml(r.name||'Sala')}</span><div class="mchar">código ${r.code} · ${r.status==='playing'?'em jogo':'no lobby'}${host?' · sua':''}</div></div>` +
        `<span class="mtags"><button class="btn" data-resume="${r.id}" style="padding:6px 12px;font-size:0.82rem">Retomar</button>${delBtn}</span></div>`;
    }).join('');
    $$('#myRooms [data-resume]').forEach(b => b.onclick = () => { const r = rooms.find(x=>x.id===b.dataset.resume); if (r){ ROOM = r; enterRoom(); } });
    $$('#myRooms [data-delroom]').forEach(b => b.onclick = () => deleteRoom(b.dataset.delroom));
    $$('#myRooms [data-leaveroom]').forEach(b => b.onclick = () => leaveRoomList(b.dataset.leaveroom));
  } catch(e){}
}
// host: exclui a sala (apaga ações, membros e a sala)
async function deleteRoom(id){
  if (!confirm('Excluir esta sala de vez? Não dá para retomar depois.')) return;
  try {
    await supa.from('room_actions').delete().eq('room_id', id);
    await supa.from('room_members').delete().eq('room_id', id);
    const { error } = await supa.from('rooms').delete().eq('id', id);
    toast(error ? ('Erro ao excluir: '+error.message) : 'Sala excluída.');
  } catch(e){ toast('Erro ao excluir a sala.'); }
  loadMyRooms();
}
// membro (não-host): remove a sala da sua lista saindo dela
async function leaveRoomList(id){
  if (!confirm('Remover esta sala da sua lista? Você sai dela.')) return;
  try { await supa.from('room_members').delete().eq('room_id', id).eq('user_id', ME.id); } catch(e){}
  loadMyRooms();
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
  if (roomChannel){ try { supa.removeChannel(roomChannel); } catch(e){} roomChannel = null; }
  roomChannel = supa.channel('room-'+ROOM.id, { config:{ presence:{ key: ME.id } } })
    .on('postgres_changes', { event:'*', schema:'public', table:'room_members', filter:`room_id=eq.${ROOM.id}` }, refreshRoom)
    .on('postgres_changes', { event:'*', schema:'public', table:'rooms', filter:`id=eq.${ROOM.id}` }, refreshRoom)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'room_actions', filter:`room_id=eq.${ROOM.id}` }, p => onPlayerAction(p.new))
    .on('presence', { event:'sync' }, onPresenceSync)
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED'){
        reconnectDelay = 1000; setConn('live');
        try { await roomChannel.track({ role: amIAdmin() ? 'admin' : 'player', user_id: ME.id, name: myMember()?.display_name || nameFromEmail(ME?.email) }); } catch(e){}
        await refreshRoom();
        if (amIAdmin()) processBacklog();   // processa ações que chegaram enquanto o Mestre estava fora
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'){
        setConn('reconnecting'); scheduleReconnect();
      }
    });
}
// reconexão com backoff exponencial (1→2→4→8→16 s)
function scheduleReconnect(){
  if (reconnectTimer || !ROOM) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; if (ROOM){ subscribeRoom(); reconnectDelay = Math.min(reconnectDelay * 2, 16000); } }, reconnectDelay);
}
function reconnectNow(){
  if (!ROOM) return;
  reconnectDelay = 1000;
  if (reconnectTimer){ clearTimeout(reconnectTimer); reconnectTimer = null; }
  subscribeRoom();
}
// presença: o Mestre (admin) está online no canal?
function onPresenceSync(){
  if (!roomChannel) return;
  let adminPresent = false;
  try {
    const state = roomChannel.presenceState() || {};
    for (const k in state){ if ((state[k]||[]).some(p => p && p.role === 'admin')){ adminPresent = true; break; } }
  } catch(e){ adminPresent = true; }
  MESTRE_PRESENTE = adminPresent;
  if (ROOM && ROOM.status === 'playing') renderGame();
}
// selo de conexão na topbar do jogo
function setConn(s){
  CONN = s;
  const el = document.getElementById('connDot'); if (!el) return;
  el.className = 'conn ' + s;
  el.textContent = s === 'live' ? '● ao vivo' : s === 'reconnecting' ? '◐ reconectando…' : '⏸ pausado';
  el.style.display = (ROOM && ROOM.status === 'playing') ? '' : 'none';
}
// admin: reprocessa ações pendentes (processed=false) na ordem de criação
async function processBacklog(){
  if (!amIAdmin() || !ROOM || ROOM.status !== 'playing' || backlogRunning) return;
  backlogRunning = true;
  try {
    const st = ROOM.state || {};
    if (st.busy && !engineBusy){ st.busy = false; await saveState(st); renderGame(); }   // engine morreu no meio → destrava
    const { data: pend } = await supa.from('room_actions')
      .select('*').eq('room_id', ROOM.id).eq('processed', false).order('created_at', { ascending:true });
    for (const a of (pend||[])){ if (!PROCESSED_IDS.has(a.id)) onPlayerAction(a); }
  } catch(e){}
  finally { backlogRunning = false; }
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
function openCreate(){ openPickChar(); }   // agora: escolher do roster OU criar novo
async function onCharacterCreated(char){
  const { error } = await supa.from('room_members')
    .update({ sheet: char, ready: true }).eq('room_id', ROOM.id).eq('user_id', ME.id);
  show('screen-room'); await refreshRoom();
  toast(error ? ('Erro ao salvar: '+error.message) : ('Personagem pronto: '+char.name));
}
// seleção de personagem para a campanha: roster salvo + criar novo
async function openPickChar(){
  await loadRoster();
  const back = $('#pickModalBack');
  $('#pickList').innerHTML = ROSTER.length ? ROSTER.map(r => {
    const s = r.sheet || r.base || {};
    const lvlSel = [1,2,3].filter(n => n <= r.level).map(n => `<option value="${n}" ${n===r.level?'selected':''}>Nível ${n}</option>`).join('');
    return `<div class="member"><div><span class="mname">${escapeHtml(s.name||r.name||'Herói')}</span>` +
      `<div class="mchar">${s.race||''}${s.subrace?` (${s.subrace})`:''} ${s.cls||''} · CA ${s.ca} · ${s.maxHp} HP</div></div>` +
      `<span class="mtags"><select class="pick-lvl" data-cid="${r.id}" style="width:auto;padding:5px 8px">${lvlSel}</select>` +
      `<button class="btn" data-use="${r.id}" style="padding:6px 12px;font-size:0.82rem">Usar</button></span></div>`;
  }).join('') : '<div class="note" style="margin:0 0 4px">Você ainda não tem personagens salvos. Crie um novo abaixo.</div>';
  $$('#pickList [data-use]').forEach(b => b.onclick = async () => {
    const id = b.dataset.use; const sel = document.querySelector(`#pickList .pick-lvl[data-cid="${id}"]`);
    await usePickedChar(id, sel ? +sel.value : undefined);
  });
  $('#pickNewBtn').onclick = () => { back.classList.remove('open'); startCreationMp(myMember()?.display_name || nameFromEmail(ME.email), onCharacterCreatedRoom); };
  $('#pickCancelBtn').onclick = () => back.classList.remove('open');
  back.onclick = e => { if (e.target === back) back.classList.remove('open'); };
  back.classList.add('open');
}
async function usePickedChar(id, level){
  const r = ROSTER.find(x => x.id === id); if (!r) return;
  const sheet = mpLevelCharacterTo(r.base, level || r.level, r.choices);   // snapshot no nível escolhido
  $('#pickModalBack').classList.remove('open');
  await onCharacterCreated(sheet);
}
// criar novo personagem dentro da sala: salva no roster E entra com ele
async function onCharacterCreatedRoom(char){
  await rosterCreateFromChar(char);
  await onCharacterCreated(char);
}
async function updateRoom(patch){
  await supa.from('rooms').update(patch).eq('id', ROOM.id);
}
async function kickMember(uid){
  if (!confirm('Remover este jogador da sala?')) return;
  await supa.from('room_members').delete().eq('room_id', ROOM.id).eq('user_id', uid);
}
async function leaveRoomQuietly(opts){
  opts = opts || {};
  try {
    if (roomChannel){ try { await roomChannel.untrack(); } catch(e){} await supa.removeChannel(roomChannel); roomChannel=null; }
    if (ROOM && ME){
      if (amIAdmin()){
        if (opts.end) await supa.from('rooms').update({ status:'ended' }).eq('id', ROOM.id);
        // sem opts.end = só PAUSA: a sala segue 'playing' com o state salvo (retomável)
      } else {
        // jogador comum: no lobby libera a vaga; em jogo mantém a membership para poder voltar
        if (ROOM.status !== 'playing') await supa.from('room_members').delete().eq('room_id', ROOM.id).eq('user_id', ME.id);
      }
    }
  } catch(e){}
  if (reconnectTimer){ clearTimeout(reconnectTimer); reconnectTimer = null; }
  clearTyping(); revealedCount = -1; localBusy = false; MESTRE_PRESENTE = true;
  ROOM = null; MEMBERS = [];
}
async function leaveRoom(){
  if (amIAdmin()){
    if (ROOM && ROOM.status === 'playing'){ openLeaveChoice(); return; }   // em jogo: pausar ou encerrar
    if (!confirm('Sair encerra esta sala (a partida não começou). Continuar?')) return;
    await leaveRoomQuietly({ end:true }); enterHub(); return;
  }
  if (!confirm('Sair desta sala? Você poderá voltar por "Minhas salas".')) return;
  await leaveRoomQuietly();
  enterHub();
}
// modal do admin ao sair durante a partida: pausar (retomável) ou encerrar
function openLeaveChoice(){
  const back = $('#leaveModalBack'); if (!back) return;
  back.classList.add('open');
  $('#leavePauseBtn').onclick = async () => { back.classList.remove('open'); await leaveRoomQuietly(); enterHub(); };
  $('#leaveEndBtn').onclick = async () => { if (!confirm('Encerrar a partida para todos?')) return; back.classList.remove('open'); await leaveRoomQuietly({ end:true }); enterHub(); };
  $('#leaveCancelBtn').onclick = () => back.classList.remove('open');
  back.onclick = e => { if (e.target === back) back.classList.remove('open'); };
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
  mpMarkSceneVisited(state);   // marca o local da cena inicial (chegada = alto-mar, nada)
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
    $('#mapBtn').onclick = openMapMp;          // mapa da ilha
    $('#charsBtn').onclick = () => $('#sidebar').classList.toggle('mobile-open');   // fichas no mobile
    $('#sidebarCloseBtn').onclick = () => $('#sidebar').classList.remove('mobile-open');
    $('#sfxBtn').onclick = toggleSfx;          // efeitos (teste)
    G_WIRED = true;
  }
  updateSfxBtn();
  renderGame();
  if (amIAdmin()) processBacklog();   // ao entrar/voltar, processa ações pendentes
}
// ---------------- SONS (teste) — diffing do estado dispara os SFX em todos ----------------
function toggleSfx(){ if (typeof SFX==='undefined') return; SFX.setEnabled(!SFX.isEnabled()); updateSfxBtn(); if (SFX.isEnabled()) SFX.turn(); }
function updateSfxBtn(){ const b = document.getElementById('sfxBtn'); if (b && typeof SFX!=='undefined') b.textContent = SFX.isEnabled() ? '🔊' : '🔇'; }
let SND = null;
function soundTick(st){
  if (typeof SFX === 'undefined' || !SFX.isEnabled()){ SND = null; return; }
  const rolls = (st.history||[]).filter(m => m.role==='roll');
  const combat = mpCombatActive(st);
  const leveling = !!(st.levelUp && st.levelUp.pending && Object.keys(st.levelUp.pending).length);
  const me = (st.characters||[]).find(c => c.owner === ME.id);
  const myHp = me ? me.hp : null;
  const enemyHp = combat ? st.combat.enemies.reduce((s,e)=>s+e.curHp,0) : null;
  const cur = mpCurrentActor(st);
  const turnChar = combat ? (cur && cur.kind==='pc' ? st.characters[cur.idx] : null) : (st.characters||[])[st.turnIndex||0];
  const myTurn = !st.busy && !!turnChar && turnChar.owner === ME.id && (turnChar.hp > 0);
  const snap = { rolls: rolls.length, combat, leveling, myTurn, myHp, enemyHp, sceneId: st.sceneId };
  if (!SND){ SND = snap; return; }                         // primeira passada: só memoriza, sem tocar
  if (snap.rolls > SND.rolls){
    const card = rolls[rolls.length-1];
    const oc = card.crit ? 'crit' : card.fumble ? 'fumble' : card.autoFail ? 'fail' : (card.dc!=null ? (card.total>=card.dc?'success':'fail') : 'neutral');
    SFX.dice(oc);
  }
  if (combat && !SND.combat) SFX.combat();
  if (leveling && !SND.leveling) SFX.levelup();
  if (snap.sceneId !== SND.sceneId) SFX.scene();
  if (enemyHp!=null && SND.enemyHp!=null && enemyHp < SND.enemyHp) SFX.hit();
  if (myHp!=null && SND.myHp!=null && myHp < SND.myHp) SFX.hurt();
  if (myTurn && !SND.myTurn) SFX.turn();
  SND = snap;
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

// card de ficha no estilo do V1 (clicável → abre a ficha completa, ou o level-up se pulsando)
function mpCharCard(c, active, idx, luPending){
  const pct = Math.max(0, Math.round((c.hp/c.maxHp)*100));
  const sub = `${c.race}${c.subrace?` (${c.subrace})`:''} ${c.cls}${c.fightingStyle?` · ${c.fightingStyle}`:''} Nv${c.level}`;
  const minis = (typeof RULES!=='undefined' ? RULES.abilities : ['FOR','DES','CON','INT','SAB','CAR']).map(ab=>{
    const v = c.abilities ? c.abilities[ab] : '—';
    return `<div class="mini-ab"><div class="l">${ab}</div><div class="v">${v}</div></div>`;
  }).join('');
  const conds = (c.conditions||[]).length
    ? `<div class="cond-chips">${c.conditions.map(n=>`<span class="cond-chip ro" title="${escapeHtml((((typeof RULES!=='undefined'&&RULES.conditions[n])||{}).desc)||'')}">${escapeHtml(n)}</span>`).join('')}</div>`
    : '';
  const luBadge = luPending ? `<div class="lu-badge">⬆ Subir de nível — toque para escolher</div>` : '';
  return `<div class="char-card ${active?'active-turn':''} ${luPending?'levelup-pending':''}" data-sheet="${idx}" title="${luPending?'Subir de nível':'Ver ficha completa'}">
    ${luBadge}
    <div class="cc-name">${escapeHtml(c.name)}</div>
    <div class="cc-sub"><span class="player-tag ${active?'p1':'p2'}">${escapeHtml(c.ownerName||c.player||'')}</span> · ${sub}</div>
    <div class="hpbar-wrap"><div class="hpbar" style="width:${pct}%"></div><div class="hpbar-label">${c.hp} / ${c.maxHp} HP</div></div>
    <div class="stat-row"><span>AC <b>${c.ca}</b></span><span>Speed <b>${c.speed}m</b></span><span>Prof <b>+${c.prof}</b></span></div>
    <div class="mini-abilities">${minis}</div>
    ${conds}
  </div>`;
}

// --- digitação do Mestre (efeito "sendo escrito", local em cada cliente) ---
let TYPING = false, typeTimer = null, revealedCount = -1, localBusy = false, typingLen = 0;
function clearTyping(){ if (typeTimer){ clearInterval(typeTimer); typeTimer = null; } TYPING = false; }
function msgHtml(m){
  if (m.role==='scene') return `<div style="align-self:center;font-family:var(--font-mono);font-size:0.74rem;letter-spacing:0.1em;color:var(--ember)">${escapeHtml(m.text)}</div>`;
  if (m.role==='player') return `<div class="msg player"><div class="who">${escapeHtml(m.who||'')}</div><div class="body">${escapeHtml(m.text)}</div></div>`;
  if (m.role==='roll') return rollCardHtml(m);
  return `<div class="msg dm"><div class="body">${fmtNarr(escapeHtml(m.text))}</div></div>`;
}
function renderNarrative(st){
  const narr = $('#narrative');
  const hist = st.history || [];
  const lastIdx = hist.length - 1;
  const last = hist[lastIdx];
  // anima a última fala do Mestre (mesmo durante "busy", para a narração ser digitada)
  const animate = !!last && last.role==='dm' && revealedCount < hist.length;
  // já estou digitando exatamente esta fala? não reconstruo (preservo o que apareceu)
  if (TYPING && animate && typingLen === hist.length) return;
  clearTyping();   // para qualquer timer órfão antes de reconstruir
  narr.innerHTML = hist.map((m,i)=> (animate && i===lastIdx) ? `<div class="msg dm"><div class="body"></div></div>` : msgHtml(m)).join('');
  narr.scrollTop = narr.scrollHeight;
  if (animate) startTyping(narr.lastElementChild.querySelector('.body'), last.text, hist.length);
}
function startTyping(bodyEl, full, count){
  clearTyping();
  TYPING = true; typingLen = count;
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

// ---------------- ROLAGENS (cards espelhados a todos via estado) ----------------
// card grande na narrativa (estilo V1 showRollCard)
function rollCardHtml(card){
  let outcome = '';
  if (card.dc != null){
    const ok = !card.autoFail && card.total >= card.dc;
    outcome = `<div class="rout ${ok?'success':'fail'}">${card.autoFail?'FALHA AUTOMÁTICA':(ok?'SUCESSO':'FALHA')} (CD ${card.dc})</div>`;
  }
  const numClass = card.crit ? 'crit' : card.fumble ? 'fumble' : '';
  const diceStr = (card.dice||[]).join(', ');
  const dmgLine = card.dmg ? `<div class="rbreak" style="margin-top:6px;color:var(--blood)">⚔ Dano se acertar <b style="color:var(--parch)">${card.dmg.total}</b> [${card.dmg.type}]</div>` : '';
  return `<div class="roll-card"><div class="rtype">${escapeHtml(card.label)}</div>
    <div class="rnum ${numClass}">${card.autoFail?'✗':card.total}</div>
    <div class="rbreak">d20 [${diceStr}] ${card.mod>=0?'+':''}${card.mod}${card.crit?' · CRÍTICO!':''}${card.fumble?' · FALHA CRÍTICA':''}</div>
    ${outcome}${dmgLine}</div>`;
}
// entrada no painel direito (estilo V1 logRoll)
function rollLogEntryHtml(card){
  const auto = card.autoFail || !card.dice || !card.dice.length;
  let cls = card.crit ? 'crit' : card.fumble ? 'fumble' : '';
  let out = '';
  if (card.dc != null){ const ok = !auto && card.total >= card.dc; if (!cls) cls = ok?'ok':'fail'; out = `${ok?'✓':'✗'} CD ${card.dc}`; }
  if (card.crit) out = 'CRÍTICO! ' + out;
  const breakLine = auto ? 'falha automática (condição)' : `d20 [${(card.dice||[]).join(', ')}] ${fmtMod(card.mod)} = ${card.total}`;
  const dmgLine = card.dmg ? `<div class="rl-dmg">⚔ Dano <b>${card.dmg.total}</b> <span class="rl-sub">${card.dmg.detail} [${card.dmg.type}]</span></div>` : '';
  return `<div class="rl-entry ${cls}"><div class="rl-head">${escapeHtml(card.label)}</div>
    <div class="rl-line"><span class="rl-num">${auto?'✗':card.total}</span><span class="rl-out">${out.trim()}</span></div>
    <div class="rl-break">${breakLine}</div>${dmgLine}</div>`;
}
function renderRollLog(st){
  const rolls = (st.history||[]).filter(m => m.role==='roll');
  const list = $('#rollLogList'); if (!list) return;
  list.innerHTML = rolls.length ? rolls.slice().reverse().map(rollLogEntryHtml).join('') : '<div class="rolllog-empty">Nenhuma rolagem ainda.</div>';
}
// detecção tolerante do pedido de rolagem: aceita ROLL/ROLAR/ROLE/TESTE/DADO,
// espaços, prefixo CD/DC e atributo por extenso/inglês. Grupos: tipo, atributo, CD, tag?
const ROLL_RE = /\[\s*(?:ROLL|ROLAR|ROLE|ROLAGEM|TESTE|DADO)\s*:\s*([^:\]]+?)\s*:\s*([^:\]]+?)\s*:\s*(?:CD|DC)?\s*(\d+)\s*(?::\s*([^\]]+?)\s*)?\]/i;
// normaliza o atributo para as chaves do jogo (FOR/DES/CON/INT/SAB/CAR)
function mpNormAbility(atr){
  const q = String(atr||'').toUpperCase().trim();
  const map = { STR:'FOR', FOR:'FOR', 'FORÇA':'FOR', FORCA:'FOR',
    DEX:'DES', DES:'DES', DESTREZA:'DES',
    CON:'CON', 'CONSTITUIÇÃO':'CON', CONSTITUICAO:'CON',
    INT:'INT', 'INTELIGÊNCIA':'INT', INTELIGENCIA:'INT',
    WIS:'SAB', SAB:'SAB', SABEDORIA:'SAB',
    CHA:'CAR', CAR:'CAR', CARISMA:'CAR' };
  return map[q] || q.slice(0,3);
}
// dados justos (rolados pelo CÓDIGO, nunca pela IA)
function mpRollDie(s){ return Math.floor(Math.random()*s)+1; }
function mpD20(c, mod=0, opts={}){
  const roll = () => {
    let a = mpRollDie(20), b = null, chosen = a;
    if (opts.adv || opts.dis){ b = mpRollDie(20); chosen = opts.adv ? Math.max(a,b) : Math.min(a,b); }
    return { nat: chosen, total: chosen+mod, mod, dice:[a,b].filter(x=>x!==null), crit: chosen===20, fumble: chosen===1 };
  };
  let r = roll();
  const lucky = c && c.racialEffects && c.racialEffects.flags && c.racialEffects.flags.rerollNat1;  // Sortudo (Halfling)
  if (lucky && r.nat === 1){ r = roll(); r.lucky = true; }
  return r;
}
function mpRollAttackDamage(ap, crit){
  let total = 0; const parts = [];
  if (ap.dmg){
    const m = ap.dmg.match(/(\d+)d(\d+)/); let n = +m[1]; const sides = +m[2];
    if (crit) n *= 2; if (crit && ap.savage) n += 1;
    const r = []; for (let k=0;k<n;k++){ let v = mpRollDie(sides); if (ap.gwf && (v===1||v===2)) v = mpRollDie(sides); r.push(v); }
    total += r.reduce((a,b)=>a+b,0); parts.push(`${n}d${sides}(${r.join(',')})`);
  } else { total += (ap.flat||1); parts.push(`${ap.flat||1}`); }
  if (ap.sneak){ let n = ap.sneak; if (crit) n *= 2; const r = []; for (let k=0;k<n;k++) r.push(mpRollDie(6)); total += r.reduce((a,b)=>a+b,0); parts.push(`Furtivo ${n}d6(${r.join(',')})`); }
  if (ap.bonus){ total += ap.bonus; parts.push(fmtMod(ap.bonus)); }
  return { total, detail: parts.join(' + ') };
}
// resolve uma [ROLL] para o personagem 'c'; devolve o card (espelhado no estado)
function doMpRoll(c, rollM){
  const [, tipo, atr, cd, tag] = rollM;
  const abr = mpNormAbility(atr);
  const rm = rollModifiers(c, tipo, abr, tag);
  const { adv, dis, prof } = rm;
  const cdNum = +cd > 0 ? +cd : null;
  const result = rm.autoFail
    ? { nat:'—', total:0, mod:rm.mod, dice:[], crit:false, fumble:true }
    : mpD20(c, rm.mod, { adv, dis });
  let dmg = null;
  if ((tipo.toLowerCase()==='ataque' || tipo.toLowerCase()==='attack') && !rm.autoFail){
    const ap = attackProfile(c, abr, adv && !dis);
    const d = mpRollAttackDamage(ap, result.crit);
    dmg = { total: d.total, detail: d.detail, type: ap.type };
  }
  const advNote = adv&&!dis ? ' · vantagem' : dis&&!adv ? ' · desvantagem' : '';
  const condNote = rm.autoFail ? ' · falha automática' : '';
  const outcome = rm.autoFail ? 'FALHA AUTOMÁTICA' : (cdNum ? (result.total>=cdNum?'SUCESSO':'FALHA') : null);
  return {
    role:'roll', label:`${c.name} · ${tipo} (${abr})${advNote}${condNote}`,
    total: result.total, mod: result.mod, dice: result.dice, crit: result.crit, fumble: result.fumble,
    dc: cdNum, outcome, dmg, prof, tipo, abr, advNote, autoFail: rm.autoFail, nat: result.nat, lucky: !!result.lucky
  };
}
// texto do resultado devolvido ao Mestre para ele narrar a consequência
function mpRollResultText(c, card){
  const base = card.autoFail
    ? 'FALHA AUTOMÁTICA por condição'
    : `d20=${card.nat} ${fmtMod(card.mod)} = ${card.total}${card.dc?` vs CD ${card.dc} → ${card.outcome}`:''}`;
  const flags = `${card.crit?' (CRÍTICO!)':''}${card.fumble&&!card.autoFail?' (FALHA CRÍTICA!)':''}${card.lucky?' (Sortudo: re-rolou o 1)':''}`;
  const dmg = card.dmg ? ` Dano se acertar: ${card.dmg.total} [${card.dmg.type}] (${card.dmg.detail}).` : '';
  return `[RESULTADO DA ROLAGEM] ${c.name} rolou ${card.tipo} (${card.abr})${card.prof?' [proficiente]':''}${card.advNote}: ${base}${flags}.${dmg} Narre a consequência e continue (não peça outra rolagem para a mesma ação).`;
}

function renderGame(){
  const st = ROOM.state || {};
  if (revealedCount < 0) revealedCount = (st.history||[]).length;   // não anima o histórico já existente
  if (st.busy) localBusy = false;                                   // a engine assumiu: solta o lock otimista
  const sc = (typeof CAMPAIGN !== 'undefined' && CAMPAIGN.scenes[st.sceneId]) || null;
  $('#chapterLabel').textContent = sc ? sc.chapter : '';
  $('#locationLabel').textContent = sc ? sc.location : '—';
  // ator ativo (em combate, segue a iniciativa; fora dela, o rodízio turnIndex)
  const cur = mpCurrentActor(st);
  const enemyTurn = !!(st.combat && cur && cur.kind==='enemy');
  const activeIdx = st.combat ? (cur && cur.kind==='pc' ? cur.idx : -1) : (st.turnIndex||0);
  const turnChar = activeIdx >= 0 ? (st.characters||[])[activeIdx] : null;
  // grupo (sidebar) — cards clicáveis abrem a ficha (ou o level-up, se pulsando)
  const luPend = (st.levelUp && st.levelUp.pending) || {};
  $('#charPanel').innerHTML = (st.characters||[]).map((c,idx)=> mpCharCard(c, idx===activeIdx, idx, !!luPend[idx])).join('');
  $$('#charPanel [data-sheet]').forEach(el => el.onclick = () => { const i = +el.dataset.sheet; if (luPend[i]) openLevelUp(i); else openSheet(i); });
  // barra de combate (espelhada a todos)
  renderCombatBar(st);
  // narrativa (com digitação do Mestre) + painel de rolagens espelhado
  renderNarrative(st);
  renderRollLog(st);
  // selo de conexão (mostra/atualiza visibilidade)
  setConn(CONN);
  // vez / compositor — trava para TODOS enquanto o Mestre pensa/digita, há level-up, ou o Mestre saiu
  const levelingUp = !!Object.keys(luPend).length;
  const mestreAusente = !amIAdmin() && !MESTRE_PRESENTE;
  const locked = !!st.busy || TYPING || localBusy || levelingUp || mestreAusente;
  const myTurn = !enemyTurn && turnChar && turnChar.hp > 0 && turnChar.owner === ME.id && !locked;
  $('#turnIndicator').innerHTML = mestreAusente
    ? '⏸ <b style="color:var(--blood)">Mestre ausente</b> — partida pausada. Aguardando o Mestre voltar…'
    : (levelingUp
      ? `⬆ Subida de nível — toque no card pulsando e escolha.${amIAdmin()?' (o Mestre pode escolher por um jogador ausente)':''}`
      : (st.busy ? 'O Mestre está pensando…'
        : (TYPING ? 'O Mestre está narrando…'
          : (enemyTurn ? `Turno de <b style="color:var(--blood)">${escapeHtml(cur.name)}</b>…`
            : (myTurn ? `Sua vez, <b style="color:var(--ember)">${escapeHtml(turnChar.name)}</b>`
              : (turnChar ? `Aguardando <b style="color:var(--ember)">${escapeHtml(turnChar.name)}</b> (${escapeHtml(turnChar.ownerName||'')})…` : 'Aguardando o Mestre…'))))));
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
  soundTick(st);   // efeitos (teste): dispara SFX conforme o estado muda
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
  if (engineBusy){ toast('Aguarde o Mestre terminar a narração.'); return; }   // evita perder a edição
  const st = ROOM.state || {}; const c = (st.characters||[])[idx]; if (!c) return;
  c.hp = Math.max(0, Math.min(c.maxHp, (c.hp||0) + delta));
  await saveState(st);
  renderGame();
}

async function gmSkipTurn(){
  if (!amIAdmin()) return;
  if (engineBusy){ toast('Aguarde o Mestre terminar a narração.'); return; }
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
  const conds  = (c.conditions||[]).length ? `<h4>Condições ativas</h4><div class="sh-conds">${c.conditions.map(t=>`<div class="sh-cond"><span class="sh-cond-name">${escapeHtml(t)}</span><span class="sh-cond-desc">${escapeHtml(((RULES.conditions[t]||{}).desc)||'Sem descrição.')}</span></div>`).join('')}</div>` : '';
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

// ---------------- LEVEL-UP INTERATIVO (card pulsa → modal de escolha) ----------------
const LU_PREFIX = '@@LEVELUP@@';
let LU_SEL = { idx:null, subclass:null, style:null };
function openLevelUp(idx){
  const st = ROOM.state || {};
  const p = (st.levelUp && st.levelUp.pending) ? st.levelUp.pending[idx] : null;
  const c = (st.characters||[])[idx];
  if (!p || !c) return;
  if (c.owner !== ME.id && !amIAdmin()){ toast(`Aguardando ${c.ownerName||'o jogador'} subir de nível.`); return; }
  LU_SEL = { idx, subclass:null, style:null };
  $('#levelupModal').classList.remove('hide');
  $('#levelupModal').onclick = e => { if (e.target.id==='levelupModal') $('#levelupModal').classList.add('hide'); };
  renderLevelUpModal();
}
function renderLevelUpModal(){
  const st = ROOM.state || {}; const idx = LU_SEL.idx;
  const p = st.levelUp && st.levelUp.pending ? st.levelUp.pending[idx] : null;
  const c = (st.characters||[])[idx]; if (!p || !c){ $('#levelupModal').classList.add('hide'); return; }
  const subBlock = p.sub ? `<h4>Escolha sua subclasse (${c.cls})</h4><div class="lu-opts">${p.sub.map(s=>`<button class="lu-opt ${LU_SEL.subclass===s?'sel':''}" data-sub="${escapeHtml(s)}"><b>${escapeHtml(s)}</b></button>`).join('')}</div>` : '';
  const styleBlock = p.style ? `<h4>Escolha seu estilo de luta</h4><div class="lu-opts">${p.style.map(s=>`<button class="lu-opt ${LU_SEL.style===s?'sel':''}" data-style="${escapeHtml(s)}"><b>${escapeHtml(s)}</b><span class="lu-desc">${escapeHtml((RULES.fightingStyles&&RULES.fightingStyles[s])||'')}</span></button>`).join('')}</div>` : '';
  const ready = (!p.sub || LU_SEL.subclass) && (!p.style || LU_SEL.style);
  const asAdmin = c.owner !== ME.id && amIAdmin();
  $('#levelupCard').innerHTML = `
    <div class="sh-top"><div><div class="sh-name">⬆ Nível ${st.levelUp.toLevel}</div>
      <div class="sh-sub">${escapeHtml(c.name)} — ${escapeHtml(c.cls)}${asAdmin?' · escolhendo como Mestre':''}</div></div>
      <button class="rp-close" id="luCloseBtn">✕</button></div>
    ${subBlock}${styleBlock}
    <button class="btn block" id="luConfirmBtn" ${ready?'':'disabled'} style="margin-top:18px">Confirmar</button>`;
  $('#luCloseBtn').onclick = ()=> $('#levelupModal').classList.add('hide');
  $$('#levelupCard [data-sub]').forEach(b=> b.onclick = ()=>{ LU_SEL.subclass = b.dataset.sub; renderLevelUpModal(); });
  $$('#levelupCard [data-style]').forEach(b=> b.onclick = ()=>{ LU_SEL.style = b.dataset.style; renderLevelUpModal(); });
  $('#luConfirmBtn').onclick = confirmLevelUp;
}
async function confirmLevelUp(){
  const st = ROOM.state || {}; const idx = LU_SEL.idx; const c = (st.characters||[])[idx]; if (!c) return;
  const data = { idx, subclass: LU_SEL.subclass, style: LU_SEL.style };
  $('#levelupModal').classList.add('hide');
  if (amIAdmin()){
    // o admin é a engine: aplica direto (vale para o próprio personagem ou por um ausente)
    if (engineBusy){ setTimeout(confirmLevelUp, 400); return; }
    engineBusy = true;
    try { if (mpApplyLevelChoiceData(st, idx, data)) await saveState(st); }
    finally { engineBusy = false; renderGame(); }
  } else {
    const { error } = await supa.from('room_actions').insert({ room_id: ROOM.id, user_id: ME.id, display_name: c.name, text: LU_PREFIX + JSON.stringify(data) });
    toast(error ? ('Erro: '+error.message) : 'Escolha enviada! Aguardando os outros…');
  }
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
  // mapa: revela locais avistados/ouvidos
  [...reply.matchAll(/\[REVELAR_LOCAL:([^\]]+)\]/g)].forEach(m => {
    const id = m[1].trim();
    if (mpRevealLocation(st, id)){ st.history = st.history || []; st.history.push({ role:'scene', text:`🗺️ Novo local revelado: ${MAP_LOCS[id].label}` }); }
  });
  mpMarkSceneVisited(st);   // garante que o local da cena atual esteja marcado
  // combate: iniciar, dano a inimigos [HIT] e dano a heróis [DANO]
  if (!mpCombatActive(st)){
    const cs = reply.match(/\[COMBAT_START:\s*([^\]]+?)\s*\]/i);
    if (cs) mpStartCombat(st, cs[1].trim());
  }
  if (mpCombatActive(st)){
    [...reply.matchAll(/\[HIT:\s*([^:\]]+?)\s*:\s*(-?\d+)\s*\]/gi)].forEach(m => {
      const e = st.combat.enemies.find(x => x.id===m[1] || x.name.toLowerCase()===m[1].toLowerCase());
      if (e) e.curHp = Math.max(0, e.curHp - Math.abs(+m[2]));
    });
  }
  [...reply.matchAll(/\[DANO:\s*([^:\]]+?)\s*:\s*(-?\d+)\s*\]/gi)].forEach(m => {
    const ci = mpFindChar(st.characters||[], m[1]);
    if (ci >= 0) st.characters[ci].hp = Math.max(0, st.characters[ci].hp - Math.abs(+m[2]));
  });
  const sm = reply.match(/\[SUGESTOES:([^\]]+)\]/i);
  st.suggestions = sm ? sm[1].split('|').map(s=>s.trim()).filter(Boolean).slice(0,3) : [];
}

// ---------------- TRANSIÇÃO DE CENAS (roteiro do campaign.js) ----------------
// sobe os personagens para newLevel: aplica HP/prof/slots na hora; devolve as
// ESCOLHAS pendentes (subclasse/estilo) para o jogador decidir no card pulsante
function mpApplyLevelUp(st, newLevel){
  const pending = {};
  (st.characters||[]).forEach((c, idx) => {
    if (!c || c.level >= newLevel) return;
    const cd = RULES.classes[c.cls] || {};
    const conMod = abilityMod(c.abilities.CON);
    for (let L = c.level+1; L <= newLevel; L++) c.maxHp += Math.max(1, hitDieAverage(cd.hitDie||8) + conMod);
    c.level = newLevel;
    c.prof = profBonus(newLevel);
    if (typeof recomputeSpellSlots === 'function') recomputeSpellSlots(c);
    if (c.spellAbility) c.spellDC = 8 + c.prof + abilityMod(c.abilities[c.spellAbility]);
    c.hp = c.maxHp;                                               // marco de história: HP cheio
    const need = levelUpNeeds(c, newLevel);                       // o que precisa ESCOLHER
    const entry = {};
    if (need.subclass && (cd.subclasses||[]).length) entry.sub = cd.subclasses.slice();
    if (need.fightingStyle) entry.style = Object.keys(RULES.fightingStyles);
    if (entry.sub || entry.style) pending[idx] = entry;
  });
  return pending;
}
// aplica a escolha de level-up de um personagem; se foi a última, libera a mesa
function mpApplyLevelChoiceData(st, ci, data){
  if (!st.levelUp || !st.levelUp.pending || !st.levelUp.pending[ci]) return false;
  const c = (st.characters||[])[ci]; if (!c) return false;
  const p = st.levelUp.pending[ci];
  if (p.sub && data.subclass && p.sub.includes(data.subclass)) c.archetype = data.subclass;
  if (p.style && data.style && RULES.fightingStyles[data.style] && c.fightingStyle !== data.style){
    c.fightingStyle = data.style;
    if (data.style === 'Defesa') c.ca += 1;                       // Estilo de Luta: Defesa (+1 CA com armadura)
  }
  delete st.levelUp.pending[ci];
  if (!Object.keys(st.levelUp.pending).length){
    st.levelUp = null;
    (st.history = st.history || []).push({ role:'scene', text:'✨ Todos subiram de nível! A aventura continua.' });
  }
  return true;
}
// descanso do roteiro (refúgio seguro): restaura HP/recursos/condições
function mpApplyRest(st, kind){
  const long = /long|longo/i.test(kind);
  (st.characters||[]).forEach(c => {
    if (!c) return;
    if (long){
      c.hp = c.maxHp; c.conditions = [];
      if (c.spellSlots) c.spellSlots.used = 0;
      if (c.spellSlots2) c.spellSlots2.used = 0;
      if (c.resUsed) c.resUsed = {};
      c.raging = false;
    }
  });
  return long;
}
// avança para a próxima cena do roteiro quando o Mestre emite [SCENE_COMPLETE]
function mpAdvanceScene(st){
  const sc = (typeof CAMPAIGN!=='undefined' && CAMPAIGN.scenes[st.sceneId]) || {};
  st.history = st.history || [];
  if (sc.ending){ st.history.push({ role:'scene', text:'⚜ Fim da aventura ⚜' }); st.finished = true; return; }
  const nextId = sc.next; const nsc = nextId && CAMPAIGN.scenes[nextId];
  if (!nsc) return;
  st.history.push({ role:'scene', text:'— A jornada continua —' });
  st.sceneId = nextId;
  if (nsc.levelUp){
    const pending = mpApplyLevelUp(st, nsc.levelUp);
    st.history.push({ role:'scene', text:`⬆ O grupo subiu para o nível ${nsc.levelUp}` });
    if (Object.keys(pending).length) st.levelUp = { toLevel: nsc.levelUp, pending };   // pausa para as escolhas
  }
  if (nsc.rest && mpApplyRest(st, nsc.rest)) st.history.push({ role:'scene', text:'🌙 Descanso longo — HP, recursos e condições restaurados.' });
  mpMarkSceneVisited(st);
  st.history.push({ role:'scene', text:`⚔ ${nsc.chapter||''} — ${nsc.location||''} ⚔` });
  if (nsc.readAloud) st.history.push({ role:'dm', text: nsc.readAloud });
  st.suggestions = [];
  st.turnIndex = 0;                                              // nova cena começa pelo 1º jogador
  if (st.combat) st.combat = null;                              // cena nova encerra combate pendente
}

// ---------------- COMBATE (tracker de iniciativa + HP, espelhado a todos) ----------------
function mpCombatActive(st){ return !!(st.combat && st.combat.order && st.combat.order.length); }
function mpCurrentActor(st){ return mpCombatActive(st) ? st.combat.order[st.combat.turn] : null; }
function mpAllEnemiesDead(st){ return !!st.combat && (st.combat.enemies||[]).every(e => e.curHp <= 0); }
function mpAllPcsDead(st){ return !!(st.characters && st.characters.length) && st.characters.every(c => (c.hp||0) <= 0); }
// o personagem que pode AGIR agora (em combate, o PC da iniciativa; fora dela, o do rodízio)
function mpActivePc(st){
  if (mpCombatActive(st)){ const cur = mpCurrentActor(st); return (cur && cur.kind==='pc') ? st.characters[cur.idx] : null; }
  return (st.characters||[])[st.turnIndex||0];
}
// inicia combate a partir de um encontro do campaign.js; rola iniciativa (PCs e inimigos)
function mpStartCombat(st, encId){
  const enc = (typeof CAMPAIGN!=='undefined' && CAMPAIGN.encounters[encId]);
  if (!enc) return false;
  st.combat = { enc: encId, name: enc.name, enemies: enc.enemies.map(e => ({ ...e, curHp: e.hp })), order:[], turn:0, round:1 };
  const order = [];
  (st.characters||[]).forEach((c,idx) => order.push({ kind:'pc', idx, name:c.name, init: mpD20(c, abilityMod(c.abilities.DES)).total }));
  st.combat.enemies.forEach((e,idx) => order.push({ kind:'enemy', idx, name:e.name, init: mpD20(null, e.mod||0).total }));
  order.sort((a,b) => b.init - a.init);
  st.combat.order = order; st.combat.turn = 0; st.combat.round = 1;
  st.history = st.history || [];
  st.history.push({ role:'scene', text:`⚔ COMBATE: ${(enc.name||'').toUpperCase()} ⚔` });
  return true;
}
// avança o ponteiro de iniciativa, pulando quem está caído; conta rodadas
function mpAdvanceCombat(st){
  const cb = st.combat; if (!cb || !cb.order.length) return;
  let guard = 0;
  do {
    cb.turn++;
    if (cb.turn >= cb.order.length){ cb.turn = 0; cb.round++; }
    const o = cb.order[cb.turn];
    const dead = o.kind==='enemy' ? cb.enemies[o.idx].curHp <= 0 : (st.characters[o.idx]||{}).hp <= 0;
    if (!dead) break;
  } while (++guard < cb.order.length * 2);
}
function mpEndCombat(st, victory){
  st.combat = null;
  st.history = st.history || [];
  st.history.push({ role:'scene', text: victory ? '— inimigos derrotados! fim do combate —' : '— fim do combate —' });
}
// barra de combate (lida do estado compartilhado → idêntica para todos)
function renderCombatBar(st){
  const bar = $('#combatBar'); if (!bar) return;
  if (!mpCombatActive(st)){ bar.classList.add('hide'); bar.innerHTML = ''; return; }
  bar.classList.remove('hide');
  const cb = st.combat;
  const toks = cb.order.map((o,k) => {
    let hp, dead;
    if (o.kind==='enemy'){ const e = cb.enemies[o.idx]; hp = `${e.curHp}/${e.hp}`; dead = e.curHp <= 0; }
    else { const c = st.characters[o.idx]||{}; hp = `${c.hp}/${c.maxHp}`; dead = (c.hp||0) <= 0; }
    return `<div class="cb-tok ${o.kind} ${k===cb.turn?'current':''} ${dead?'dead':''}"><div class="cb-init">${o.init}</div><div>${escapeHtml(o.name)}</div><div class="cb-hp">${hp} HP</div></div>`;
  }).join('');
  const btns = amIAdmin() ? `<div class="cb-btns"><button class="cb-btn" id="cbSkipBtn" title="Pular o turno atual">Pular turno →</button><button class="cb-btn end" id="cbEndBtn">Encerrar</button></div>` : '';
  bar.innerHTML = `<span class="cb-round">Rodada ${cb.round}</span><div class="cb-list">${toks}</div>${btns}`;
  if (amIAdmin()){
    const sk = $('#cbSkipBtn'), en = $('#cbEndBtn');
    if (sk) sk.onclick = gmCombatSkip;
    if (en) en.onclick = gmCombatEnd;
  }
}
// admin: pular o turno atual (jogador AFK ou inimigo travado)
async function gmCombatSkip(){
  if (!amIAdmin() || !mpCombatActive(ROOM.state) || ROOM.state.busy || engineBusy) return;
  const st = ROOM.state;
  mpAdvanceCombat(st);
  await saveState(st); renderGame();
  if (mpCurrentActor(st) && mpCurrentActor(st).kind==='enemy'){ st.busy = true; await saveState(st); renderGame(); await mpRunEnemyTurns(st); st.busy = false; await saveState(st); renderGame(); }
}
async function gmCombatEnd(){
  if (!amIAdmin() || !mpCombatActive(ROOM.state)) return;
  if (!confirm('Encerrar o combate agora?')) return;
  mpEndCombat(ROOM.state, false);
  await saveState(ROOM.state); renderGame();
}
// auto-conduz os turnos de inimigos até chegar num PC vivo ou o combate acabar
async function mpRunEnemyTurns(st){
  let guard = 0;
  while (mpCombatActive(st) && guard++ < 12){
    if (mpAllPcsDead(st)){ st.history.push({ role:'scene', text:'⚰ O grupo tombou em combate…' }); mpEndCombat(st, false); break; }
    if (mpAllEnemiesDead(st)){ mpEndCombat(st, true); break; }
    const cur = mpCurrentActor(st);
    if (!cur) break;
    if (cur.kind==='pc'){
      if ((st.characters[cur.idx]||{}).hp > 0) break;     // PC vivo → ele joga
      mpAdvanceCombat(st); continue;                       // PC caído: pula a vez dele
    }
    const e = st.combat.enemies[cur.idx];
    if (e.curHp <= 0){ mpAdvanceCombat(st); continue; }   // inimigo caído: pula
    await saveState(st); renderGame();
    await mpSleep(600);
    const reply = await callDm(st, `[TURNO DO INIMIGO] É a vez de ${e.name} (HP ${e.curHp}/${e.hp}) na iniciativa. Narre a ação dele AGORA, em 1-2 frases, coerente com a cena. Se atacar um herói e acertar, aplique o dano com [DANO:NomeDoHeroi:quantidade] (use o dano ${e.dmg||'1d6'} do inimigo). NÃO peça rolagem ao jogador nem fale como sistema.`);
    applyMpMarkers(reply, st);
    const clean = reply.replace(/\[[^\]]*\]/g, '').trim();
    if (clean) st.history.push({ role:'dm', text: clean });
    mpAdvanceCombat(st);
    await saveState(st); renderGame();
  }
}

// ---------------- ENGINE (roda no cliente do ADMIN) ----------------
async function saveState(st){
  ROOM.state = st;
  const ap = mpActivePc(st);
  await supa.from('rooms').update({ state: st, scene_id: st.sceneId, turn_owner: (ap||{}).owner || null }).eq('id', ROOM.id);
}
function advanceTurn(st){
  if (mpCombatActive(st)){ mpAdvanceCombat(st); return; }   // em combate, segue a iniciativa
  if (!st.characters || !st.characters.length) return;
  let g = 0;                                                // fora de combate, pula personagens caídos
  do { st.turnIndex = ((st.turnIndex||0) + 1) % st.characters.length; }
  while ((st.characters[st.turnIndex]||{}).hp <= 0 && ++g < st.characters.length);
}
// jogador envia ação → vai para a fila room_actions
async function submitAction(){
  const inp = $('#actionInput'); const txt = inp.value.trim(); if (!txt) return;
  const st = ROOM.state || {}; const active = mpActivePc(st);
  if (!active || active.owner !== ME.id){ toast('Não é sua vez.'); return; }
  if (typeof SFX !== 'undefined') SFX.unlock();      // gesto do usuário libera o áudio
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
  if (action.processed || PROCESSED_IDS.has(action.id)) return;   // dedup backlog × Realtime
  // escolha de level-up de um jogador (não passa pelo Mestre)
  if (typeof action.text === 'string' && action.text.startsWith(LU_PREFIX)){
    if (engineBusy){ setTimeout(()=>onPlayerAction(action), 500); return; }
    engineBusy = true; PROCESSED_IDS.add(action.id);
    const st = ROOM.state || {};
    try {
      let data = {}; try { data = JSON.parse(action.text.slice(LU_PREFIX.length)); } catch(e){}
      const ci = (st.characters||[]).findIndex(c => c.owner === action.user_id);   // só o próprio personagem
      if (ci >= 0){ if (mpApplyLevelChoiceData(st, ci, data)) await saveState(st); }
    } finally {
      engineBusy = false;
      try { await supa.from('room_actions').update({ processed:true }).eq('id', action.id); } catch(e){}
      renderGame();
    }
    return;
  }
  if (engineBusy){ setTimeout(()=>onPlayerAction(action), 800); return; }   // serializa
  engineBusy = true; PROCESSED_IDS.add(action.id);
  const st = ROOM.state || {};
  try {
    st.history = st.history || [];
    st.history.push({ role:'player', who: action.display_name, text: action.text });
    st.busy = true;                                       // trava TODOS (via Realtime) enquanto o Mestre pensa
    await saveState(st);                                  // mostra a ação a todos já + estado "pensando"
    renderGame();
    const actor = mpActivePc(st);                         // quem age é quem rola
    const hadCombat = mpCombatActive(st);
    let reply = await callDm(st);
    let rolls = 0;
    // ciclo do Mestre: pode pedir uma rolagem [ROLL]; o CÓDIGO rola e devolve o número
    while (true){
      const rawRoll = reply.match(ROLL_RE);
      const rollM = (rolls < 4) ? rawRoll : null;
      applyMpMarkers(reply, st);                             // condições + sugestões + mapa + combate
      let sceneComplete = /\[SCENE_COMPLETE\]/.test(reply);
      if (sceneComplete && mpCombatActive(st) && !mpAllEnemiesDead(st)) sceneComplete = false;   // não pula cena no meio do combate
      const clean = reply.replace(/\[[^\]]*\]/g, '').trim(); // remove marcadores do texto exibido
      if (clean) st.history.push({ role:'dm', text: clean });
      // 1) rolagem tem PRIORIDADE (mesmo se o Mestre mandar [SCENE_COMPLETE] junto)
      if (rollM && actor){
        rolls++;
        await saveState(st); renderGame();                  // mostra o pedido do Mestre já
        await mpSleep(750);                                 // um respiro antes do dado cair
        const card = doMpRoll(actor, rollM);                // o CÓDIGO rola (justo)
        st.history.push(card);
        await saveState(st); renderGame();                  // espelha o card a todos (ainda "busy")
        reply = await callDm(st, mpRollResultText(actor, card));   // devolve o número ao Mestre
        continue;
      }
      // pediu rolagem mas estourou o teto de 4: NÃO perde o turno — mantém a vez com o jogador
      if (rawRoll && !rollM){ if (!clean) st.history.push({ role:'dm', text:'…' }); break; }
      // 2) fim de cena
      if (sceneComplete){ st.suggestions = []; mpAdvanceScene(st); break; }
      // 3) turno normal
      if (!clean) st.history.push({ role:'dm', text:'…' });
      if (mpCombatActive(st)){
        if (hadCombat) advanceTurn(st);                     // já estava em combate: passa o ponteiro do PC que agiu
        await mpRunEnemyTurns(st);                          // auto-conduz inimigos até o próximo PC vivo
      } else advanceTurn(st);
      break;
    }
    st.busy = false;                                       // libera; cada cliente ainda digita a fala localmente
    await saveState(st);
  } finally {
    engineBusy = false;
    if (st.busy){ st.busy = false; try { await saveState(st); } catch(e){} }  // nunca deixa o grupo travado
    try { await supa.from('room_actions').update({ processed:true }).eq('id', action.id); } catch(e){}
    renderGame();
  }
}
const mpSleep = ms => new Promise(r => setTimeout(r, ms));
function buildMpHistory(st){
  const msgs = [];
  (st.history||[]).slice(-16).forEach(m => {
    if (m.role==='dm') msgs.push({ role:'assistant', content: m.text });
    else if (m.role==='player') msgs.push({ role:'user', content:`[${m.who}]: ${m.text}` });
  });
  if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({ role:'user', content:'(Apresente a cena e abra para a ação dos jogadores.)' });
  return msgs;
}
// chama o Mestre; extraUser injeta o resultado de uma rolagem mantendo a alternância
async function callDm(st, extraUser){
  const msgs = buildMpHistory(st);
  if (extraUser){
    if (msgs.length && msgs[msgs.length-1].role === 'user') msgs[msgs.length-1].content += '\n\n' + extraUser;
    else msgs.push({ role:'user', content: extraUser });
  }
  try { return await callClaudeMp(msgs, buildMpSystemPrompt(st), 700); }
  catch (e){ return `*(O Mestre tropeçou: ${e.message})*`; }
}
function buildMpSystemPrompt(st){
  const sc = CAMPAIGN.scenes[st.sceneId] || {};
  const sheets = (st.characters||[]).map(c =>
    `- ${c.name} (jogador ${c.ownerName||'?'}): ${c.race}${c.subrace?` (${c.subrace})`:''} ${c.cls} Nv${c.level}. HP ${c.hp}/${c.maxHp}, CA ${c.ca}. ` +
    `Atributos: ${RULES.abilities.map(a=>`${a} ${c.abilities[a]}(${fmtMod(abilityMod(c.abilities[a]))})`).join(', ')}.` +
    ((c.cantripsChosen&&c.cantripsChosen.length)?` Truques: ${c.cantripsChosen.join(', ')}.`:'') +
    ((c.spellsChosen&&c.spellsChosen.length)?` Magias nv1: ${c.spellsChosen.join(', ')}.`:'') +
    ` Inventário: ${(c.inventory&&c.inventory.length)?c.inventory.join('; '):'(vazio)'}.` +
    ((c.conditions&&c.conditions.length)?` Condições ativas: ${c.conditions.join(', ')}.`:'')
  ).join('\n');
  const npcs = sc.npcs ? Object.entries(sc.npcs).map(([n,d])=>`- ${n}: ${d}`).join('\n') : 'Nenhum NPC fixo.';
  // bloco de combate: estado em andamento, ou encontro disponível na cena
  const enc = sc.combat && CAMPAIGN.encounters[sc.combat];
  let combatBlock = '';
  if (mpCombatActive(st)){
    const cb = st.combat;
    combatBlock = `\n## COMBATE EM ANDAMENTO (rodada ${cb.round})\nOrdem de iniciativa: ${cb.order.map((o,k)=>`${k===cb.turn?'▶ ':''}${o.name}`).join(' > ')}\nInimigos: ${cb.enemies.map(e=>`${e.name}[id:${e.id}] HP ${e.curHp}/${e.hp}, CA ${e.ca}`).join('; ')}\nO sistema controla a iniciativa (de quem é a vez). Quando um inimigo levar dano, emita [HIT:id:quantidade] (ex.: [HIT:${cb.enemies[0]?cb.enemies[0].id:'e1'}:8]). Quando um inimigo atingir um herói, emita [DANO:NomeDoHeroi:quantidade]. Encerre quando todos os inimigos caírem.\n`;
  } else if (enc){
    combatBlock = `\n## ENCONTRO DESTA CENA\nSe a situação evoluir para luta, INICIE o combate com [COMBAT_START:${sc.combat}] — o sistema rola a iniciativa e mostra o tracker na tela. Encontro: "${enc.name}".${enc.negotiable?' Este combate é NEGOCIÁVEL: bons testes sociais podem evitá-lo.':''}\n`;
  }
  return `Você é o Mestre (DM) de uma aventura de D&D 5e: "${CAMPAIGN.title}".
${CAMPAIGN.premise||''}

Esta é uma MESA MULTIJOGADOR: vários jogadores, cada um controla SEU personagem (o nome do jogador vem entre colchetes antes da ação). Dirija-se ao grupo; quando um personagem específico agir, narre o resultado dele e envolva os outros. Seja vívido e conciso (2-3 parágrafos). Português do Brasil; termos de regra em inglês.

REGRAS DE IMERSÃO (siga à risca):
- Você é SEMPRE o narrador EM PERSONAGEM. NUNCA fale como sistema, IA ou assistente. NUNCA cite "Apêndice A", regras, "dano", "RP", "condição" como pergunta de bastidor, nem peça ao jogador para "escolher o efeito".
- Quando a ação tem resultado CERTO/automático (ex.: beber um veneno que ele tem, abrir uma porta destrancada, conversar), NARRE direto. Mas quando o resultado é INCERTO (pode dar certo OU errado), você NÃO decide — peça uma rolagem (veja abaixo). Nunca anuncie sucesso ou fracasso de uma ação arriscada sem antes pedir o dado.
- Só faça perguntas se forem DENTRO da ficção e genuinamente necessárias (ex.: "Em qual dos dois guardas você mira?"). Nunca pergunte sobre mecânica.
- COERÊNCIA: o personagem só pode usar o que está NA FICHA dele (inventário, magias, recursos listados abaixo) e o que a CENA oferece. Se o jogador descrever usar um item, magia ou recurso que ele NÃO possui (ex.: beber um veneno que não está no inventário), corrija DENTRO da ficção — narre que ele procura mas não há tal item, ou que a tentativa falha — em vez de aceitar a invenção. Nunca dê itens que não existem.
- ★ REGRA MAIS IMPORTANTE: você NÃO rola dados nem inventa números, e NÃO decide se uma ação arriscada deu certo. Sempre que a ação puder falhar (escalar, saltar, esgueirar-se, persuadir/intimidar/enganar, investigar, atacar, resistir a algo, arrombar, equilibrar-se etc.), sua resposta DEVE conter o marcador [ROLL:tipo:ATRIBUTO:CD] e PARAR ali. O sistema rola o d20 justo e te devolve o número; só ENTÃO, na resposta seguinte, você narra o que aconteceu. Se você narrar o desfecho sem ter pedido o dado, está ERRADO.
  • tipo = nome da perícia (Atletismo, Acrobacia, Furtividade, Percepção, Persuasão, Intimidação, Enganação, Investigação, Arcanismo...), ou 'save', ou 'ataque'.
  • ATRIBUTO = FOR, DES, CON, INT, SAB ou CAR.
  • CD = dificuldade: 10 fácil, 12-13 médio, 15 difícil, 18+ muito difícil. Para 'ataque' use CD 0.
  • Formato EXATO, em colchetes, sem espaços extras: [ROLL:Atletismo:FOR:12]  ·  [ROLL:save:DES:14]  ·  [ROLL:ataque:DES:0]
  • Uma rolagem por vez. Só dispense o dado em ações triviais sem risco.

## CENA ATUAL: ${sc.chapter||''} — ${sc.location||''}
${sc.summary||''}
Objetivos: ${(sc.objectives||[]).join('; ')}
${sc.npcs?'':''}

## NPCs DESTA CENA
${npcs}

## PERSONAGENS DO GRUPO
${sheets}
${combatBlock}
## MARCADORES (o sistema processa e REMOVE do texto exibido — não os explique)
- Combate: comece com [COMBAT_START:idDoEncontro] (o sistema rola iniciativa). Dano a inimigo: [HIT:idDoInimigo:quantidade]. Dano a herói: [DANO:NomeDoHeroi:quantidade]. Em combate, respeite a ordem de iniciativa — o sistema diz de quem é a vez.
- Quando um personagem passar a sofrer uma CONDIÇÃO (Apêndice A): [CONDICAO:NomeDoPersonagem:Condição] — ex.: [CONDICAO:${(st.characters&&st.characters[0]?st.characters[0].name:'Garrett')}:Envenenado]. Quando a condição acabar: [REMOVER_CONDICAO:NomeDoPersonagem:Condição]. Condições válidas: ${Object.keys(RULES.conditions).join(', ')}.
- Para revelar uma área do mapa que os heróis avistaram ou ouviram falar (mas ainda não alcançaram): [REVELAR_LOCAL:id]. As áreas só aparecem nomeadas no mapa quando reveladas ou alcançadas — NÃO mencione o nome de um local desconhecido antes de revelá-lo.
- Quando os OBJETIVOS da cena atual estiverem cumpridos e for hora de a história seguir para o próximo local/capítulo, encerre sua narração com [SCENE_COMPLETE]. O sistema cuida da transição, do texto da próxima cena, da subida de nível e do descanso — você NÃO precisa narrar a viagem nem anunciar a mudança. Não use cedo demais: só quando a cena estiver de fato resolvida.
- SEMPRE termine a resposta com 2 ou 3 sugestões curtas de ação para o próximo jogador, no formato exato: [SUGESTOES: ação curta 1 | ação curta 2 | ação curta 3]. São atalhos clicáveis; o jogador ainda pode digitar livremente. (Não inclua sugestões se você emitir [SCENE_COMPLETE].)

## MAPA DA ILHA (ids para [REVELAR_LOCAL])
${Object.entries(MAP_LOCS).map(([id,m])=>`- ${id}: ${m.label} — ${mpMapKnown(st,id)?'JÁ CONHECIDO pelos jogadores':'desconhecido (não cite o nome até revelar/alcançar)'}`).join('\n')}

## EXEMPLOS — siga este padrão SEMPRE que a ação for arriscada (peça o dado e PARE)
Jogador [Bjorn]: "Tento escalar o mastro escorregadio durante a tempestade."
Você: A madeira encharcada cede sob as botas; só a força bruta o levará ao topo. [ROLL:Atletismo:FOR:13]
Jogador [Lia]: "Tento convencer o capitão a mudar de rota."
Você: O capitão cruza os braços, o maxilar tenso. Suas palavras terão de ser muito boas. [ROLL:Persuasão:CAR:15]
Jogador [Bjorn]: "Ataco o esqueleto com meu machado."
Você: Bjorn ruge e desce a lâmina num arco selvagem. [ROLL:ataque:FOR:0]
(Em todos os casos você PARA após o marcador. O sistema rola e devolve o número; aí você narra o sucesso ou a falha.)

Responda à ação do jogador. Se houver QUALQUER incerteza, peça [ROLL:...] e pare. Caso contrário, narre e termine com as [SUGESTOES:...].`;
}

window.addEventListener('beforeunload', ()=>{ try{ if(roomChannel) supa.removeChannel(roomChannel); }catch(e){} });
// reconexão ao recuperar rede/foco
window.addEventListener('online', () => { if (ROOM) reconnectNow(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !ROOM) return;
  if (CONN !== 'live') reconnectNow(); else refreshRoom();
});
initAuth();
