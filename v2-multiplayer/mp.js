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

// ---------------- ARTES DOS MONSTROS (geradas por IA, hospedadas no repo) ----------------
const MONSTER_ART = {
  'Zumbi Afogado': 'assets/monsters/zumbi_afogado.png',
  'Zumbi':         'assets/monsters/zumbi.png',
  'Fume Drake':    'assets/monsters/fume_drake.png',
  'Polvo de Fungo':'assets/monsters/polvo_fungo.png',
  'Ghoul':         'assets/monsters/ghoul.png',
  'Dragão Jovem':  'assets/monsters/dragao_jovem.png',
};
function monsterArt(name){ return MONSTER_ART[name] || null; }
let LAST_COMBAT = false;   // detecta início de combate para o reveal cinematográfico

// ============================================================
//  MAPA TÁTICO (grade de combate · névoa de guerra)
//  Posições vivem em st.tactical (espelhado a todos). Só o admin (engine)
//  muta; jogadores clicam numa célula → ação @@MOVE@@ que o admin aplica.
// ============================================================
const TAC_CELL = 42, TAC_MOVE = 6, MOVE_PREFIX = '@@MOVE@@';
let TAC_PREV_POS = {};   // px {id:[cx,cy]} da renderização anterior → anima o deslocamento
// condições que zeram o deslocamento e que impedem agir (Apêndice A do D&D 5e)
const MOVE_BLOCK_CONDS = ['Agarrado','Impedido','Paralisado','Atordoado','Inconsciente','Petrificado'];
const NO_ACT_CONDS = ['Paralisado','Atordoado','Inconsciente','Petrificado'];
function tacSpeedSquares(spd){ return Math.max(0, Math.round((spd||9)/1.5)); }   // 1 quadrado = 1,5 m
// orçamento de deslocamento (em quadrados) de um combatente, já com as condições
function tacMoveBudget(c){
  if (!c) return TAC_MOVE;
  const cs = c.conditions || [];
  if (cs.some(n => MOVE_BLOCK_CONDS.includes(n))) return 0;   // agarrado/impedido/incapacitado → não anda
  let b = c.speed != null ? tacSpeedSquares(c.speed) : TAC_MOVE;
  if (cs.includes('Caído')) b = Math.floor(b/2);              // levantar-se custa metade do movimento
  return b;
}
const TAC_TILE = {
  sand:{f:'#2a2430',s:'#39313f'}, surf:{f:'#1b3e50',s:'#27566e'}, sea:{f:'#0e2533',s:'#143242'},
  debris:{f:'#2a2320',s:'#3a2f29'}, ship_hull:{f:'#0c0a10',s:'#1a1620'}, cliff:{f:'#0c0a10',s:'#1a1620'},
  cave_floor:{f:'#201b29',s:'#2c2536'}, rock_wall:{f:'#0b0910',s:'#17131d'}, pool:{f:'#13303f',s:'#1b3e50'},
  fungus:{f:'#1d2c22',s:'#2a4031'}, tomb_floor:{f:'#241c22',s:'#332632'}, lava_fissure:{f:'#3a1d16',s:'#b8501f'},
  ash_mound:{f:'#2a2622',s:'#3a342c'}, hull_wall:{f:'#0c0a10',s:'#1a1620'}, ship_deck:{f:'#241d18',s:'#33291f'},
  hold_gap:{f:'#080709',s:'#15111a'}, orcus_sigil:{f:'#2a0e16',s:'#c4485a'}, stone_wall:{f:'#0c0a10',s:'#1a1620'},
  sky_edge:{f:'#0a1018',s:'#1b2a3a'}, dome_floor:{f:'#221c2b',s:'#2f2840'}, rubble:{f:'#2a2320',s:'#3a2f29'},
  altar:{f:'#2c2536',s:'#d9c48a'},
};
function tacKey(x,y){ return x+','+y; }
function tacMap(st){
  if (typeof TACTICAL_MAPS === 'undefined') return null;
  const m = TACTICAL_MAPS[st.sceneId]; if (!m) return null;
  if (!m._imp){ const s = new Set(); for (let y=0;y<m.h;y++){ const row=[...(m.cells[y]||'')]; for (let x=0;x<m.w;x++){ const t=m.legend[row[x]]; if (t&&t.impassable) s.add(tacKey(x,y)); } } m._imp = s; }
  return m;
}
function tacTileType(m,x,y){ const t = m.legend[[...(m.cells[y]||'')][x]]; return (t&&t.type) || 'cave_floor'; }
function tacOccupant(st,x,y){ const pos=(st.tactical&&st.tactical.pos)||{}; for (const id in pos){ if (pos[id][0]===x && pos[id][1]===y) return id; } return null; }
function tacActiveOwner(st){
  if (mpCombatActive(st)){ const cur=mpCurrentActor(st); if (cur&&cur.kind==='pc') return (st.characters[cur.idx]||{}).owner||null; return null; }
  const ap=mpActivePc(st); return ap?ap.owner:null;
}
function tacMyTurn(st){ const o=tacActiveOwner(st); return !!o && o===ME.id && !st.busy && !engineBusy; }
function tacSeed(st){
  const m=tacMap(st); if (!m){ st.tactical=null; return; }
  const pos={}; let si=0;
  (st.characters||[]).forEach(c=>{ const sp=m.pcSpawn[si++ % m.pcSpawn.length]; if (sp) pos[c.owner]=[sp[0],sp[1]]; });
  (st.combat.enemies||[]).forEach(e=>{ const sp=m.enemySpawn[e.id]; if (sp) pos[e.id]=[sp[0],sp[1]]; });
  st.tactical={ sceneId:st.sceneId, pos, seen:[], moved:{}, reacted:{} };
  tacReveal(st);
}
function tacLOS(m,x0,y0,x1,y1){ const dx=x1-x0,dy=y1-y0,steps=Math.max(Math.abs(dx),Math.abs(dy)); if (!steps) return true;
  for (let i=1;i<steps;i++){ const x=Math.round(x0+dx*i/steps),y=Math.round(y0+dy*i/steps); if (m._imp.has(tacKey(x,y))) return false; } return true; }
function tacVisible(st,m){
  const vis=new Set(); const pos=(st.tactical&&st.tactical.pos)||{}; const R=m.fogR||5;
  (st.characters||[]).forEach(c=>{ if ((c.hp||0)<=0) return; const p=pos[c.owner]; if (!p) return;
    for (let dy=-R;dy<=R;dy++) for (let dx=-R;dx<=R;dx++){ const x=p[0]+dx,y=p[1]+dy; if (x<0||y<0||x>=m.w||y>=m.h) continue; if (tacLOS(m,p[0],p[1],x,y)) vis.add(tacKey(x,y)); } });
  return vis;
}
function tacReveal(st){ const m=tacMap(st); if (!m||!st.tactical) return; const seen=new Set(st.tactical.seen||[]); tacVisible(st,m).forEach(k=>seen.add(k)); st.tactical.seen=[...seen]; }
function tacReachable(st,m,from,budget){
  const out=new Map(); if (!from) return out; out.set(tacKey(from[0],from[1]),0); let fr=[[from[0],from[1],0]];
  const D=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  while (fr.length){ const nx=[]; for (const [x,y,c] of fr){ if (c>=budget) continue; for (const [ddx,ddy] of D){ const a=x+ddx,b=y+ddy,k=tacKey(a,b);
    if (a<0||b<0||a>=m.w||b>=m.h||out.has(k)||m._imp.has(k)||tacOccupant(st,a,b)) continue;
    if (ddx&&ddy&&m._imp.has(tacKey(x+ddx,y))&&m._imp.has(tacKey(x,y+ddy))) continue; out.set(k,c+1); nx.push([a,b,c+1]); } } fr=nx; }
  out.delete(tacKey(from[0],from[1])); return out;
}
function tacTokenRef(st,id){
  const pc=(st.characters||[]).find(c=>c.owner===id);
  if (pc) return { kind:'pc', name:pc.name, img:pc.portrait||null, hp:pc.hp, maxHp:pc.maxHp };
  if (mpCombatActive(st)){ const e=(st.combat.enemies||[]).find(e=>e.id===id); if (e) return { kind:'enemy', name:e.name, img:monsterArt(e.name), hp:e.curHp, maxHp:e.hp }; }
  return null;
}
// URL estável (seed fixa) de um battlemap gerado por IA p/ a cena — "arte fixa":
// mesma seed = mesma imagem sempre; o navegador busca no Pollinations e cacheia.
function tacBgUrl(m){
  if (!m || !m.bg || !m.bg.prompt) return null;
  const w = m.w*64, h = m.h*64;   // mantém a proporção do grid, resolução decente
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(m.bg.prompt)}?width=${w}&height=${h}&seed=${m.bg.seed||1}&nologo=true&model=flux`;
}
function tacCssId(s){ return String(s).replace(/[^a-zA-Z0-9_-]/g,'_'); }
function tacInitials(n){ return (n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
function renderTacticalMap(st,m){
  const W=m.w,H=m.h,vw=W*TAC_CELL,vh=H*TAC_CELL;
  const seen=new Set((st.tactical&&st.tactical.seen)||[]); const visible=tacVisible(st,m);
  const activeId=tacActiveOwner(st); const pos=(st.tactical&&st.tactical.pos)||{};
  const activeChar = activeId ? (st.characters||[]).find(c=>c.owner===activeId) : null;
  const moveBudget = tacMoveBudget(activeChar);   // alcance vem da Speed do PC, zerado por condições
  const canMove = tacMyTurn(st) && activeId && pos[activeId] && !((st.tactical.moved||{})[activeId]) && moveBudget>0 && !PENDING_ABILITY;
  const reach = canMove ? tacReachable(st,m,pos[activeId],moveBudget) : new Map();
  // alvos de ação: durante meu turno, se puder agir (não incapacitado)
  const meChar = activeId ? (st.characters||[]).find(c=>c.owner===activeId) : null;
  const myPos = activeId ? pos[activeId] : null;
  const canAct = tacMyTurn(st) && meChar && myPos && (meChar.hp||0)>0 && !(meChar.conditions||[]).some(n=>NO_ACT_CONDS.includes(n));
  const foeTargets = new Set(), castEnemy = new Set(), castAlly = new Set();
  if (canAct && mpCombatActive(st)){
    if (PENDING_ABILITY){   // modo MIRA de magia: marca os alvos válidos
      const fx=PENDING_ABILITY.fx, rng=fx.range||1, side=abilityTargetSide(fx);
      if (side==='enemy'){ (st.combat.enemies||[]).forEach(e=>{ const ep=pos[e.id]; if(!ep||e.curHp<=0) return; if(!visible.has(tacKey(ep[0],ep[1]))) return; if(tacDist(myPos,ep)<=rng) castEnemy.add(e.id); }); }
      else { (st.characters||[]).forEach(a=>{ const ap=pos[a.owner]; if(!ap||(a.hp||0)<=0) return; if(tacDist(myPos,ap)<=rng) castAlly.add(a.owner); }); }
    } else {   // ataque normal com arma
      const rng = pcAttackRange(meChar);
      (st.combat.enemies||[]).forEach(e=>{ const ep=pos[e.id]; if (!ep||e.curHp<=0) return;
        if (!visible.has(tacKey(ep[0],ep[1]))) return; if (tacDist(myPos,ep)<=rng) foeTargets.add(e.id); });
    }
  }
  const bg = tacBgUrl(m);   // textura de fundo (battlemap gerado por IA); terreno vira só marcação por cima
  let terrain='',marks='',fog='',moves='';
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){
    const px=x*TAC_CELL,py=y*TAC_CELL,k=tacKey(x,y); const lg=tacLegendAt(m,x,y)||{}; const tl=TAC_TILE[tacTileType(m,x,y)]||TAC_TILE.cave_floor;
    terrain+=`<rect x="${px}" y="${py}" width="${TAC_CELL}" height="${TAC_CELL}" fill="${tl.f}" stroke="${tl.s}" stroke-width="1"/>`;
    if (bg){   // marca células bloqueadas/perigosas POR CIMA da arte (sempre visível, mesmo com a textura)
      if (lg.impassable) marks+=`<rect x="${px}" y="${py}" width="${TAC_CELL}" height="${TAC_CELL}" fill="rgba(8,6,12,0.5)"/>`;
      else if (lg.hazard) marks+=`<rect x="${px}" y="${py}" width="${TAC_CELL}" height="${TAC_CELL}" fill="rgba(196,72,90,0.30)"/>`;
    }
    if (!seen.has(k)) fog+=`<rect x="${px}" y="${py}" width="${TAC_CELL}" height="${TAC_CELL}" class="tac-fog"/>`;
    else if (!visible.has(k)) fog+=`<rect x="${px}" y="${py}" width="${TAC_CELL}" height="${TAC_CELL}" class="tac-fog remembered"/>`;
    if (reach.has(k)&&visible.has(k)) moves+=`<rect x="${px+3}" y="${py+3}" width="${TAC_CELL-6}" height="${TAC_CELL-6}" rx="6" class="tac-move" data-xy="${k}" tabindex="0" role="button"/>`;
  }
  const grid=`<g class="tac-grid">`+Array.from({length:W+1},(_,i)=>`<line x1="${i*TAC_CELL}" y1="0" x2="${i*TAC_CELL}" y2="${vh}"/>`).join('')+Array.from({length:H+1},(_,j)=>`<line x1="0" y1="${j*TAC_CELL}" x2="${vw}" y2="${j*TAC_CELL}"/>`).join('')+`</g>`;
  let defs='';
  for (const id in pos){ const ref=tacTokenRef(st,id); if (ref&&ref.img) defs+=`<pattern id="tok-${tacCssId(id)}" patternContentUnits="objectBoundingBox" width="1" height="1"><image href="${ref.img}" x="0" y="0" width="1" height="1" preserveAspectRatio="xMidYMid slice"/></pattern>`; }
  let tokens='';
  for (const id in pos){ const [x,y]=pos[id],ref=tacTokenRef(st,id); if (!ref) continue; const k=tacKey(x,y);
    if (ref.kind==='enemy' && !visible.has(k)) continue;
    if (ref.kind==='pc' && !visible.has(k) && !seen.has(k)) continue;
    const cx=x*TAC_CELL+TAC_CELL/2, cy=y*TAC_CELL+TAC_CELL/2, r=TAC_CELL*0.40;
    const fill=ref.img?`url(#tok-${tacCssId(id)})`:(ref.kind==='enemy'?'#3a1820':'#1e2a33'); const dead=ref.hp<=0;
    const pulse=(id===activeId)?`<circle cx="${cx}" cy="${cy}" r="${r}" class="tac-pulse ${ref.kind}"/>`:'';
    const label=ref.img?'':`<text x="${cx}" y="${cy}" class="tac-init" text-anchor="middle" dominant-baseline="central">${escapeHtml(tacInitials(ref.name))}</text>`;
    const pct=Math.max(0,Math.min(1,ref.hp/(ref.maxHp||1))), bw=r*1.8, bx=cx-bw/2, by=cy+r+3, hpc=pct>0.5?'#5a8f6b':pct>0.25?'#d9c48a':'#c4485a';
    const hpbar=dead?'':`<rect x="${bx}" y="${by}" width="${bw}" height="3" rx="1.5" fill="#0c0a10"/><rect x="${bx}" y="${by}" width="${(bw*pct).toFixed(1)}" height="3" rx="1.5" fill="${hpc}"/>`;
    const isFoe = ref.kind==='enemy' && foeTargets.has(id);
    const isCast = (ref.kind==='enemy' && castEnemy.has(id)) || (ref.kind==='pc' && castAlly.has(id));
    let cls='', tAttr='', ring='';
    if (isCast){ cls='tac-cast-target'; tAttr=` data-cast="${escapeHtml(id)}" tabindex="0" role="button" aria-label="Alvo ${escapeHtml(ref.name)}"`; ring=`<circle cx="${cx}" cy="${cy}" r="${r+3}" class="tac-cast-ring ${castAlly.has(id)?'ally':'foe'}"/>`; }
    else if (isFoe){ cls='tac-foe-target'; tAttr=` data-enemy="${escapeHtml(id)}" tabindex="0" role="button" aria-label="Atacar ${escapeHtml(ref.name)}"`; ring=`<circle cx="${cx}" cy="${cy}" r="${r+3}" class="tac-foe-ring"/>`; }
    tokens+=`<g class="tac-tok ${ref.kind} ${dead?'dead':''} ${cls}"${tAttr} data-id="${escapeHtml(id)}" data-cx="${cx}" data-cy="${cy}">${pulse}${ring}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" class="tac-disc"/>${label}${hpbar}${dead?`<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" class="tac-x">✕</text>`:''}</g>`;
  }
  // camadas: terreno (base/fallback) → textura IA → marcações de bloqueio → grade → névoa → movimento → tokens
  const bgImg = bg ? `<image href="${bg}" x="0" y="0" width="${vw}" height="${vh}" preserveAspectRatio="xMidYMid slice"/>` : '';
  return `<svg viewBox="0 0 ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg" class="tac-svg"><defs>${defs}</defs><g>${terrain}</g>${bgImg}<g>${marks}</g>${grid}<g>${fog}</g><g>${moves}</g><g>${tokens}</g></svg>`;
}
function renderTactical(st){
  const card=$('#tacticalCard'); if (!card) return;
  const m = mpCombatActive(st) ? tacMap(st) : null;
  if (!m || !st.tactical){ card.classList.add('hide'); card.innerHTML=''; TAC_PREV_POS={}; PENDING_ABILITY=null; ABILITY_MENU_OPEN=false; return; }
  const myTurn = mpCombatActive(st) && tacMyTurn(st);
  const owner = tacActiveOwner(st);
  const meC = owner ? (st.characters||[]).find(c=>c.owner===owner) : null;
  let bar='';
  if (myTurn){
    if (PENDING_ABILITY){
      bar = `<div class="tac-actions targeting"><span class="tac-aim">🎯 ${escapeHtml(PENDING_ABILITY.name)} — clique no alvo</span><button class="tac-end alt" id="tacCancelAbBtn">cancelar</button></div>`;
    } else {
      const abBtn = (meC && pcHasAbilities(meC)) ? `<button class="tac-end ${ABILITY_MENU_OPEN?'on':''}" id="tacAbBtn">✨ Ações</button>` : '';
      const menu = (ABILITY_MENU_OPEN && meC) ? tacAbilityMenuHtml(meC) : '';
      bar = `<div class="tac-actions">${abBtn}<button class="tac-end" id="tacEndBtn">Encerrar turno ⏭</button></div>${menu}`;
    }
  } else { PENDING_ABILITY=null; ABILITY_MENU_OPEN=false; }
  card.classList.remove('hide'); card.innerHTML = renderTacticalMap(st,m) + bar;
  tacAnimateMoves();   // desliza tokens que mudaram de célula
  fxPlay(st);          // toca as animações de combate novas (deduplicadas por id)
  $$('#tacticalCard .tac-move').forEach(el=>{ const [x,y]=el.dataset.xy.split(',').map(Number);
    el.onclick=()=>tacRequestMove(x,y); el.onkeydown=e=>{ if (e.key==='Enter'||e.key===' '){ e.preventDefault(); tacRequestMove(x,y); } }; });
  $$('#tacticalCard .tac-foe-target').forEach(el=>{ const id=el.dataset.enemy;
    el.onclick=()=>tacRequestAttack(id); el.onkeydown=e=>{ if (e.key==='Enter'||e.key===' '){ e.preventDefault(); tacRequestAttack(id); } }; });
  $$('#tacticalCard .tac-cast-target').forEach(el=>{ const id=el.dataset.cast;
    el.onclick=()=>tacCastOnTarget(id); el.onkeydown=e=>{ if (e.key==='Enter'||e.key===' '){ e.preventDefault(); tacCastOnTarget(id); } }; });
  const endBtn=$('#tacEndBtn'); if (endBtn) endBtn.onclick=()=>tacEndTurn();
  const abBtn=$('#tacAbBtn'); if (abBtn) abBtn.onclick=()=>{ ABILITY_MENU_OPEN=!ABILITY_MENU_OPEN; renderTactical(st); };
  const cancelBtn=$('#tacCancelAbBtn'); if (cancelBtn) cancelBtn.onclick=()=>tacCancelAbility();
  $$('#tacticalCard .tac-ab-item').forEach(el=>{ if (el.dataset.dis==='1') return;
    el.onclick=()=>{ ABILITY_MENU_OPEN=false; tacPickAbility(el.dataset.ab); }; });
}
// anima o deslocamento: cada token que mudou de célula parte da posição
// anterior e desliza até a nova (transform translate + transição CSS)
function tacAnimateMoves(){
  const reduce = (typeof window!=='undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const prev = TAC_PREV_POS, cur = {};
  $$('#tacticalCard g.tac-tok[data-id]').forEach(g=>{
    const id=g.dataset.id, cx=+g.dataset.cx, cy=+g.dataset.cy; cur[id]=[cx,cy];
    const p = prev[id];
    if (!reduce && p && (p[0]!==cx || p[1]!==cy)){
      const dx=p[0]-cx, dy=p[1]-cy;
      g.style.transition='none'; g.style.transform=`translate(${dx}px,${dy}px)`;
      void g.getBoundingClientRect();                     // força reflow p/ a posição inicial valer
      requestAnimationFrame(()=>{ g.style.transition='transform .42s cubic-bezier(.34,.7,.36,1)'; g.style.transform='translate(0,0)'; });
    }
  });
  TAC_PREV_POS = cur;
}
// ════════════════════════════════════════════════════════════════════════
//  FX ENGINE — animações de combate (PURAMENTE VISUAL). Espelhado via st.fx →
//  toca em TODOS os clientes, 1× cada (dedupe por id). NÃO altera estado/HP.
//  Mesmo padrão de tacAnimateMoves()/TAC_PREV_POS.
// ════════════════════════════════════════════════════════════════════════
const FX_NS='http://www.w3.org/2000/svg', FX_MAX=24, FX_TTL_MS=5000;
let FX_SEQ=0, FX_SEEDED=false, ROLLS_DEFAULTED=false; const FX_SEEN=new Set();
function fxReduce(){ return (typeof window!=='undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
function fxCellPx(c){ return c ? [c[0]*TAC_CELL+TAC_CELL/2, c[1]*TAC_CELL+TAC_CELL/2] : null; }
function fxPosOf(st,id){ const p=(st&&st.tactical&&st.tactical.pos)||{}; return fxCellPx(p[id]); }
function fxMultCls(mult){ return mult==='imune'?'fx-imune':mult==='vulnerável'?'fx-vuln':mult==='resistência'?'fx-resist':''; }
function fxResult(hit,crit){ return crit?'crit':hit?'hit':'miss'; }
// EMISSÃO — só o admin escreve (single-writer); st.fx viaja no save a todos
function fxEmit(st,d){ if(!st||!amIAdmin()) return; st.fx=st.fx||[]; d.id=`${Date.now().toString(36)}-${(FX_SEQ++).toString(36)}`; d.t=Date.now(); st.fx.push(d); if(st.fx.length>FX_MAX) st.fx.splice(0,st.fx.length-FX_MAX); }
function fxClear(st){ if(st) st.fx=[]; }
function fxSeedSeen(st){ ((st&&st.fx)||[]).forEach(d=>{ if(d.id) FX_SEEN.add(d.id); }); }
const FX_DTYPE={ fogo:{c:'#ff7a2e',g:'#ffd24a'}, frio:{c:'#7fd4ff',g:'#d6f6ff'}, 'necrótico':{c:'#7b5ea8',g:'#caa9d6'},
  radiante:{c:'#ffe9a8',g:'#fff6d0'}, 'força':{c:'#c9a0ff',g:'#ffc4f4'}, 'psíquico':{c:'#c77bff',g:'#f0d6ff'},
  'elétrico':{c:'#9fd0ff',g:'#fff'}, 'trovão':{c:'#bcd0ff',g:'#eef4ff'}, veneno:{c:'#8fdf4a',g:'#d6ff9a'},
  'ácido':{c:'#b8f04a',g:'#eaffb0'}, cortante:{c:'#f4e4c1',g:'#fff'}, perfurante:{c:'#cfe3ef',g:'#fff'}, 'concussão':{c:'#e8b15a',g:'#ffe'} };
function fxCol(dtype){ return FX_DTYPE[dmgNorm(dtype)] || FX_DTYPE['concussão']; }
function fxTok(svg,id){ try{ return svg.querySelector(`g.tac-tok[data-id="${(window.CSS&&CSS.escape)?CSS.escape(String(id)):String(id)}"]`); }catch(e){ return null; } }
function fxSpawn(layer,markup,ms){ const g=document.createElementNS(FX_NS,'g'); g.setAttribute('class','tac-fx'); g.innerHTML=markup; layer.appendChild(g); setTimeout(()=>{ try{g.remove();}catch(e){} }, ms||1200); return g; }
function fxRetrigger(node,cls,ms){ if(!node) return; node.classList.remove(cls); void node.getBoundingClientRect(); node.classList.add(cls); if(ms) setTimeout(()=>{ try{node.classList.remove(cls);}catch(e){} }, ms); }
// PLAYBACK — roda em todos, chamado no fim de renderTactical
function fxPlay(st){
  const svg=$('#tacticalCard svg.tac-svg'); if(!svg) return;
  fxDrawTethers(svg,st);                          // tethers de agarrão (persistentes)
  const list=(st&&st.fx)||[]; if(!list.length) return;
  const reduce=fxReduce(), now=Date.now();
  let layer=svg.querySelector('g.tac-fx-layer');
  if(!layer){ layer=document.createElementNS(FX_NS,'g'); layer.setAttribute('class','tac-fx-layer'); layer.setAttribute('pointer-events','none'); svg.appendChild(layer); }
  for(const d of list){ if(FX_SEEN.has(d.id)) continue; FX_SEEN.add(d.id); if(now-(d.t||0)>FX_TTL_MS) continue; if(reduce) continue; try{ fxDraw(layer,svg,d,st); }catch(e){} }
  if(FX_SEEN.size>256){ FX_SEEN.clear(); list.forEach(x=>FX_SEEN.add(x.id)); }
}
function fxDraw(layer,svg,d,st){
  const s=fxPosOf(st,d.src), tgtIds=d.tgts||(d.tgt!=null?[d.tgt]:[]); const ds=`style="animation-delay:${(d.seq||0)*120}ms"`;
  switch(d.kind){
    case 'melee':  return fxDraw_melee(layer,d,s,tgtIds,ds,st);
    case 'ranged': return fxDraw_ranged(layer,d,s,tgtIds,st);
    case 'area': case 'breath': return fxDraw_area(layer,d,st);
    case 'heal':   return fxDraw_heal(layer,st,tgtIds,ds);
    case 'react':  return fxDraw_react(layer,svg,d,st);
    case 'oa':     return fxDraw_oa(layer,d,st);
    case 'stun':   return fxDraw_stun(layer,st,tgtIds);
  }
}
// MELEE — corte/estocada/impacto no alvo (sem lunge no token: evita colisão com o slide de movimento)
function fxDraw_melee(layer,d,s,tgtIds,ds,st){
  const phys=dmgNorm(d.dtype)||'concussão', mc=fxMultCls(d.mult);
  tgtIds.forEach(tid=>{ const t=fxPosOf(st,tid); if(!t) return;
    const ang=s?Math.round(Math.atan2(t[1]-s[1],t[0]-s[0])*180/Math.PI):0;
    let glyph;
    if(d.result==='miss') glyph=`<line class="fx-whiff" x1="-16" y1="0" x2="16" y2="0"/>`;
    else if(phys==='cortante') glyph=`<path class="fx-slash" d="M-16 -13 A21 21 0 0 1 16 -13"/>`;
    else if(phys==='perfurante') glyph=`<path class="fx-thrust" d="M-19 0 L14 0 M4 -6 L16 0 L4 6"/>`;
    else glyph=`<g class="fx-impact"><circle r="6"/><circle r="13"/><circle r="20"/></g>`;
    const big=d.mult==='vulnerável'?1.3:1;
    fxSpawn(layer,`<g class="fx-melee ${phys} ${d.result} ${mc}" transform="translate(${t[0]},${t[1]}) rotate(${ang}) scale(${big})" ${ds}>${glyph}${d.mult==='imune'?'<text class="fx-puff" y="-22">sem efeito</text>':''}</g>`,700); });
}
// RANGED — projétil atacante→alvo, cor por dtype
function fxDraw_ranged(layer,d,s,tgtIds,st){
  tgtIds.forEach(tid=>{ const t=fxPosOf(st,tid); if(!s||!t) return; const col=fxCol(d.dtype);
    fxSpawn(layer,`<line x1="${s[0]}" y1="${s[1]}" x2="${t[0]}" y2="${t[1]}" class="fx-bolt-line ${d.result}" stroke="${col.c}"/><circle r="4" fill="${col.g}" class="fx-bolt ${d.result}" style="color:${col.c}"><animateMotion dur="0.3s" fill="freeze" path="M${s[0]},${s[1]} L${t[0]},${t[1]}"/></circle>`,700); });
}
// AREA/BREATH — cone (origin→centro) ou burst radial, cor por dtype
function fxDraw_area(layer,d,st){
  const o=fxPosOf(st,d.src), c=fxCellPx(d.center)||o; if(!c) return; const col=fxCol(d.dtype);
  const reach=((d.radius||1)+0.6)*TAC_CELL, ang=o?Math.atan2(c[1]-o[1],c[0]-o[0]):0;
  const cone=(d.kind==='breath'||d.cone)&&o&&Math.hypot(c[0]-o[0],c[1]-o[1])>1; let path;
  if(cone){ const sp=Math.PI/4, ox=o[0], oy=o[1], x1=ox+Math.cos(ang-sp)*reach, y1=oy+Math.sin(ang-sp)*reach, x2=ox+Math.cos(ang+sp)*reach, y2=oy+Math.sin(ang+sp)*reach;
    path=`<path class="fx-area cone ${fxMultCls(d.mult)}" d="M${ox} ${oy} L${x1.toFixed(1)} ${y1.toFixed(1)} A${reach.toFixed(1)} ${reach.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" style="transform-origin:${ox}px ${oy}px" fill="${col.c}"/>`;
  } else path=`<circle class="fx-area burst ${fxMultCls(d.mult)}" cx="${c[0]}" cy="${c[1]}" r="${reach.toFixed(1)}" style="transform-origin:${c[0]}px ${c[1]}px" fill="${col.c}"/>`;
  fxSpawn(layer,path,1100);
}
// HEAL — brilho verde/dourado subindo no aliado
function fxDraw_heal(layer,st,tgtIds,ds){
  tgtIds.forEach(tid=>{ const t=fxPosOf(st,tid); if(!t) return; let sparks='';
    for(let i=0;i<6;i++){ const dx=(i-2.5)*5; sparks+=`<circle class="fx-spark" cx="${t[0]+dx}" cy="${t[1]+TAC_CELL*0.25}" r="2.2" style="animation-delay:${i*60}ms"/>`; }
    fxSpawn(layer,`<circle class="fx-heal-glow" cx="${t[0]}" cy="${t[1]}" r="${TAC_CELL*0.42}" ${ds}/><text class="fx-plus" x="${t[0]}" y="${t[1]-TAC_CELL*0.4}" text-anchor="middle">+</text>${sparks}`,1250); });
}
// REACT — impacto no alvo: tremor (token) + flash; morte = overlay posicional (token já saiu do tabuleiro)
function fxDraw_react(layer,svg,d,st){
  const p=d.at||fxPosOf(st,d.tgt); if(!p) return;
  if(d.result==='death'){ const tok=fxTok(svg,d.tgt); if(tok) fxRetrigger(tok,'fx-die',800);
    fxSpawn(layer,`<circle cx="${p[0]}" cy="${p[1]}" r="${(TAC_CELL*0.42).toFixed(1)}" class="fx-death-puff"/>`,820); return; }
  if(d.result==='miss'){ const tok=fxTok(svg,d.tgt); if(tok) fxRetrigger(tok,'fx-whiff-shake',320); return; }
  if(d.mult==='imune') return;
  const tok=fxTok(svg,d.tgt); const cls=d.mult==='vulnerável'?'fx-shake-big':d.mult==='resistência'?'fx-nudge':d.result==='crit'?'fx-shake-big':'fx-shake';
  if(tok) fxRetrigger(tok,cls,600);
  fxSpawn(layer,`<circle class="fx-flash ${d.mult==='vulnerável'?'big':''}" cx="${p[0]}" cy="${p[1]}" r="${(TAC_CELL*0.40).toFixed(1)}"/>`,500);
}
// OA — raio reagente→movedor + selo ⚡ AO
function fxDraw_oa(layer,d,st){
  const a=fxPosOf(st,d.src), b=fxPosOf(st,d.tgt); if(!a||!b) return;
  const mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2, jx=mx+(b[1]-a[1])*0.12, jy=my-(b[0]-a[0])*0.12;
  const path=`M${a[0]} ${a[1]} L${jx.toFixed(1)} ${jy.toFixed(1)} L${b[0]} ${b[1]}`;
  fxSpawn(layer,`<g class="fx-oa ${d.result==='miss'?'whiff':''} ${d.result==='crit'?'crit':''}"><path d="${path}" class="oa-bolt"/><path d="${path}" class="oa-bolt core"/><g class="oa-tag" transform="translate(${mx.toFixed(1)},${(my-TAC_CELL*0.34).toFixed(1)})"><rect x="-21" y="-11" width="42" height="18" rx="5" class="oa-tag-bg"/><text x="0" y="3" text-anchor="middle" class="oa-tag-tx">⚡ AO</text></g></g>`,1100);
}
// STUN — estrelas de atordoamento (garras do Ghoul)
function fxDraw_stun(layer,st,tgtIds){
  tgtIds.forEach(tid=>{ const p=fxPosOf(st,tid); if(!p) return; let stars='';
    for(let i=0;i<5;i++){ const ang=(-90+i*30-30)*Math.PI/180, R=TAC_CELL*0.42, sx=p[0]+Math.cos(ang)*R, sy=p[1]-TAC_CELL*0.30+Math.sin(ang)*R*0.5;
      stars+=`<text x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" class="stun-star" style="--d:${i*70}ms" text-anchor="middle">✦</text>`; }
    fxSpawn(layer,`<circle cx="${p[0]}" cy="${p[1]}" r="${(TAC_CELL*0.46).toFixed(1)}" class="stun-ring"/>${stars}`,1400); });
}
// TETHER do agarrão — derivado de 'Agarrado', redesenhado a cada render (persistente)
function fxDrawTethers(svg,st){
  let layer=svg.querySelector('g.tac-fx-tethers');
  if(!layer){ layer=document.createElementNS(FX_NS,'g'); layer.setAttribute('class','tac-fx-tethers'); layer.setAttribute('pointer-events','none'); svg.appendChild(layer); }
  layer.innerHTML=''; if(!mpCombatActive(st)) return; const pos=(st.tactical&&st.tactical.pos)||{};
  (st.characters||[]).forEach(c=>{ if(!(c.conditions||[]).includes('Agarrado')) return; const cp=pos[c.owner]; if(!cp) return;
    const g=(st.combat&&st.combat.enemies||[]).find(e=>e.curHp>0 && pos[e.id] && tacDist(cp,pos[e.id])<=1); if(!g) return;
    const a=fxCellPx(pos[g.id]), b=fxCellPx(cp), mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2, dx=b[0]-a[0], dy=b[1]-a[1];
    layer.insertAdjacentHTML('beforeend',`<g class="tac-fx-tether"><path d="M${a[0]} ${a[1]} Q${(mx-dy*0.18).toFixed(1)} ${(my+dx*0.18).toFixed(1)} ${b[0]} ${b[1]}" class="tether-line"/><circle cx="${b[0]}" cy="${b[1]}" r="4" class="tether-grip"/></g>`); });
}

async function tacRequestMove(x,y){
  const st=ROOM.state||{}, m=tacMap(st); if (!m||!st.tactical) return;
  const owner=tacActiveOwner(st);
  if (!owner||owner!==ME.id||!tacMyTurn(st)||((st.tactical.moved||{})[owner])) return;
  if (m._imp.has(tacKey(x,y))||tacOccupant(st,x,y)) return;
  if (amIAdmin()){ await tacMoveToken(st,owner,x,y); }
  else { try { await supa.from('room_actions').insert({ room_id:ROOM.id, user_id:ME.id, display_name:'(mov)', text: MOVE_PREFIX+JSON.stringify({owner,x,y}) }); } catch(e){} }
}
async function tacMoveToken(st,owner,x,y){
  const m=tacMap(st); if (!m||!st.tactical) return;
  if (m._imp.has(tacKey(x,y))||tacOccupant(st,x,y)) return;
  const from=st.tactical.pos[owner]; if (!from) return;
  const ac=(st.characters||[]).find(c=>c.owner===owner); const budget=tacMoveBudget(ac);
  if (budget<=0) return;                                            // condição impede o movimento
  if (!tacReachable(st,m,from,budget).has(tacKey(x,y))) return;     // valida alcance (Speed) no servidor
  const fell = resolveOpportunity(st, owner, from, [x,y]);          // sair do alcance provoca ataque de oportunidade
  st.tactical.moved=st.tactical.moved||{}; st.tactical.moved[owner]=true;
  if (st.tactical.pos[owner]) st.tactical.pos[owner]=[x,y];         // guard: tacKill apaga a pos se o PC caiu na OA
  tacReveal(st);
  await saveState(st); renderGame();
  if (fell && mpCombatActive(st)) await tacAdvanceFromPc(st);       // PC caiu na OA → encerra o turno dele e segue
}

// ============================================================
//  MOTOR DE COMBATE PROGRAMADO (IA só narra; decisões 100% código)
//  Regra de alvo (pedido do usuário): mira o PC MAIS PRÓXIMO; entre os
//  mais próximos, o de MENOR HP. Dados rolados pelo código.
// ============================================================
let TEST_MODE = false;   // ?teste=1 → sem login/IA; narração de inimigo usa template
const ATTACK_PREFIX = '@@ATK@@', ENDTURN_PREFIX = '@@ENDTURN@@';
const MONSTER_AI = {
  'Zumbi Afogado': { speed:4, reach:1, fly:false, multiattack:1, flee:0 },
  'Zumbi':         { speed:4, reach:1, fly:false, multiattack:1, flee:0 },
  'Polvo de Fungo':{ speed:3, reach:1, fly:false, multiattack:2, flee:0.25, trait:'grapple', anchor:true },
  'Fume Drake':    { speed:5, reach:3, fly:true,  multiattack:1, flee:0.5, kite:true },
  'Ghoul':         { speed:5, reach:1, fly:false, multiattack:2, flee:0, trait:'paralyze', saveDC:10 },
  'Dragão Jovem':  { speed:6, reach:1, fly:true,  multiattack:2, flee:0, breath:{ dc:14, radius:1, dmg:'4d6', dtype:'fogo' } },
};
const MONSTER_AI_DEFAULT = { speed:5, reach:1, fly:false, multiattack:1, flee:0 };
function aiProfile(e){ return Object.assign({}, MONSTER_AI_DEFAULT, MONSTER_AI[e.name]||{}); }

// ============================================================
//  P0 — TIPOS DE DANO, STAT BLOCKS E PIPELINE ÚNICO DE DANO
//  (resistências/imunidades/vulnerabilidades, HP temporário,
//   Fortitude Morta-Viva). Determinístico; roda só no admin.
// ============================================================
function dmgNorm(type){
  let t = String(type||'').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const MAP = { cortante:'cortante', slashing:'cortante', perfurante:'perfurante', piercing:'perfurante',
    concussao:'concussão', contundente:'concussão', bludgeoning:'concussão', fogo:'fogo', fire:'fogo',
    frio:'frio', gelo:'frio', cold:'frio', necrotico:'necrótico', necrotic:'necrótico', radiante:'radiante', radiant:'radiante',
    forca:'força', force:'força', psiquico:'psíquico', psychic:'psíquico', veneno:'veneno', poison:'veneno',
    acido:'ácido', acid:'ácido', eletrico:'elétrico', relampago:'elétrico', raio:'elétrico', lightning:'elétrico',
    trovao:'trovão', thunder:'trovão' };
  return MAP[t] || t || null;   // null = arma sem tipo declarado → não dispara resist/vuln (seguro)
}
// MONSTER_FX — estende MONSTER_AI por e.name. type: gancho p/ Expulsar/Sono/charme.
// physType: tipo do golpe corpo-a-corpo. resist/vuln/immune: tipos de dano. condImmune: condições.
// (Vulnerabilidade a radiante NÃO é dada aos mortos-vivos: fora do SRD e desbalancearia o Cap.1.)
const MONSTER_FX = {
  'Zumbi Afogado': { type:'morto-vivo', physType:'concussão', immune:['veneno'], resist:['necrótico'], condImmune:['Envenenado','Enfeitiçado'], mind:-2,
    traits:{ undeadFortitude:{ saveBonus:3, baseDC:5, exceptDtypes:['radiante'], failOnCrit:true } } },
  'Zumbi': { type:'morto-vivo', physType:'concussão', immune:['veneno'], resist:['necrótico'], condImmune:['Envenenado','Enfeitiçado'], mind:-2,
    traits:{ undeadFortitude:{ saveBonus:3, baseDC:5, exceptDtypes:['radiante'], failOnCrit:true } } },
  'Ghoul': { type:'morto-vivo', physType:'cortante', immune:['veneno'], resist:['necrótico'], condImmune:['Envenenado','Enfeitiçado'], mind:0,
    traits:{ paralyzingClaws:{ dc:10, elfImmune:true } } },
  'Polvo de Fungo': { type:'morto-vivo', physType:'concussão', immune:['veneno'], resist:['necrótico'], condImmune:['Envenenado','Enfeitiçado'], mind:-2 },
  'Fume Drake': { type:'dragão', physType:'fogo', immune:['fogo'], vuln:['frio'] },
  'Dragão Jovem': { type:'dragão', physType:'perfurante', element:'fogo', immune:['fogo'], condImmune:['Amedrontado'] },
};
const MONSTER_FX_DEFAULT = { type:'humanoide', physType:'concussão', resist:[], immune:[], vuln:[], condImmune:[], traits:{} };
function fxProfile(e){ return Object.assign({}, MONSTER_FX_DEFAULT, MONSTER_FX[(e&&e.name)]||{}); }
function enemyDmgType(e){ return fxProfile(e).physType || 'concussão'; }
function enemyCondImmune(e, cond){ return (fxProfile(e).condImmune||[]).includes(cond); }
function enemyType(e){ return fxProfile(e).type; }
function targetIsEnemy(t){ return t && t.curHp !== undefined && !t.racialEffects; }
function pcResist(c){
  const raw = (c.racialEffects && c.racialEffects.resist) || [];
  const out = raw.map(r => r==='ancestral' ? null : dmgNorm(r)).filter(Boolean);   // 'ancestral' não resolvido → sem resist (P0)
  if (c.raging){ out.push('cortante','perfurante','concussão'); }                   // Fúria: resistência a dano físico
  return out;
}
function targetDmgLists(t){
  if (targetIsEnemy(t)){ const fx = fxProfile(t);
    return { resist:(fx.resist||[]).map(dmgNorm), vuln:(fx.vuln||[]).map(dmgNorm), immune:(fx.immune||[]).map(dmgNorm) }; }
  return { resist: pcResist(t), vuln:[], immune:[] };
}
// ÚNICO ponto que remove HP: imune/resist/vuln (por tipo) → HP temp → HP real → gatilhos pós-dano.
function applyDamage(target, amount, type, st, opts){
  opts = opts || {};
  const t = dmgNorm(type);
  let dmg = Math.max(0, Math.floor(amount||0)); let mult='normal';
  if (t){ const L = targetDmgLists(target);
    if (L.immune.includes(t)){ dmg=0; mult='imune'; }
    else if (L.vuln.includes(t)){ dmg=dmg*2; mult='vulnerável'; }
    else if (L.resist.includes(t)){ dmg=Math.floor(dmg/2); mult='resistência'; } }
  let absorbed=0;
  if (target.tempHp>0 && dmg>0){ absorbed=Math.min(target.tempHp,dmg); target.tempHp-=absorbed; dmg-=absorbed; }
  if (targetIsEnemy(target)){
    const px = (typeof fxPosOf==='function') ? fxPosOf(st, target.id) : null;   // posição antes do tacKill (p/ animação de morte)
    const before=target.curHp; target.curHp=Math.max(0,target.curHp-dmg);
    if (mult==='imune' && st) st.history.push({ role:'scene', text:`✦ ${target.name} é imune a dano de ${t} — sem efeito.` });
    if (typeof fxEmit==='function') fxEmit(st, { kind:'react', tgt:target.id, at:px, mult, result: opts.crit?'crit':(dmg>0?'hit':'miss') });   // impacto (cobre Fortitude)
    if (target.curHp<=0 && before>0){
      if (mpUndeadFortitude(st,target,dmg,t,opts)) return { applied:dmg, mult, down:false, absorbed };
      if (typeof fxEmit==='function') fxEmit(st, { kind:'react', tgt:target.id, at:px, result:'death' });
      tacKill(st,target.id); }
    return { applied:dmg, mult, down:target.curHp<=0, absorbed };
  } else {
    const px = (typeof fxPosOf==='function') ? fxPosOf(st, target.owner) : null;
    const before=target.hp; target.hp=Math.max(0,target.hp-dmg);
    if (typeof fxEmit==='function') fxEmit(st, { kind:'react', tgt:target.owner, at:px, mult, result: opts.crit?'crit':(dmg>0?'hit':'miss') });
    if (target.hp<=0 && before>0){ if (typeof fxEmit==='function') fxEmit(st, { kind:'react', tgt:target.owner, at:px, result:'death' }); tacKill(st,target.owner); }
    if (!opts.noConc && (dmg+absorbed)>0 && typeof concentrationCheckOnDamage==='function') concentrationCheckOnDamage(st,target,dmg+absorbed);
    return { applied:dmg, mult, down:target.hp<=0, absorbed };
  }
}
// Fortitude Morta-Viva: ao zerar, save CON DC 5+dano (exceto radiante/crítico) → fica com 1 HP.
function mpUndeadFortitude(st, e, dmg, dtype, opts){
  const tr = (fxProfile(e).traits||{}).undeadFortitude; if (!tr) return false;
  if ((tr.exceptDtypes||[]).includes(dtype)) return false;
  if (tr.failOnCrit && opts.crit) return false;
  const dc = (tr.baseDC||5) + (dmg||0);
  const sv = mpD20(null, tr.saveBonus||0); const ok = sv.total>=dc;
  st.history.push({ role:'roll', tipo:'save', dc, total:sv.total, mod:tr.saveBonus||0, dice:sv.dice, crit:sv.crit, fumble:sv.fumble, nat:sv.nat, label:`${e.name} · Fortitude Morta-Viva (CON)` });
  if (ok){ e.curHp=1; st.history.push({ role:'scene', text:`✦ ${e.name} se recusa a cair — ergue-se com 1 HP!` }); return true; }
  return false;
}
function dmgMultNote(mult){ return mult==='imune'?' (imune)':mult==='vulnerável'?' (vulnerável ×2)':mult==='resistência'?' (resistência ½)':''; }

// ============================================================
//  P1 — ATAQUES DE OPORTUNIDADE (reações). Sair do alcance corpo-a-corpo
//  de um inimigo provoca um ataque dele (1 reação por rodada). Determinístico.
// ============================================================
function tacReachOfEnemy(e){ return aiProfile(e).reach||1; }
function pcThreatReach(c){ return pcAttackRange(c)<=1 ? 1 : 0; }   // só ameaça OA quem tem corpo-a-corpo
function tacHasReaction(st,id){ return !((st.tactical&&st.tactical.reacted||{})[id]); }
function tacSpendReaction(st,id){ st.tactical.reacted=st.tactical.reacted||{}; st.tactical.reacted[id]=true; }
function resetReactionFor(st,id){ if(st.tactical&&st.tactical.reacted) delete st.tactical.reacted[id]; }
function oaEnemyStrike(st,e,pc){
  const tam=(typeof targetAttackMods==='function')?targetAttackMods(pc,true):{adv:false,dis:false,autoCrit:false};
  const atk=mpD20(null, e.mod||0, { adv:tam.adv, dis:tam.dis });
  const hit=atk.crit||(!atk.fumble&&atk.total>=(pc.ca||10)); if(hit&&tam.autoCrit&&!atk.fumble) atk.crit=true;
  st.history.push({ role:'roll', label:`${e.name} · ataque de oportunidade → ${pc.name}`, total:atk.total, mod:e.mod||0, dice:atk.dice, crit:atk.crit, fumble:atk.fumble, dc:pc.ca, tipo:'ataque', nat:atk.nat });
  if(hit){ const d=mpRollDmgExpr(e.dmg||'1d6',atk.crit); applyDamage(pc, d.total, enemyDmgType(e), st, {crit:atk.crit, srcEnemy:e}); }
  fxEmit(st, { kind:'oa', src:e.id, tgt:pc.owner, result:fxResult(hit,atk.crit) });
  if(hit) fxEmit(st, { kind:'melee', dtype:enemyDmgType(e), src:e.id, tgt:pc.owner, result:fxResult(true,atk.crit) });
}
function oaPcStrike(st,c,e){
  const tam=(typeof targetAttackMods==='function')?targetAttackMods(e,true):{adv:false,dis:false,autoCrit:false};
  const card=doMpRoll(c, ['','ataque','FOR','0',e.name], { adv:tam.adv, dis:tam.dis, autoCrit:tam.autoCrit });
  card.label=`${c.name} · ataque de oportunidade → ${e.name}`; card.dc=e.ca;
  const hit=card.crit||(!card.fumble&&!card.autoFail&&card.total>=e.ca); card.outcome=hit?'ACERTO':'ERRO';
  st.history.push(card);
  if(hit&&card.dmg){ const res=applyDamage(e, card.dmg.total, card.dmg.type, st, {crit:card.crit}); card.dmg.applied=res.applied; card.dmg.mult=res.mult; }
  fxEmit(st, { kind:'oa', src:c.owner, tgt:e.id, result:fxResult(hit,card.crit) });
  if(hit&&card.dmg) fxEmit(st, { kind:'melee', dtype:card.dmg.type, src:c.owner, tgt:e.id, result:fxResult(true,card.crit), mult:card.dmg.mult });
}
// chamado ANTES de mover 'moverId' de 'from' para 'to'; resolve OAs de quem ele deixa.
// Devolve true se o próprio movedor caiu (parar o movimento).
function resolveOpportunity(st, moverId, from, to){
  if(!st.tactical||!from||!to||!mpCombatActive(st)) return false;
  const pos=st.tactical.pos;
  const moverPc=(st.characters||[]).find(c=>c.owner===moverId);
  if(moverPc){
    for(const e of (st.combat.enemies||[])){ if(e.curHp<=0) continue; const ep=pos[e.id]; if(!ep) continue;
      const reach=tacReachOfEnemy(e);
      if(tacDist(from,ep)<=reach && tacDist(to,ep)>reach && tacHasReaction(st,e.id) && !(e.conditions||[]).some(n=>NO_ACT_CONDS.includes(n))){
        tacSpendReaction(st,e.id); oaEnemyStrike(st,e,moverPc); if((moverPc.hp||0)<=0) break; }
    }
    return (moverPc.hp||0)<=0;
  } else {
    const e=(st.combat.enemies||[]).find(x=>x.id===moverId); if(!e) return false;
    for(const c of (st.characters||[])){ if((c.hp||0)<=0) continue; const cp=pos[c.owner]; if(!cp) continue;
      const reach=pcThreatReach(c);
      if(reach>0 && tacDist(from,cp)<=reach && tacDist(to,cp)>reach && tacHasReaction(st,c.owner) && !(c.conditions||[]).some(n=>NO_ACT_CONDS.includes(n))){
        tacSpendReaction(st,c.owner); oaPcStrike(st,c,e); if(e.curHp<=0) break; }
    }
    return e.curHp<=0;
  }
}
function tacDist(a,b){ return (a&&b) ? Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1])) : 0; }
function tacLegendAt(m,x,y){ return m.legend[[...(m.cells[y]||'')][x]] || null; }
function tacIsHazard(m,x,y){ const t=tacLegendAt(m,x,y); return !!(t&&t.hazard); }
function tacEnterable(m,x,y,fly){ const t=tacLegendAt(m,x,y); if(!t) return false; if(!t.impassable) return true; return !!(fly&&t.hazard); }
function aiReach(st,m,from,budget,fly){   // BFS ciente de voo; ignora células ocupadas (cadáveres já saíram)
  const out=new Map(); if(!from) return out; out.set(tacKey(from[0],from[1]),0); let fr=[[from[0],from[1],0]];
  const D=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  while(fr.length){ const nx=[]; for(const [x,y,c] of fr){ if(c>=budget) continue; for(const [dx,dy] of D){ const a=x+dx,b=y+dy,k=tacKey(a,b);
    if(a<0||b<0||a>=m.w||b>=m.h||out.has(k)||!tacEnterable(m,a,b,fly)||tacOccupant(st,a,b)) continue;
    if(dx&&dy&&!tacEnterable(m,x+dx,y,fly)&&!tacEnterable(m,x,y+dy,fly)) continue;
    out.set(k,c+1); nx.push([a,b,c+1]); } } fr=nx; }
  out.delete(tacKey(from[0],from[1])); return out;
}
function aiLivePcs(st){ const pos=(st.tactical&&st.tactical.pos)||{};
  return (st.characters||[]).map((c,idx)=>({idx,owner:c.owner,pc:c,pos:pos[c.owner]})).filter(t=>(t.pc.hp||0)>0); }
// REGRA DO USUÁRIO: PC mais próximo primeiro; entre os próximos (folga de 1), o de menor HP
function aiPickTarget(st,e){
  const live=aiLivePcs(st); if(!live.length) return null;
  const sp=(st.tactical&&st.tactical.pos)||{}; const self=sp[e.id];
  live.forEach(t=> t.d = (self&&t.pos)?tacDist(self,t.pos):0);
  const minD=Math.min(...live.map(t=>t.d)); const near=live.filter(t=>t.d<=minD+1);
  near.sort((a,b)=> (a.pc.hp-b.pc.hp) || (a.d-b.d) || (a.idx-b.idx));
  return near[0];
}
function aiMoveDest(st,m,e,prof,target){
  const self=st.tactical.pos[e.id], tp=target.pos; if(!self||!tp) return self;
  const reach=aiReach(st,m,self,prof.speed,prof.fly); let best=self, bs=Infinity;
  const consider=(x,y)=>{ const d=tacDist([x,y],tp); let s = prof.kite ? Math.abs(d-prof.reach)*10 + (d<prof.reach?6:0) : d*10;
    if(tacIsHazard(m,x,y)) s+=4; if(s<bs){ bs=s; best=[x,y]; } };
  consider(self[0],self[1]);
  for(const k of reach.keys()){ const [x,y]=k.split(',').map(Number); consider(x,y); }
  return best;
}
function tacKill(st,id){ if(st.tactical&&st.tactical.pos) delete st.tactical.pos[id]; }   // tira o token morto do tabuleiro
function aiEnemyAttack(st,e,prof,target,ev){
  const melee=(prof.reach||1)<=1;
  const tam=(typeof targetAttackMods==='function')?targetAttackMods(target.pc, melee):{adv:false,dis:false,autoCrit:false};
  const tgtCA=effCA(st, target.pc, target.pc.ca||10);   // Escudo da Fé soma +2 na CA do PC
  const bane=effBanePenalty(st, e.id);                  // Perdição no inimigo: -1d4 no ataque
  for(let k=0;k<(prof.multiattack||1);k++){
    if((target.pc.hp||0)<=0) break;
    const atk=mpD20(null, e.mod||0, { adv:tam.adv, dis:tam.dis });
    if(bane){ const b=mpRollDmgExpr(bane).total; atk.total-=b; }
    let hit=atk.crit||(!atk.fumble&&atk.total>=tgtCA);
    if(hit && tam.autoCrit && !atk.fumble) atk.crit=true;   // alvo paralisado/inconsciente: acerto corpo-a-corpo é crítico
    st.history.push({ role:'roll', label:`${e.name} ataca ${target.pc.name}`, total:atk.total, mod:e.mod||0, dice:atk.dice, crit:atk.crit, fumble:atk.fumble, dc:tgtCA, tipo:'ataque', nat:atk.nat });
    if(hit){ const d=mpRollDmgExpr(e.dmg||'1d6',atk.crit); const res=applyDamage(target.pc, d.total, enemyDmgType(e), st, {crit:atk.crit, srcEnemy:e});
      fxEmit(st, { kind:(prof.reach||1)<=1?'melee':'ranged', dtype:enemyDmgType(e), src:e.id, tgt:target.pc.owner, result:fxResult(true,atk.crit), mult:res.mult, seq:k });
      ev.push({kind:'attack',srcName:e.name,tgtName:target.pc.name,hit:true,crit:atk.crit,dmg:res.applied,down:res.down});
      if(res.down){ break; } }
    else { fxEmit(st, { kind:(prof.reach||1)<=1?'melee':'ranged', dtype:enemyDmgType(e), src:e.id, tgt:target.pc.owner, result:'miss', seq:k });
      ev.push({kind:'attack',srcName:e.name,tgtName:target.pc.name,hit:false}); }
  }
}
function aiApplyTrait(st,e,prof,target,ev){
  if((target.pc.hp||0)<=0) return; const c=target.pc; c.conditions=c.conditions||[];
  if(prof.trait==='paralyze'){
    const fxClaws=(fxProfile(e).traits||{}).paralyzingClaws||{};
    if(fxClaws.elfImmune && /elfo/i.test(c.race||'')){ st.history.push({ role:'scene', text:`✦ ${c.name} (elfo) é imune à paralisia do ${e.name}.` }); return; }
    const sv=mpD20(c, abilityMod(c.abilities.CON)), ok=sv.total>=(prof.saveDC||10);
    st.history.push({ role:'roll', label:`${c.name} · save CON`, total:sv.total, mod:abilityMod(c.abilities.CON), dice:sv.dice, crit:sv.crit, fumble:sv.fumble, dc:prof.saveDC||10, tipo:'save', nat:sv.nat });
    if(!ok && !c.conditions.includes('Paralisado')){ c.conditions.push('Paralisado'); fxEmit(st, { kind:'stun', tgt:c.owner }); }
    ev.push({kind:'trait',tgtName:c.name,cond:'paralisado',saved:ok}); }
  else if(prof.trait==='grapple'){ const mod=Math.max(abilityMod(c.abilities.FOR),abilityMod(c.abilities.DES)), sv=mpD20(c,mod), ok=sv.total>=12;
    st.history.push({ role:'roll', label:`${c.name} · escapar do agarrão`, total:sv.total, mod, dice:sv.dice, crit:sv.crit, fumble:sv.fumble, dc:12, tipo:'save', nat:sv.nat });
    if(!ok && !c.conditions.includes('Agarrado')) c.conditions.push('Agarrado');
    ev.push({kind:'trait',tgtName:c.name,cond:'agarrado',saved:ok}); }
}
function aiDragonBreath(st,m,e,prof,ev){
  const br=prof.breath, t0=aiPickTarget(st,e); if(!t0) return; const center=t0.pos||(st.tactical&&st.tactical.pos[e.id]); const names=[];
  aiLivePcs(st).forEach(t=>{ if(!t.pos||tacDist(t.pos,center)>br.radius) return;
    const sv=mpD20(t.pc, abilityMod(t.pc.abilities.DES)), full=mpRollDmgExpr(br.dmg), dmg=sv.total>=br.dc?Math.floor(full.total/2):full.total;
    st.history.push({ role:'roll', label:`${t.pc.name} · save DES (sopro)`, total:sv.total, mod:abilityMod(t.pc.abilities.DES), dice:sv.dice, crit:sv.crit, fumble:sv.fumble, dc:br.dc, tipo:'save', nat:sv.nat });
    applyDamage(t.pc, dmg, (br.dtype||'fogo'), st, {}); names.push(t.pc.name); });
  fxEmit(st, { kind:'breath', dtype:br.dtype||'fogo', src:e.id, center, radius:br.radius });
  ev.push({kind:'breath',srcName:e.name,tgtName:names.join(', ')||'ninguém'});
}
// ---- DURAÇÃO DAS CONDIÇÕES: no início do turno o combatente tenta se livrar ----
// (save-ends ou escapar do agarrão; Agarrado também acaba se o agarrador sumir/morrer)
const COND_RECOVERY = {
  'Agarrado':   { contest:true, dc:12 },     // escapar (FOR/DES vs 12) ou some sem agarrador adjacente
  'Impedido':   { save:'FOR', dc:12 },
  'Paralisado': { save:'CON', dc:10 },       // ghoul: save CON ao fim do turno (DC 10)
  'Atordoado':  { save:'CON', dc:12 },
  'Amedrontado':{ save:'SAB', dc:11 },
  'Envenenado': { save:'CON', dc:11 },
};
function tacTickConditions(st, c){
  if(!c || !(c.conditions||[]).length) return;
  const m=tacMap(st), pos=(st.tactical&&st.tactical.pos)||{};
  const keep=[];
  for(const cond of c.conditions){
    const rec=COND_RECOVERY[cond];
    if(!rec){ keep.push(cond); continue; }   // condição sem recuperação automática permanece
    if(cond==='Agarrado'){   // acaba sozinho se nenhum inimigo vivo está adjacente
      const me=pos[c.owner];
      const grappler=(st.combat&&st.combat.enemies||[]).some(e=>e.curHp>0 && pos[e.id] && me && tacDist(me,pos[e.id])<=1);
      if(!grappler){ st.history.push({role:'scene',text:`✦ ${c.name} se solta — não há quem o segure.`}); continue; }
    }
    const mod = rec.contest
      ? Math.max(abilityMod(c.abilities.FOR), abilityMod(c.abilities.DES))
      : abilityMod(c.abilities[rec.save]||10) + ((c.saves||[]).includes(rec.save)?(c.prof||0):0);
    const sv=mpD20(c, mod), ok=sv.total>=rec.dc;
    st.history.push({ role:'roll', tipo:'save', dc:rec.dc, total:sv.total, mod, dice:sv.dice, crit:sv.crit, fumble:sv.fumble, nat:sv.nat,
      label:`${c.name} · ${rec.contest?'escapar do agarrão':'save '+rec.save+' ('+cond+')'}` });
    if(ok) st.history.push({role:'scene',text:`✦ ${c.name} livrou-se: ${cond.toLowerCase()} acaba.`});
    else keep.push(cond);
  }
  c.conditions=keep;
  effIncapacitatedCheck(st, c);   // se ficou atordoado/paralisado/inconsciente, perde a concentração
}
function tacTickEnemyConditions(st, e){   // versão leve p/ inimigos (save plano por e.mod)
  if(!(e.conditions||[]).length) return;
  const keep=[];
  for(const cond of e.conditions){ const rec=COND_RECOVERY[cond];
    if(!rec){ keep.push(cond); continue; }
    const sv=mpD20(null, e.mod||0), ok=sv.total>=rec.dc;
    st.history.push({ role:'roll', tipo:'save', dc:rec.dc, total:sv.total, mod:e.mod||0, dice:sv.dice, crit:sv.crit, fumble:sv.fumble, nat:sv.nat,
      label:`${e.name} · ${rec.contest?'escapar':'save ('+cond+')'}` });
    if(!ok) keep.push(cond);
  }
  e.conditions=keep;
}
// tica as condições de quem tem o turno agora, se for um PC vivo
function tacTickCurrentPc(st){
  if(!mpCombatActive(st)) return;
  const cur=mpCurrentActor(st);
  if(cur&&cur.kind==='pc'){ const c=st.characters[cur.idx]; if(c&&c.hp>0){ tacTickConditions(st,c); tickEffectsTurnStart(st,c); } }
}
function aiRunEnemyTurn(st,e,ev){
  tacTickEnemyConditions(st,e);   // tenta encerrar condições temporárias no início do turno
  const econds=e.conditions||[];
  if(econds.some(n=>NO_ACT_CONDS.includes(n))){ ev.push({kind:'idle',srcName:e.name}); return; }   // incapacitado: não age
  const prof=aiProfile(e), m=tacMap(st), self=st.tactical&&st.tactical.pos[e.id];
  const eSpeed=econds.some(n=>MOVE_BLOCK_CONDS.includes(n))?0:prof.speed;   // agarrado/impedido: não anda (mas ataca quem alcança)
  const mProf=eSpeed===prof.speed?prof:Object.assign({},prof,{speed:eSpeed});
  const afraid=(e.conditions||[]).includes('Amedrontado');   // Expulso (Expulsar Mortos-Vivos): recua aterrorizado
  if(afraid || (prof.flee>0 && (e.curHp/e.hp)<prof.flee)){   // moral: recua se muito ferido ou amedrontado
    if(m&&self&&eSpeed>0){ const reach=aiReach(st,m,self,eSpeed,prof.fly), t=aiPickTarget(st,e), tp=t&&t.pos; let best=self,bd=-1;
      if(tp){ for(const k of reach.keys()){ const [x,y]=k.split(',').map(Number), d=tacDist([x,y],tp); if(d>bd){bd=d;best=[x,y];} } }
      if(best[0]!==self[0]||best[1]!==self[1]){ resolveOpportunity(st,e.id,self,best); if(st.tactical.pos[e.id]) st.tactical.pos[e.id]=best; tacReveal(st); } }
    ev.push({kind:'flee',srcName:e.name}); return; }
  if(prof.breath && e.breathReady===false && mpRollDie(6)>=5) e.breathReady=true;   // recarga do sopro
  const target=aiPickTarget(st,e);
  if(!target){ ev.push({kind:'idle',srcName:e.name}); return; }
  if(prof.breath && e.breathReady){ aiDragonBreath(st,m,e,prof,ev); e.breathReady=false; return; }
  if(m&&self&&target.pos&&tacDist(self,target.pos)>prof.reach && eSpeed>0){   // move até o alcance (se puder andar)
    const dest=aiMoveDest(st,m,e,mProf,target);
    if(dest[0]!==self[0]||dest[1]!==self[1]){ const dead=resolveOpportunity(st,e.id,self,dest); if(st.tactical.pos[e.id]) st.tactical.pos[e.id]=dest; tacReveal(st); ev.push({kind:'move',srcName:e.name,tgtName:target.pc.name}); if(dead||e.curHp<=0) return; } }
  const now=(m&&st.tactical&&st.tactical.pos[e.id]) ? tacDist(st.tactical.pos[e.id],target.pos) : prof.reach;
  if(now<=prof.reach){ aiEnemyAttack(st,e,prof,target,ev); if(prof.trait) aiApplyTrait(st,e,prof,target,ev); }
  else ev.push({kind:'idle',srcName:e.name});
}
function narrateRoundTemplate(ev){
  const L=[]; ev.forEach(x=>{
    if(x.kind==='move') L.push(`${x.srcName} avança sobre ${x.tgtName}.`);
    else if(x.kind==='attack'&&x.hit) L.push(x.crit?`${x.srcName} desfere um golpe brutal em ${x.tgtName} (${x.dmg})${x.down?' — ele cai!':'!'}`:`${x.srcName} acerta ${x.tgtName} (${x.dmg})${x.down?', que tomba!':'.'}`);
    else if(x.kind==='attack') L.push(`${x.tgtName} escapa do ataque de ${x.srcName}.`);
    else if(x.kind==='trait') L.push(x.saved?`${x.tgtName} resiste.`:`${x.tgtName} fica ${x.cond}!`);
    else if(x.kind==='breath') L.push(`${x.srcName} libera seu sopro — ${x.tgtName} é atingido!`);
    else if(x.kind==='flee') L.push(`${x.srcName}, ferido, recua.`);
    else if(x.kind==='idle') L.push(`${x.srcName} se aproxima, espreitando.`);
  });
  return L.join(' ');
}
function summarizeRoundForAI(ev){
  const L=ev.map(x=>{
    if(x.kind==='move') return `${x.srcName} avança até ${x.tgtName}`;
    if(x.kind==='attack') return x.hit?`${x.srcName} ACERTA ${x.tgtName} (${x.dmg} de dano${x.crit?', crítico':''}${x.down?'; cai':''})`:`${x.srcName} ERRA ${x.tgtName}`;
    if(x.kind==='trait') return x.saved?`${x.tgtName} resiste ao efeito`:`${x.tgtName} fica ${x.cond}`;
    if(x.kind==='breath') return `${x.srcName} usa o sopro (atinge ${x.tgtName})`;
    if(x.kind==='flee') return `${x.srcName} recua, ferido`;
    return `${x.srcName} espreita`;
  });
  return `[TURNO DOS INIMIGOS — JÁ RESOLVIDO PELO SISTEMA, dano já aplicado]\n- ${L.join('\n- ')}\nNarre em 1-3 frases curtas, em personagem (PT-BR). NÃO peça rolagem, NÃO use marcadores, NÃO altere acertos nem dano.`;
}
async function deliverEnemyNarration(st,ev){
  if(!ev.length) return; let text='';
  if(!TEST_MODE){ try { const reply=await callDm(st, summarizeRoundForAI(ev)); text=(reply||'').replace(/\[[^\]]*\]/g,'').trim(); } catch(e){} }
  if(!text) text=narrateRoundTemplate(ev);   // fallback custo-zero (e padrão no modo teste)
  if(text) st.history.push({ role:'dm', text });
}
// SUBSTITUI mpRunEnemyTurns: inimigos agem 100% por código; 1 narração por bloco
async function mpRunEnemyTurnsAuto(st){
  let guard=0;
  while(mpCombatActive(st) && guard++<12){
    if(mpAllPcsDead(st)){ st.history.push({role:'scene',text:'⚰ O grupo tombou em combate…'}); mpEndCombat(st,false); break; }
    if(mpAllEnemiesDead(st)){ mpEndCombat(st,true); break; }
    const acting=[];
    while(mpCombatActive(st)){ const cur=mpCurrentActor(st); if(!cur) break;
      if(cur.kind==='pc'){ if((st.characters[cur.idx]||{}).hp>0) break; mpAdvanceCombat(st); continue; }
      const e=st.combat.enemies[cur.idx]; if(e.curHp>0) acting.push(e); mpAdvanceCombat(st); }
    if(!acting.length) break;
    const ev=[];
    for(const e of acting){ if(e.curHp<=0) continue;
      aiRunEnemyTurn(st,e,ev); await saveState(st); renderGame(); await mpSleep(450);
      if(mpAllPcsDead(st)) break; }
    await deliverEnemyNarration(st,ev); await saveState(st); renderGame();
    if(mpAllPcsDead(st)){ mpEndCombat(st,false); break; }
  }
  tacTickCurrentPc(st);   // controle volta a um PC → tica as condições dele no começo do turno
  if(mpCombatActive(st)){ await saveState(st); renderGame(); }
}
// ---- ataque do jogador no tabuleiro ----
function pcAttackRange(c){ const w=String(c.weapon||(c.weapons&&c.weapons[0])||'').toLowerCase(); return /arco|besta|funda|dardo|azagaia|estilingue/.test(w)?8:1; }
async function playerAttack(owner,enemyId,st){
  if(!mpCombatActive(st)) return;
  const c=(st.characters||[]).find(x=>x.owner===owner), e=(st.combat.enemies||[]).find(x=>x.id===enemyId);
  if(!c||!e||e.curHp<=0||(c.conditions||[]).some(n=>NO_ACT_CONDS.includes(n))) return;
  const m=tacMap(st), pp=st.tactical&&st.tactical.pos[owner], ep=st.tactical&&st.tactical.pos[e.id];
  if(m&&pp&&ep&&tacDist(pp,ep)>pcAttackRange(c)) return;   // fora de alcance
  const melee = pcAttackRange(c)<=1; const atr = melee?'FOR':'DES';
  const tam = (typeof targetAttackMods==='function') ? targetAttackMods(e, melee) : {adv:false,dis:false,autoCrit:false};
  const adv = tam.adv || effAttackedAdv(st, e.id);   // Fada de Fogo no alvo dá vantagem a quem o ataca
  const bless = effBlessDie(st, owner);              // Bênção no atacante: +1d4
  const card=doMpRoll(c, ['','ataque',atr,'0',e.name], { adv, dis:tam.dis, autoCrit:tam.autoCrit, extraAtkDie:bless }); card.dc=e.ca;
  const hit=card.crit||(!card.fumble&&!card.autoFail&&card.total>=e.ca); card.outcome=hit?'ACERTO':'ERRO';
  if(hit&&card.dmg){
    if(c.raging && melee) card.dmg.total += 2;   // Fúria: +2 de dano corpo-a-corpo
    if(c.cls==='Ladino' && (adv || pcAllyAdjacentToEnemy(st,owner,e))){ const sd=Math.ceil((c.level||1)/2); const sneak=mpRollDmgExpr(sd+'d6').total; card.dmg.total+=sneak; card.dmg.detail=(card.dmg.detail||'')+` + furtivo ${sd}d6(${sneak})`; }
    const mark=effMarkDie(st, owner, e.id); if(mark){ const md=mpRollDmgExpr(mark).total; card.dmg.total+=md; card.dmg.detail=(card.dmg.detail||'')+` + marca ${mark}(${md})`; }   // Marca do Caçador
  }
  st.history.push(card);
  if(hit&&card.dmg){ const res=applyDamage(e, card.dmg.total, card.dmg.type, st, {crit:card.crit}); card.dmg.applied=res.applied; card.dmg.mult=res.mult;
    fxEmit(st, { kind:melee?'melee':'ranged', dtype:card.dmg.type, src:owner, tgt:e.id, result:fxResult(true,card.crit), mult:res.mult }); }
  else fxEmit(st, { kind:melee?'melee':'ranged', dtype:(c.weapon||''), src:owner, tgt:e.id, result:'miss' });
  if(mpAllEnemiesDead(st)) mpEndCombat(st,true);
  await saveState(st); renderGame();
}
// avança a partir do turno do PC (após atacar ou encerrar) e dispara os inimigos
async function tacAdvanceFromPc(st){
  if(!mpCombatActive(st)){ await saveState(st); renderGame(); return; }
  const cur0=mpCurrentActor(st), curOwner=(cur0&&cur0.kind==='pc')?(st.characters[cur0.idx]||{}).owner:null;
  if(st.combat._surge && st.combat._surge===curOwner){ delete st.combat._surge; await saveState(st); renderGame(); return; }   // Surto de Ação: ação extra, não passa a vez
  advanceTurn(st);
  const cur=mpCurrentActor(st);
  if(cur&&cur.kind==='pc') tacTickCurrentPc(st);   // próximo é PC → tica as condições dele agora
  await saveState(st); renderGame();
  await tacKickEnemiesIfNeeded(st);   // se for inimigo, ele age (e o tick do PC vem no fim do bloco)
}
// se a vez atual é de inimigo, conduz os inimigos por código até cair num PC vivo
async function tacKickEnemiesIfNeeded(st){
  if(!mpCombatActive(st)) return;
  const cur=mpCurrentActor(st);
  if(cur&&cur.kind==='enemy'){ st.busy=true; await saveState(st); renderGame(); await mpRunEnemyTurnsAuto(st); st.busy=false; await saveState(st); renderGame(); }
}
async function tacRequestAttack(enemyId){
  const st=ROOM.state||{}; const owner=tacActiveOwner(st);
  if(!owner||owner!==ME.id||!tacMyTurn(st)) return;
  if(amIAdmin()){ if(engineBusy) return; engineBusy=true; try{ await playerAttack(owner,enemyId,st); await tacAdvanceFromPc(st); } finally { engineBusy=false; } }
  else { try{ await supa.from('room_actions').insert({ room_id:ROOM.id, user_id:ME.id, display_name:'(atk)', text: ATTACK_PREFIX+JSON.stringify({owner,enemyId}) }); }catch(e){} }
}
async function tacEndTurn(){
  const st=ROOM.state||{}; const owner=tacActiveOwner(st);
  if(!owner||owner!==ME.id||!tacMyTurn(st)) return;
  if(amIAdmin()){ if(engineBusy) return; engineBusy=true; try{ await tacAdvanceFromPc(st); } finally { engineBusy=false; } }
  else { try{ await supa.from('room_actions').insert({ room_id:ROOM.id, user_id:ME.id, display_name:'(fim)', text: ENDTURN_PREFIX }); }catch(e){} }
}

// ============================================================
//  HABILIDADES / MAGIAS NO TABULEIRO — o código resolve os dados (atk vs CA,
//  save vs CD, dano, cura), igual aos ataques. Conjuração consome slot.
// ============================================================
const ABILITY_PREFIX = '@@ABIL@@', FEATURE_PREFIX = '@@FEAT@@';
// mecânica das magias/habilidades de combate (subconjunto usado na campanha);
// as não listadas viram 'utility' (narra o uso e gasta slot, sem dados).
const SPELL_FX = {
  // truques (nível 0, sem slot)
  'Rajada de Fogo':      { lvl:0, kind:'attack', range:8, dmg:'1d10', dtype:'fogo' },
  'Raio de Gelo':        { lvl:0, kind:'attack', range:8, dmg:'1d8',  dtype:'frio' },
  'Toque Gélido':        { lvl:0, kind:'attack', range:1, dmg:'1d8',  dtype:'necrótico' },
  'Estalo Sobrenatural': { lvl:0, kind:'attack', range:8, dmg:'1d10', dtype:'força' },
  'Produzir Chama':      { lvl:0, kind:'attack', range:6, dmg:'1d8',  dtype:'fogo' },
  'Chama Sagrada':       { lvl:0, kind:'save',   range:8, save:'DES', dmg:'1d8', dtype:'radiante' },
  'Zombaria Cruel':      { lvl:0, kind:'save',   range:6, save:'SAB', dmg:'1d4', dtype:'psíquico' },
  // magias de nível 1 (gastam slot)
  'Mísseis Mágicos':     { lvl:1, kind:'auto',   range:8, dmg:'3d4+3', dtype:'força' },
  'Mãos Flamejantes':    { lvl:1, kind:'save',   range:2, save:'DES', dmg:'3d6', dtype:'fogo', half:true },
  'Repreensão Infernal': { lvl:1, kind:'save',   range:8, save:'DES', dmg:'2d10', dtype:'fogo', half:true },
  'Curar Ferimentos':    { lvl:1, kind:'heal',   range:1, dmg:'1d8', addMod:true },
  'Palavra Curativa':    { lvl:1, kind:'heal',   range:8, dmg:'1d4', addMod:true },
  // efeitos contínuos / concentração (buffs e debuffs)
  'Bênção':              { lvl:1, kind:'effect', effect:'Bênção',            range:6,  aim:'ally' },
  'Perdição':            { lvl:1, kind:'effect', effect:'Perdição',          range:6,  aim:'enemy' },
  'Marca do Caçador':    { lvl:1, kind:'effect', effect:'Marca do Caçador',  range:18, aim:'enemy' },
  'Escudo da Fé':        { lvl:1, kind:'effect', effect:'Escudo da Fé',      range:12, aim:'ally' },
  'Heroísmo':            { lvl:1, kind:'effect', effect:'Heroísmo',          range:1,  aim:'ally' },
  'Fada de Fogo':        { lvl:1, kind:'effect', effect:'Fada de Fogo',      range:12, aim:'enemy' },
  'Enfeitiçar Pessoa':   { lvl:1, kind:'effect', effect:'Enfeitiçar Pessoa', range:6,  aim:'enemy' },
  'Santuário':           { lvl:1, kind:'effect', effect:'Santuário',         range:6,  aim:'ally' },
};
function spellCastMod(c){ return abilityMod((c.abilities||{})[c.spellAbility||'INT']||10); }
function spellAtkBonus(c){ return (c.prof||2)+spellCastMod(c); }
function spellSaveDC(c){ return c.spellDC || (8+(c.prof||2)+spellCastMod(c)); }
function abilityFx(name){ return SPELL_FX[name] || { lvl:(name?1:0), kind:'utility' }; }
// habilidades de classe (não-magia) usáveis no tabuleiro. side: self|ally|enemy|aoe|null
function ragesByLevel(L){ return (L||1)>=3 ? 3 : 2; }
const FEATURE_FX = {
  'Retomar Fôlego':        { cls:'Guerreiro', trigger:'bonus', side:'self', kind:'selfHeal', cost:{res:'secondwind',max:()=>1}, heal:'1d10', addLevel:true, desc:'Ação bônus: recupera 1d10 + nível de HP (1×/descanso).' },
  'Surto de Ação':         { cls:'Guerreiro', minLevel:2, trigger:'extra', side:null, kind:'extraAction', cost:{res:'actionsurge',max:()=>1}, desc:'Ganha uma ação extra neste turno (1×/descanso).' },
  'Fúria':                 { cls:'Bárbaro', trigger:'bonus', side:null, kind:'rageOn', cost:{res:'rage',max:(c)=>ragesByLevel(c.level)}, desc:'Ação bônus: +2 de dano corpo-a-corpo e resistência a dano físico (cortante/perfurante/concussão).' },
  'Imposição das Mãos':    { cls:'Paladino', trigger:'action', side:'ally', kind:'healPool', cost:{res:'layon',max:(c)=>(c.level||1)*5}, pool:true, healAmount:5, desc:'Ação (toque): cura 5 HP de uma reserva de nível×5.' },
  'Inspiração de Bardo':   { cls:'Bardo', trigger:'bonus', side:'ally', kind:'inspire', cost:{res:'bardic',max:(c)=>Math.max(1,abilityMod((c.abilities||{}).CAR))}, die:'1d6', desc:'Ação bônus: dá um dado de Inspiração (1d6) à próxima rolagem de um aliado.' },
  'Expulsar Mortos-Vivos': { cls:'Clérigo', minLevel:2, trigger:'action', side:'aoe', kind:'turnUndead', cost:{res:'channel',max:()=>1}, save:'SAB', radius:6, desc:'Canalizar Divindade: mortos-vivos a 9m fazem save de SAB ou ficam Amedrontados e recuam (1×/descanso).' },
};
function featureFx(name, cls){ const f=FEATURE_FX[name]; return (f && (!f.cls || f.cls===cls)) ? f : null; }
function featureUsesLeft(c, fx){ if(!fx||!fx.cost) return Infinity; if(fx.cost.slot) return c.spellSlots?(c.spellSlots.max-(c.spellSlots.used||0)):0; const max=typeof fx.cost.max==='function'?fx.cost.max(c):(fx.cost.max||1); return max-((c.resUsed||{})[fx.cost.res]||0); }
function castableFeatures(c){
  if(!c) return [];
  return Object.keys(FEATURE_FX).filter(name=>{ const fx=FEATURE_FX[name]; return fx.cls===c.cls && (fx.minLevel||1)<=(c.level||1) && (fx.trigger==='bonus'||fx.trigger==='action'||fx.trigger==='extra'); })
    .map(name=>{ const fx=FEATURE_FX[name]; const left=featureUsesLeft(c,fx); const need=fx.pool?fx.healAmount:1; return { name, lvl:'H', fx, feat:true, disabled:left<need, uses:left }; });
}
function pcAllyAdjacentToEnemy(st, owner, e){ const pos=(st.tactical&&st.tactical.pos)||{}, ep=pos[e.id]; if(!ep) return false;
  return (st.characters||[]).some(a=>a.owner!==owner && (a.hp||0)>0 && pos[a.owner] && tacDist(pos[a.owner],ep)<=1); }
function abilityNeedsTarget(fx){ if(fx.side) return fx.side==='ally'||fx.side==='enemy'; if(fx.kind==='effect') return true; return fx.kind==='attack'||fx.kind==='save'||fx.kind==='auto'||fx.kind==='heal'; }
function abilityTargetSide(fx){ if(fx.side) return fx.side; if(fx.kind==='effect') return fx.aim||'ally'; return fx.kind==='heal' ? 'ally' : 'enemy'; }
// lista de magias/habilidades conjuráveis do PC (truques sempre; nv1 se há slot)
function castableAbilities(c){
  if(!c) return [];
  const out=[]; const slotsLeft = c.spellSlots ? (c.spellSlots.max-(c.spellSlots.used||0)) : 0;
  (c.cantripsChosen||[]).forEach(n=>{ const fx=abilityFx(n); out.push({ name:n, lvl:0, fx, disabled:false }); });
  (c.spellsChosen||[]).forEach(n=>{ const fx=abilityFx(n); const lvl=fx.lvl||1; out.push({ name:n, lvl, fx, disabled: lvl>=1 && slotsLeft<=0 }); });
  out.push(...castableFeatures(c));   // habilidades de classe (Surto, Fúria, Imposição, Expulsar…)
  return out;
}
function pcHasAbilities(c){ return castableAbilities(c).length>0; }
// resolve uma habilidade pelo CÓDIGO (rola os dados); targetId = inimigo ou aliado (cura)
async function castAbility(owner, name, targetId, st){
  if(!mpCombatActive(st)) return;
  const c=(st.characters||[]).find(x=>x.owner===owner); if(!c) return;
  if((c.conditions||[]).some(n=>NO_ACT_CONDS.includes(n))) return;
  const meta=castableAbilities(c).find(a=>a.name===name); if(!meta||meta.disabled) return;
  const fx=meta.fx;
  // checa alcance
  const pos=(st.tactical&&st.tactical.pos)||{}; const myPos=pos[owner];
  const tgtPos = targetId ? pos[targetId] : null;
  if(abilityNeedsTarget(fx) && fx.range && myPos && tgtPos && tacDist(myPos,tgtPos)>fx.range) return;
  if((fx.lvl||0)>=1){ if(!c.spellSlots||(c.spellSlots.used||0)>=c.spellSlots.max) return; c.spellSlots.used=(c.spellSlots.used||0)+1; }   // gasta slot
  const dc=spellSaveDC(c), atk=spellAtkBonus(c), cmod=spellCastMod(c);
  if(fx.kind==='attack'){
    const e=(st.combat.enemies||[]).find(x=>x.id===targetId); if(!e||e.curHp<=0){ await saveState(st); renderGame(); return; }
    const tam=(typeof targetAttackMods==='function')?targetAttackMods(e, (fx.range||1)<=1):{adv:false,dis:false,autoCrit:false};
    const roll=mpD20(c, atk, { adv:tam.adv, dis:tam.dis }); if(roll.crit===false && tam.autoCrit && !roll.fumble) roll.crit=true;
    const hit=roll.crit||(!roll.fumble&&roll.total>=e.ca);
    const card={ role:'roll', tipo:'magia', label:`${c.name} · ${name} → ${e.name}`, total:roll.total, mod:atk, dice:roll.dice, crit:roll.crit, fumble:roll.fumble, dc:e.ca, nat:roll.nat, outcome:hit?'ACERTO':'ERRO' };
    if(hit){ const d=mpRollDmgExpr(fx.dmg, roll.crit); const res=applyDamage(e, d.total, fx.dtype, st, {crit:roll.crit}); card.dmg={ total:res.applied, type:fx.dtype, detail:d.detail, mult:res.mult }; }
    fxEmit(st, { kind:(fx.range||1)<=1?'melee':'ranged', dtype:fx.dtype, src:owner, tgt:targetId, result:fxResult(hit,roll.crit), mult:(card.dmg&&card.dmg.mult) });
    st.history.push(card);
  } else if(fx.kind==='save'){
    const e=(st.combat.enemies||[]).find(x=>x.id===targetId); if(!e||e.curHp<=0){ await saveState(st); renderGame(); return; }
    const sv=mpD20(null, e.mod||0); const saved=sv.total>=dc;   // inimigo: save plano por e.mod (aprox.)
    const full=mpRollDmgExpr(fx.dmg); const raw=saved?(fx.half?Math.floor(full.total/2):0):full.total;
    const res=applyDamage(e, raw, fx.dtype, st, {});
    const center=(st.tactical&&st.tactical.pos[targetId]);
    if((fx.range||1)<=2) fxEmit(st, { kind:'area', cone:true, dtype:fx.dtype, src:owner, center, radius:1, mult:res.mult });   // cone (Mãos Flamejantes)
    else fxEmit(st, { kind:'ranged', dtype:fx.dtype, src:owner, tgt:targetId, result:'hit', mult:res.mult });               // raio (Chama Sagrada, Repreensão…)
    st.history.push({ role:'roll', tipo:'save', label:`${c.name} · ${name} (${e.name} save ${fx.save})`, total:sv.total, mod:e.mod||0, dice:sv.dice, crit:sv.crit, fumble:sv.fumble, dc, nat:sv.nat, outcome:saved?'RESISTIU':'FALHOU', dmg: res.applied>0?{ total:res.applied, type:fx.dtype, detail:fx.dmg, mult:res.mult }:null });
  } else if(fx.kind==='auto'){
    const e=(st.combat.enemies||[]).find(x=>x.id===targetId); if(!e||e.curHp<=0){ await saveState(st); renderGame(); return; }
    const d=mpRollDmgExpr(fx.dmg); const res=applyDamage(e, d.total, fx.dtype, st, {});
    fxEmit(st, { kind:'ranged', dtype:fx.dtype, src:owner, tgt:targetId, result:'hit', mult:res.mult });
    st.history.push({ role:'roll', noRoll:true, tipo:'magia', label:`${c.name} · ${name} → ${e.name}`, total:res.applied, outcome:'ACERTO AUTOMÁTICO', dmg:{ total:res.applied, type:fx.dtype, detail:d.detail, mult:res.mult } });
  } else if(fx.kind==='heal'){
    const ally=(st.characters||[]).find(x=>x.owner===targetId) || c;
    const h=mpRollDmgExpr(fx.dmg).total + (fx.addMod?cmod:0); ally.hp=Math.min(ally.maxHp, ally.hp+Math.max(1,h));
    fxEmit(st, { kind:'heal', tgt:(ally.owner!=null?ally.owner:owner) });
    st.history.push({ role:'roll', noRoll:true, tipo:'cura', label:`${c.name} · ${name} → ${ally.name}`, total:h, outcome:`+${h} HP`, heal:h });
  } else if(fx.kind==='effect'){
    const efx=EFFECT_FX[fx.effect]||{}; const aim=fx.aim||'ally';
    if(aim==='enemy'){
      const e=(st.combat.enemies||[]).find(x=>x.id===targetId); if(!e||e.curHp<=0){ await saveState(st); renderGame(); return; }
      if(efx.cond && enemyCondImmune(e, efx.cond)){ st.history.push({ role:'scene', text:`✦ ${e.name} é imune a ${efx.cond}.` }); }
      else if(efx.save){   // debuff em inimigo permite save
        const smod=(efx.mind&&fxProfile(e).mind!==undefined)?fxProfile(e).mind:(e.mod||0);
        const sv=mpD20(null, smod), saved=sv.total>=dc;
        st.history.push({ role:'roll', tipo:'save', label:`${e.name} · save ${efx.save} (${name})`, total:sv.total, mod:smod, dice:sv.dice, crit:sv.crit, fumble:sv.fumble, dc, nat:sv.nat, outcome:saved?'RESISTIU':'AFETADO' });
        if(!saved){ applyEffect(st, owner, fx.effect, targetId); if(efx.cond){ e.conditions=e.conditions||[]; if(!e.conditions.includes(efx.cond)) e.conditions.push(efx.cond); } fxEmit(st,{kind:'stun',tgt:e.id}); }
      } else { applyEffect(st, owner, fx.effect, targetId); fxEmit(st,{kind:'stun',tgt:e.id}); }
    } else {
      const ally=(st.characters||[]).find(x=>x.owner===targetId)||c;
      applyEffect(st, owner, fx.effect, ally.owner); if(efx.tempHpTurn) ally.tempHp=Math.max(ally.tempHp||0, efx.tempHpTurn);
      fxEmit(st,{kind:'heal',tgt:ally.owner});
    }
    st.history.push({ role:'scene', text:`✦ ${c.name} conjura ${name}.` });
  } else {
    st.history.push({ role:'scene', text:`✦ ${c.name} usa ${name}.` });
  }
  if(mpAllEnemiesDead(st)) mpEndCombat(st,true);
  await saveState(st); renderGame();
}
// resolve uma HABILIDADE DE CLASSE pelo código (separado de castAbility)
async function castFeature(owner, name, targetId, st){
  if(!mpCombatActive(st)) return;
  const c=(st.characters||[]).find(x=>x.owner===owner); if(!c) return;
  if((c.conditions||[]).some(n=>NO_ACT_CONDS.includes(n))) return;
  const fx=featureFx(name, c.cls); if(!fx) return;
  const left=featureUsesLeft(c,fx), need=fx.pool?fx.healAmount:1; if(left<need) return;
  if(fx.cost){ if(fx.cost.slot){ if(c.spellSlots) c.spellSlots.used=(c.spellSlots.used||0)+1; }
    else { c.resUsed=c.resUsed||{}; c.resUsed[fx.cost.res]=(c.resUsed[fx.cost.res]||0)+(fx.pool?fx.healAmount:1); } }
  if(fx.kind==='selfHeal'){ const h=mpRollDmgExpr(fx.heal).total+(fx.addLevel?(c.level||1):0); c.hp=Math.min(c.maxHp,c.hp+h);
    st.history.push({role:'roll',noRoll:true,tipo:'cura',label:`${c.name} · ${name}`,total:h,outcome:`+${h} HP`,heal:h}); fxEmit(st,{kind:'heal',tgt:owner}); }
  else if(fx.kind==='healPool'){ const ally=(st.characters||[]).find(x=>x.owner===targetId)||c; ally.hp=Math.min(ally.maxHp,ally.hp+fx.healAmount);
    st.history.push({role:'roll',noRoll:true,tipo:'cura',label:`${c.name} · ${name} → ${ally.name}`,total:fx.healAmount,outcome:`+${fx.healAmount} HP`,heal:fx.healAmount}); fxEmit(st,{kind:'heal',tgt:(ally.owner!=null?ally.owner:owner)}); }
  else if(fx.kind==='inspire'){ const ally=(st.characters||[]).find(x=>x.owner===targetId); if(ally){ ally.inspiration={die:fx.die||'1d6'};
    st.history.push({role:'scene',text:`✦ ${c.name} inspira ${ally.name} — próxima rolagem soma ${fx.die||'1d6'}.`}); fxEmit(st,{kind:'heal',tgt:ally.owner}); } }
  else if(fx.kind==='rageOn'){ c.raging=true; st.history.push({role:'scene',text:`✦ ${c.name} entra em FÚRIA! +2 de dano corpo-a-corpo e resistência a dano físico.`}); }
  else if(fx.kind==='extraAction'){ if(st.combat) st.combat._surge=owner; st.history.push({role:'scene',text:`✦ ${c.name} usa Surto de Ação — ação extra neste turno!`}); }
  else if(fx.kind==='turnUndead'){
    const pos=(st.tactical&&st.tactical.pos)||{}, me=pos[owner], dc=spellSaveDC(c); let n=0;
    (st.combat.enemies||[]).forEach(e=>{ if(e.curHp<=0||enemyType(e)!=='morto-vivo') return; const ep=pos[e.id]; if(me&&ep&&tacDist(me,ep)>(fx.radius||6)) return;
      if(enemyCondImmune(e,'Amedrontado')) return;
      const smod=(fxProfile(e).mind!==undefined)?fxProfile(e).mind:(e.mod||0);
      const sv=mpD20(null,smod), ok=sv.total>=dc;
      st.history.push({role:'roll',tipo:'save',label:`${e.name} · save SAB (Expulsar)`,total:sv.total,mod:smod,dice:sv.dice,crit:sv.crit,fumble:sv.fumble,dc,nat:sv.nat,outcome:ok?'RESISTIU':'EXPULSO'});
      if(!ok){ e.conditions=e.conditions||[]; if(!e.conditions.includes('Amedrontado')){ e.conditions.push('Amedrontado'); n++; } fxEmit(st,{kind:'stun',tgt:e.id}); } });
    st.history.push({role:'scene',text:`✦ ${c.name} ergue o símbolo sagrado — ${n} morto(s)-vivo(s) recua(m) em pavor!`});
  }
  if(mpAllEnemiesDead(st)) mpEndCombat(st,true);
  await saveState(st); renderGame();
}

// ============================================================
//  P2 — EFEITOS CONTÍNUOS + CONCENTRAÇÃO (buffs/debuffs).
//  st.activeEffects: [{name,fx,caster,target,isEnemy}]. Concentração: 1 por
//  conjurador, quebra ao tomar dano (save CON DC max(10,½ dano)) ou incapacitar.
//  Efeitos duram a luta (ou até quebrar a concentração) — sem expiry por rodada.
// ============================================================
const EFFECT_FX = {
  'Bênção':            { side:'ally',  conc:true,  atkDie:'1d4', saveDie:'1d4' },
  'Perdição':          { side:'enemy', conc:true,  atkPenalty:'1d4', save:'CAR', mind:true },
  'Marca do Caçador':  { side:'enemy', conc:true,  dmgDie:'1d6' },
  'Escudo da Fé':      { side:'ally',  conc:true,  caBonus:2 },
  'Heroísmo':          { side:'ally',  conc:true,  tempHpTurn:5, fearImmune:true },
  'Fada de Fogo':      { side:'enemy', conc:true,  attackedAdv:true, save:'DES' },
  'Enfeitiçar Pessoa': { side:'enemy', conc:false, cond:'Enfeitiçado', save:'SAB', mind:true },
  'Santuário':         { side:'ally',  conc:false, sanctuary:true },
};
function effList(st){ return (st && st.activeEffects) || []; }
function effectsOn(st, id){ return effList(st).filter(e=>e.target===id); }
function casterEffects(st, casterId){ return effList(st).filter(e=>e.caster===casterId); }
function breakConcentration(st, casterId){
  if(!st.activeEffects) return; const had=st.activeEffects.filter(e=>e.caster===casterId && e.fx.conc);
  if(!had.length) return;
  st.activeEffects = st.activeEffects.filter(e=>!(e.caster===casterId && e.fx.conc));
  const c=(st.characters||[]).find(x=>x.owner===casterId); if(c) c.concentrating=null;
  had.forEach(e=> st.history.push({ role:'scene', text:`✦ ${(c&&c.name)||'O conjurador'} perde a concentração em ${e.name}.` }));
}
function applyEffect(st, casterOwner, effectName, targetId){
  st.activeEffects = st.activeEffects || [];
  const fx=EFFECT_FX[effectName]; if(!fx) return;
  const c=(st.characters||[]).find(x=>x.owner===casterOwner);
  if(fx.conc && c){ breakConcentration(st, casterOwner); c.concentrating=effectName; }   // só uma concentração por vez
  const isEnemy = (fx.side==='enemy');
  st.activeEffects.push({ name:effectName, fx, caster:casterOwner, target:targetId, isEnemy });
}
function concentrationCheckOnDamage(st, pc, dmg){
  if(!pc || !pc.concentrating) return; const dc=Math.max(10, Math.floor(dmg/2));
  const sv=mpD20(pc, abilityMod((pc.abilities||{}).CON) + ((pc.saves||[]).includes('CON')?(pc.prof||0):0));
  st.history.push({ role:'roll', tipo:'save', label:`${pc.name} · concentração (save CON)`, total:sv.total, mod:abilityMod((pc.abilities||{}).CON), dice:sv.dice, crit:sv.crit, fumble:sv.fumble, dc, nat:sv.nat, outcome: sv.total>=dc?'MANTÉM':'PERDE' });
  if(sv.total<dc) breakConcentration(st, pc.owner);
}
// quebra concentração de quem ficou incapacitado (chamado no tick de condições)
function effIncapacitatedCheck(st, pc){ if(pc && pc.concentrating && (pc.conditions||[]).some(n=>NO_ACT_CONDS.includes(n))) breakConcentration(st, pc.owner); }
// ---- leitura no pipeline de ataque ----
function effHas(st, id, key){ return effectsOn(st,id).some(e=>e.fx[key]); }
function effBlessDie(st, attackerId){ const e=effectsOn(st,attackerId).find(x=>x.fx.atkDie); return e?e.fx.atkDie:null; }   // Bênção no atacante
function effBanePenalty(st, attackerId){ const e=effectsOn(st,attackerId).find(x=>x.fx.atkPenalty); return e?e.fx.atkPenalty:null; }   // Perdição no atacante
function effMarkDie(st, attackerId, defenderId){ const e=effList(st).find(x=>x.caster===attackerId && x.target===defenderId && x.fx.dmgDie); return e?e.fx.dmgDie:null; }   // Marca do Caçador
function effCA(st, c, baseCA){ let ca=baseCA; effectsOn(st, c.owner!=null?c.owner:c.id).forEach(e=>{ if(e.fx.caBonus) ca+=e.fx.caBonus; }); return ca; }   // Escudo da Fé
function effAttackedAdv(st, defenderId){ return effHas(st, defenderId, 'attackedAdv'); }   // Fada de Fogo
function tickEffectsTurnStart(st, pc){   // Heroísmo: HP temporário a cada turno
  effectsOn(st, pc.owner).forEach(e=>{ if(e.fx.tempHpTurn){ pc.tempHp = Math.max(pc.tempHp||0, e.fx.tempHpTurn); } });
}
// estado de mira de habilidade (local do cliente que está agindo)
let PENDING_ABILITY = null, ABILITY_MENU_OPEN = false;
function tacAbilityMenuHtml(c){
  const list=castableAbilities(c); if(!list.length) return '';
  const items=list.map(a=>{
    let cost, desc;
    if(a.feat){ const u=a.fx.pool?Math.floor((a.uses||0)/(a.fx.healAmount||1)):a.uses; cost=`<span class="tac-ab-cost feat">${u===Infinity?'habilidade':u+'×'}</span>`; desc=a.fx.desc||''; }
    else { cost = a.lvl>=1 ? `<span class="tac-ab-cost">nv${a.lvl}</span>` : `<span class="tac-ab-cost cantrip">truque</span>`; desc=(((typeof RULES!=='undefined'&&RULES.spells[a.name])||{}).desc)||''; }
    return `<div class="tac-ab-item ${a.disabled?'dis':''}" data-ab="${escapeHtml(a.name)}" data-feat="${a.feat?1:0}" data-dis="${a.disabled?1:0}" tabindex="0" role="button"><div class="tac-ab-h"><b>${escapeHtml(a.name)}</b>${cost}</div><div class="tac-ab-d">${escapeHtml(desc)}</div></div>`;
  }).join('');
  const slots = c.spellSlots ? `<div class="tac-ab-slots">Slots nv1: ${c.spellSlots.max-(c.spellSlots.used||0)}/${c.spellSlots.max} · sem alvo? toque novamente</div>` : '';
  return `<div class="tac-ability-menu">${slots||'<div class="tac-ab-slots">truques ilimitados</div>'}${items}</div>`;
}
function tacPickAbility(name){
  const st=ROOM.state||{}; const owner=tacActiveOwner(st);
  if(!owner||owner!==ME.id||!tacMyTurn(st)) return;
  const c=(st.characters||[]).find(x=>x.owner===owner); const meta=castableAbilities(c).find(a=>a.name===name);
  if(!meta||meta.disabled) return;
  if(abilityNeedsTarget(meta.fx)){ PENDING_ABILITY={ name, fx:meta.fx, feat:!!meta.feat }; renderTactical(st); }   // entra em modo de mira
  else { tacCancelAbility(); tacDoCast(owner, name, owner, !!meta.feat); }   // sem alvo (auto-aplica em si/área)
}
function tacCancelAbility(){ PENDING_ABILITY=null; const st=ROOM.state||{}; renderTactical(st); }
function tacCastOnTarget(targetId){
  const st=ROOM.state||{}; const owner=tacActiveOwner(st); const ab=PENDING_ABILITY;
  if(!ab||!owner||owner!==ME.id||!tacMyTurn(st)) return;
  PENDING_ABILITY=null; tacDoCast(owner, ab.name, targetId, ab.feat);
}
async function tacDoCast(owner, name, targetId, feat){
  const st=ROOM.state||{};
  if(amIAdmin()){ if(engineBusy) return; engineBusy=true; try{ if(feat) await castFeature(owner,name,targetId,st); else await castAbility(owner,name,targetId,st); await tacAdvanceFromPc(st); } finally { engineBusy=false; } }
  else { try{ await supa.from('room_actions').insert({ room_id:ROOM.id, user_id:ME.id, display_name:feat?'(habilidade)':'(magia)', text: (feat?FEATURE_PREFIX:ABILITY_PREFIX)+JSON.stringify({owner,name,targetId}) }); }catch(e){} }
}

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

// ---------------- ROTEIRO DA CAMPANHA — Tela do Mestre (só Mestre-puro) ----------------
function guideActOf(sceneId){
  const acts = (typeof CAMPAIGN!=='undefined' && CAMPAIGN.guide && CAMPAIGN.guide.acts) || [];
  return acts.find(a => (a.scenes||[]).includes(sceneId)) || null;
}
function openGuide(){
  const g = (typeof CAMPAIGN!=='undefined' && CAMPAIGN.guide) || null;
  if (!g){ toast('Roteiro indisponível.'); return; }
  const st = ROOM.state || {};
  const curAct = guideActOf(st.sceneId);
  const actsHtml = (g.acts||[]).map(a => {
    const open = !!(curAct && a.n === curAct.n);
    // NPCs agregados das cenas do ato
    const npcs = {};
    (a.scenes||[]).forEach(sid => { const sc = CAMPAIGN.scenes[sid]; if (sc && sc.npcs) Object.assign(npcs, sc.npcs); });
    const npcHtml = Object.keys(npcs).length
      ? `<div class="g-block"><h5>NPCs</h5>${Object.entries(npcs).map(([n,d])=>`<div class="g-npc"><b>${escapeHtml(n)}</b> — ${escapeHtml(d)}</div>`).join('')}</div>` : '';
    // monstros: encontros das cenas do ato
    const encIds = [...new Set((a.scenes||[]).map(sid => (CAMPAIGN.scenes[sid]||{}).combat).filter(Boolean))];
    const monHtml = encIds.length ? `<div class="g-block"><h5>Monstros</h5>${encIds.map(eid=>{
      const e = CAMPAIGN.encounters[eid]; if (!e) return '';
      const foes = (e.enemies||[]).map(en=>`<div class="g-foe"><b>${escapeHtml(en.name)}</b> — HP ${en.hp} · CA ${en.ca} · ataque ${fmtMod(en.mod)} · dano ${escapeHtml(en.dmg||'—')}${en.traits?`<div class="g-trait">${escapeHtml(en.traits)}</div>`:''}</div>`).join('');
      const artNames = [...new Set((e.enemies||[]).map(x=>x.name))].map(monsterArt).filter(Boolean);
      const artRow = artNames.length ? `<div class="g-enc-arts">${artNames.map(a=>`<img src="${a}" alt="">`).join('')}</div>` : '';
      return `<div class="g-enc">${artRow}<div class="g-enc-name">⚔️ ${escapeHtml(e.name)}</div>${foes}${e.tactics?`<div class="g-tactic">Tática: ${escapeHtml(e.tactics)}</div>`:''}</div>`;
    }).join('')}</div>` : '';
    // itens & tesouro
    const itemHtml = (a.items||[]).length ? `<div class="g-block"><h5>Itens & Tesouro</h5>${(a.items||[]).map(iid=>{
      const it = g.items[iid]; if (!it) return '';
      return `<div class="g-item"><b>${escapeHtml(it.name)}</b><span class="g-rar">${escapeHtml(it.rarity)}${it.type?` · ${escapeHtml(it.type)}`:''}</span><div>${escapeHtml(it.effect)}</div></div>`;
    }).join('')}</div>` : '';
    const kp = (a.keyPoints||[]).map(p=>`<li>${escapeHtml(p)}</li>`).join('');
    const sec = (a.secrets||[]).map(p=>`<li>${escapeHtml(p)}</li>`).join('');
    return `<div class="g-act ${open?'open':''}">
      <div class="g-act-head" data-acthead="${a.n}"><span>${escapeHtml(a.chapter||('Ato '+a.n))} — ${escapeHtml(a.title)}</span>${open?'<span class="g-cur">cena atual</span>':''}<span class="g-caret">▾</span></div>
      <div class="g-act-body">
        <p class="g-sum">${escapeHtml(a.summary||'')}</p>
        ${kp?`<div class="g-block"><h5>Pontos-chave</h5><ul>${kp}</ul></div>`:''}
        ${npcHtml}${monHtml}${itemHtml}
        ${sec?`<div class="g-block secret"><h5>🔒 Segredos do Mestre</h5><ul>${sec}</ul></div>`:''}
      </div>
    </div>`;
  }).join('');
  $('#guideCard').innerHTML = `
    <div class="map-head"><div><h3>📖 Roteiro da Campanha</h3><span class="map-sub">Guia do Mestre — só você vê; não vai para a IA.</span></div>
      <button class="rp-close" id="guideCloseBtn" title="Fechar">✕</button></div>
    <div class="g-body">${actsHtml}</div>`;
  $('#guideModal').classList.remove('hide');
  $('#guideModal').onclick = e => { if (e.target.id === 'guideModal') closeGuide(); };
  $('#guideCloseBtn').onclick = closeGuide;
  $$('#guideCard [data-acthead]').forEach(h => h.onclick = () => h.parentElement.classList.toggle('open'));
}
function closeGuide(){ $('#guideModal').classList.add('hide'); }

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
// Mestre-puro (admin NÃO joga) → modo "Mestre no Comando": a IA sugere, o humano aprova/edita antes de enviar
function isCommandMode(){ return amIAdmin() && !!ROOM && !ROOM.admin_plays; }

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
  supa.rpc('is_app_admin').then(({data})=>{ if (data){ $('#hubAdmin').style.display='inline'; const tb = $('#hubTest'); if (tb){ tb.style.display='inline-block'; tb.onclick = () => { location.href = location.pathname + '?teste=1'; }; } } });
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
  const avatar = s.portrait ? `<div class="ros-avatar" style="background-image:url('${s.portrait}')"></div>` : '';
  return `<div class="ros-card">
    <div class="ros-top">
      <div class="ros-id">${avatar}<div><div class="ros-name">${escapeHtml(s.name||r.name||'Herói')}</div>
        <div class="ros-sub">${s.race||''}${s.subrace?` (${s.subrace})`:''} ${s.cls||''}${s.archetype?` [${s.archetype}]`:''}${s.fightingStyle?` · ${s.fightingStyle}`:''} · CA ${s.ca} · ${s.maxHp} HP</div></div></div>
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
  DM_DRAFT = null; engineBusy = false;
  ROLL_RESOLVER = null; LAST_PENDING = false; DICE_SPINNING = false; LAST_COMBAT = false;
  if (DICE_TIMER){ clearInterval(DICE_TIMER); DICE_TIMER = null; }
  hideRollFab(); stopDice3D(); hideCombatReveal(); { const ov = $('#diceOverlay'); if (ov) ov.classList.add('hide'); }
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
    $('#rollsToggleBtn').onclick = () => { if (COMBAT_LAYOUT) return; $('.game-layout').classList.toggle('rolls-hidden'); };   // em combate o chat mora na lateral
    $('#hideRollsBtn').onclick = () => { if (COMBAT_LAYOUT) return; $('.game-layout').classList.add('rolls-hidden'); };
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
    $('#guideBtn').onclick = openGuide;        // roteiro (só Mestre-puro)
    $('#charsBtn').onclick = () => $('#sidebar').classList.toggle('mobile-open');   // fichas no mobile
    $('#sidebarCloseBtn').onclick = () => $('#sidebar').classList.remove('mobile-open');
    $('#sfxBtn').onclick = toggleSfx;          // efeitos (teste)
    G_WIRED = true;
  }
  if (!FX_SEEDED){ fxSeedSeen(ROOM.state||{}); FX_SEEDED = true; }   // não re-toca fx recentes ao (re)carregar a página
  if (!ROLLS_DEFAULTED){ ROLLS_DEFAULTED = true;   // no celular o painel de rolagens é overlay → começa fechado (abre no ⚄)
    if (window.innerWidth <= 1100){ const gl=$('.game-layout'); if (gl) gl.classList.add('rolls-hidden'); } }
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
    ? `<div class="cond-chips">${c.conditions.map(n=>{
        const cd = (((typeof RULES!=='undefined'&&RULES.conditions[n])||{}));
        return `<div class="cond-line"><span class="cond-chip ro">${escapeHtml(n)}</span><span class="cond-mod">${escapeHtml(cd.desc||'')}</span></div>`;
      }).join('')}</div>`
    : '';
  const luBadge = luPending ? `<div class="lu-badge">⬆ Subir de nível — toque para escolher</div>` : '';
  const avatar = c.portrait ? `<div class="cc-avatar" style="background-image:url('${c.portrait}')"></div>` : '';
  return `<div class="char-card ${active?'active-turn':''} ${luPending?'levelup-pending':''}" data-sheet="${idx}" title="${luPending?'Subir de nível':'Ver ficha completa'}">
    ${luBadge}
    <div class="cc-head">${avatar}<div class="cc-hd-txt">
      <div class="cc-name">${escapeHtml(c.name)}</div>
      <div class="cc-sub"><span class="player-tag ${active?'p1':'p2'}">${escapeHtml(c.ownerName||c.player||'')}</span> · ${sub}</div>
    </div></div>
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
  if (card.noRoll){   // magia de acerto automático / cura — sem d20
    const dmg = card.dmg ? `<div class="rbreak" style="margin-top:6px;color:var(--blood)">⚔ Dano <b style="color:var(--parch)">${card.dmg.total}</b> [${card.dmg.type}]</div>` : '';
    const heal = card.heal ? `<div class="rbreak" style="margin-top:6px;color:#6fae82">✚ Cura <b style="color:var(--parch)">${card.heal}</b> HP</div>` : '';
    return `<div class="roll-card"><div class="rtype">${escapeHtml(card.label)}</div>
      <div class="rnum">${card.dmg?card.dmg.total:(card.heal||card.total)}</div>
      <div class="rbreak">${escapeHtml(card.outcome||'')}</div>${dmg}${heal}</div>`;
  }
  let outcome = '';
  if (card.dc != null){
    const ok = !card.autoFail && card.total >= card.dc;
    outcome = `<div class="rout ${ok?'success':'fail'}">${card.autoFail?'FALHA AUTOMÁTICA':(ok?'SUCESSO':'FALHA')} (CD ${card.dc})</div>`;
  }
  const numClass = card.crit ? 'crit' : card.fumble ? 'fumble' : '';
  const diceStr = (card.dice||[]).join(', ');
  const dmgLine = card.dmg ? `<div class="rbreak" style="margin-top:6px;color:var(--blood)">⚔ Dano se acertar <b style="color:var(--parch)">${card.dmg.total}</b> [${card.dmg.type}]${dmgMultNote(card.dmg.mult)}</div>` : '';
  return `<div class="roll-card"><div class="rtype">${escapeHtml(card.label)}</div>
    <div class="rnum ${numClass}">${card.autoFail?'✗':card.total}</div>
    <div class="rbreak">d20 [${diceStr}] ${card.mod>=0?'+':''}${card.mod}${card.crit?' · CRÍTICO!':''}${card.fumble?' · FALHA CRÍTICA':''}</div>
    ${outcome}${dmgLine}</div>`;
}
// entrada no painel direito (estilo V1 logRoll)
function rollLogEntryHtml(card){
  if (card.noRoll){
    const dmg = card.dmg ? `<div class="rl-dmg">⚔ Dano <b>${card.dmg.total}</b> <span class="rl-sub">[${card.dmg.type}]${dmgMultNote(card.dmg.mult)}</span></div>` : '';
    const heal = card.heal ? `<div class="rl-dmg" style="color:#6fae82">✚ Cura <b>${card.heal}</b> HP</div>` : '';
    return `<div class="rl-entry"><div class="rl-head">${escapeHtml(card.label)}</div>
      <div class="rl-line"><span class="rl-num">${card.dmg?card.dmg.total:(card.heal||card.total)}</span><span class="rl-out">${escapeHtml(card.outcome||'')}</span></div>${dmg}${heal}</div>`;
  }
  const auto = card.autoFail || !card.dice || !card.dice.length;
  let cls = card.crit ? 'crit' : card.fumble ? 'fumble' : '';
  let out = '';
  if (card.dc != null){ const ok = !auto && card.total >= card.dc; if (!cls) cls = ok?'ok':'fail'; out = `${ok?'✓':'✗'} CD ${card.dc}`; }
  if (card.crit) out = 'CRÍTICO! ' + out;
  const breakLine = auto ? 'falha automática (condição)' : `d20 [${(card.dice||[]).join(', ')}] ${fmtMod(card.mod)} = ${card.total}`;
  const dmgLine = card.dmg ? `<div class="rl-dmg">⚔ Dano <b>${card.dmg.total}</b> <span class="rl-sub">${card.dmg.detail} [${card.dmg.type}]${dmgMultNote(card.dmg.mult)}</span></div>` : '';
  return `<div class="rl-entry ${cls}"><div class="rl-head">${escapeHtml(card.label)}</div>
    <div class="rl-line"><span class="rl-num">${auto?'✗':card.total}</span><span class="rl-out">${out.trim()}</span></div>
    <div class="rl-break">${breakLine}</div>${dmgLine}</div>`;
}
function renderRollLog(st){
  const rolls = (st.history||[]).filter(m => m.role==='roll');
  const list = $('#rollLogList'); if (!list) return;
  list.innerHTML = rolls.length ? rolls.slice().reverse().map(rollLogEntryHtml).join('') : '<div class="rolllog-empty">Nenhuma rolagem ainda.</div>';
}
// balões FIXOS de rolagem (um por jogador) — em combate substituem a lista que
// crescia e empurrava o chat. Cada balão mostra a última rolagem que envolve
// aquele PC (ataque/save dele OU ataque inimigo contra ele = dano que tomou).
function renderCombatBalloons(st){
  const box = $('#combatBalloons'); if (!box) return;
  if (!mpCombatActive(st)){ box.innerHTML = ''; return; }
  const rolls = (st.history||[]).filter(m => m.role==='roll');
  const cur = mpCurrentActor(st);
  const activeOwner = (cur && cur.kind==='pc') ? ((st.characters[cur.idx]||{}).owner) : null;
  box.innerHTML = (st.characters||[]).map(c => {
    let last = null;
    for (let i=rolls.length-1;i>=0;i--){ if ((rolls[i].label||'').includes(c.name)){ last = rolls[i]; break; } }
    const av = c.portrait
      ? `<div class="cbll-av" style="background-image:url('${c.portrait}')"></div>`
      : `<div class="cbll-av">${escapeHtml(tacInitials(c.name))}</div>`;
    let body;
    if (last){
      const totCls = last.crit ? 'crit' : (last.fumble && !last.autoFail) ? 'fumble' : '';
      const out = last.outcome ? `<span class="cbll-out ${/SUCESSO|ACERTO/i.test(last.outcome)?'ok':'bad'}">${escapeHtml(last.outcome)}</span>` : '';
      const det = last.autoFail ? 'falha automática' : `d20 ${last.nat!=null?last.nat:'—'} ${fmtMod(last.mod||0)}${last.dc?` · CD ${last.dc}`:''}`;
      const dmg = last.dmg ? `<div class="cbll-dmg">✕ ${last.dmg.total} dano${dmgMultNote(last.dmg.mult)}</div>` : '';
      body = `<div class="cbll-row"><span class="cbll-total ${totCls}">${last.total}</span>${out}</div>`
           + `<div class="cbll-detail">${det}</div>${dmg}`
           + `<div class="cbll-label">${escapeHtml(last.label||'')}</div>`;
    } else {
      body = `<div class="cbll-empty">sem rolagem ainda</div>`;
    }
    return `<div class="cbll ${c.owner===activeOwner?'act':''}">${av}<div class="cbll-main"><div class="cbll-name">${escapeHtml(c.name)}</div>${body}</div></div>`;
  }).join('');
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
// rola uma expressão de dano de inimigo ("1d6+1", "2d6+4", "1d4+2 +1d4 fogo"); crit dobra os dados
function mpRollDmgExpr(expr, crit){
  const s = String(expr || '1d6').toLowerCase();
  let total = 0; const detail = [];
  for (const m of s.matchAll(/(\d*)d(\d+)/g)){
    let n = +(m[1] || 1) * (crit ? 2 : 1); const sides = +m[2]; let sub = 0; const r = [];
    for (let i=0;i<n;i++){ const v = mpRollDie(sides); sub += v; r.push(v); }
    total += sub; detail.push(`${n}d${sides}(${r.join(',')})`);
  }
  for (const m of s.replace(/\d*d\d+/g,' ').matchAll(/([+-]?\s*\d+)/g)){
    const v = +String(m[1]).replace(/\s+/g,''); if (v){ total += v; detail.push(`${v>=0?'+':''}${v}`); }
  }
  return { total: Math.max(0, total), detail: detail.join(' ') };
}
// resolve uma [ROLL] para o personagem 'c'; devolve o card (espelhado no estado)
function doMpRoll(c, rollM, opts){
  opts = opts || {};
  if (c && c.inspiration && c.inspiration.die){ opts.extraAtkDie = opts.extraAtkDie || c.inspiration.die; c.inspiration = null; }   // Inspiração de Bardo: soma 1d6 e gasta
  const [, tipo, atr, cd, tag] = rollM;
  const abr = mpNormAbility(atr);
  const rm = rollModifiers(c, tipo, abr, tag);
  let adv = rm.adv || opts.adv, dis = rm.dis || opts.dis; const prof = rm.prof;
  if (adv && dis){ adv = false; dis = false; }   // vantagem + desvantagem se anulam
  const cdNum = +cd > 0 ? +cd : null;
  const result = rm.autoFail
    ? { nat:'—', total:0, mod:rm.mod, dice:[], crit:false, fumble:true }
    : mpD20(c, rm.mod, { adv, dis });
  if (opts.autoCrit && !result.fumble) result.crit = true;   // acerto crítico automático (alvo paralisado/inconsciente ≤1,5m)
  if (!rm.autoFail && opts.extraAtkDie){ const r = mpRollDmgExpr(opts.extraAtkDie).total; result.total += r; }   // Bênção/Inspiração (P2)
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

// ============================================================
//  ROLAGEM COM BOTÃO FLUTUANTE + DADO 3D
//  A engine pausa (st.pendingRoll); quem rola clica → @@ROLL@@ → a engine
//  rola e espelha o card → o dado 3D assenta no resultado em TODOS.
// ============================================================
let DICE_TIMER = null, DICE_SPINNING = false, LAST_PENDING = false, DICE3D = null;
function lastRollCard(st){ const h = st.history||[]; for (let i=h.length-1;i>=0;i--){ if (h[i].role==='roll') return h[i]; } return null; }
// d20 3D (three.js, via CDN) — degrada para só-número se WebGL/THREE faltar
function ensureDice3D(){
  if (DICE3D) return DICE3D;
  if (typeof THREE === 'undefined') return null;
  const wrap = $('#diceCanvasWrap'); if (!wrap) return null;
  try {
    const S = 210;
    const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.setSize(S, S); wrap.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100); camera.position.z = 4.2;
    const geo = new THREE.IcosahedronGeometry(1.5, 0);   // d20: 20 faces triangulares
    const mat = new THREE.MeshStandardMaterial({ color:0xd69e4a, metalness:0.75, roughness:0.32, flatShading:true });
    const die = new THREE.Mesh(geo, mat);
    die.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color:0x241509 })));
    scene.add(die);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const d1 = new THREE.DirectionalLight(0xfff0d2, 1.15); d1.position.set(3, 5, 4); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x88a0ff, 0.45); d2.position.set(-4, -2, 2); scene.add(d2);
    DICE3D = { renderer, scene, camera, die, mat, raf:null, spinning:false, settling:false, vel:{x:0,y:0,z:0} };
  } catch(e){ DICE3D = null; }
  return DICE3D;
}
function diceLoop(){
  const d = DICE3D; if (!d) return;
  if (d.spinning){
    if (d.settling){
      d.vel.x *= 0.93; d.vel.y *= 0.93; d.vel.z *= 0.93;
      if (Math.abs(d.vel.x) + Math.abs(d.vel.y) + Math.abs(d.vel.z) < 0.012) d.spinning = false;
    }
    d.die.rotation.x += d.vel.x; d.die.rotation.y += d.vel.y; d.die.rotation.z += d.vel.z;
  }
  try { d.renderer.render(d.scene, d.camera); } catch(e){}
  d.raf = requestAnimationFrame(diceLoop);
}
function stopDice3D(){ const d = DICE3D; if (d && d.raf){ cancelAnimationFrame(d.raf); d.raf = null; } }
function showRollFab(pr){
  const b = $('#rollFab'); if (!b) return;
  const mine = pr.owner === ME.id;
  if ((!mine && !amIAdmin()) || DICE_SPINNING){ b.classList.add('hide'); return; }
  b.classList.remove('hide');
  b.innerHTML = mine ? `🎲 Rolar <b>${escapeHtml(pr.tipo)}</b>${pr.cd?` · CD ${pr.cd}`:''}` : `🎲 Rolar por ${escapeHtml(pr.name)}`;
  b.onclick = triggerRoll;
}
function hideRollFab(){ const b = $('#rollFab'); if (b) b.classList.add('hide'); }
async function triggerRoll(){
  const st = ROOM.state || {}; const pr = st.pendingRoll; if (!pr) return;
  if (typeof SFX !== 'undefined') SFX.unlock();
  hideRollFab();
  startDiceAnim(pr);                                        // a animação local começa a girar já
  if (amIAdmin() && ROLL_RESOLVER){ ROLL_RESOLVER(); return; }   // admin é a engine: resolve direto
  try { await supa.from('room_actions').insert({ room_id: ROOM.id, user_id: ME.id, display_name: pr.name, text: ROLL_PREFIX }); }
  catch(e){ toast('Erro ao rolar: ' + e.message); }
}
function startDiceAnim(pr){
  const ov = $('#diceOverlay'); if (!ov) return;
  if (ov._t){ clearTimeout(ov._t); ov._t = null; }
  ov.classList.remove('hide','settled'); ov.classList.add('rolling');
  $('#diceTitle').textContent = `${pr.name||''}${pr.tipo?` · ${pr.tipo}`:''}`;
  $('#diceTarget').textContent = pr.cd ? `Alvo: CD ${pr.cd}` : '';
  $('#diceResult').innerHTML = '';
  const num = $('#diceNum'); num.className = 'dice-num';
  DICE_SPINNING = true;
  if (DICE_TIMER) clearInterval(DICE_TIMER);
  DICE_TIMER = setInterval(()=>{ num.textContent = 1 + Math.floor(Math.random()*20); }, 60);
  const d = ensureDice3D();
  if (d){
    d.mat.color.set(0xd69e4a); d.mat.emissive && d.mat.emissive.set(0x000000);
    d.vel = { x: 0.20 + Math.random()*0.16, y: 0.24 + Math.random()*0.18, z: 0.10 + Math.random()*0.10 };
    d.settling = false; d.spinning = true;
    if (!d.raf) diceLoop();
  }
}
function settleDiceAnim(card){
  const ov = $('#diceOverlay'); if (!ov || !card) return;
  if (!DICE_SPINNING) startDiceAnim({ name: card.label||'', tipo:'', cd: card.dc });   // não-rolador: gira rápido e assenta
  const d = DICE3D; if (d) d.settling = true;                                           // o dado 3D desacelera
  setTimeout(()=>{
    if (DICE_TIMER){ clearInterval(DICE_TIMER); DICE_TIMER = null; }
    DICE_SPINNING = false;
    ov.classList.remove('rolling'); ov.classList.add('settled');
    const num = $('#diceNum');
    num.textContent = card.autoFail ? '✗' : card.nat;
    num.className = 'dice-num ' + (card.crit ? 'crit' : card.fumble ? 'fumble' : '');
    if (d){ d.mat.color.set(card.crit ? 0x6ee07f : card.fumble ? 0xc4485a : 0xd69e4a); }
    const ok = card.dc != null ? (!card.autoFail && card.total >= card.dc) : null;
    const mods = card.autoFail ? 'falha automática (condição)' : `🎲 ${card.nat} ${fmtMod(card.mod)} = <b>${card.total}</b>`;
    const crit = card.crit ? ' · CRÍTICO!' : (card.fumble && !card.autoFail) ? ' · FALHA CRÍTICA' : '';
    const verdict = card.dc != null ? `<div class="dice-verdict ${ok?'ok':'fail'}">${ok?'SUCESSO':'FALHA'} · CD ${card.dc}</div>` : '';
    const dmg = card.dmg ? `<div class="dice-dmg">⚔ Dano ${card.dmg.total} [${card.dmg.type}]</div>` : '';
    $('#diceResult').innerHTML = `<div class="dice-mods">${mods}${crit}</div>${verdict}${dmg}`;
  }, 700);
  ov._t = setTimeout(()=>{ ov.classList.add('hide'); stopDice3D(); }, 3900);
  ov.onclick = ()=>{ if (!DICE_SPINNING){ ov.classList.add('hide'); stopDice3D(); } };
}

// reveal cinematográfico quando o combate começa — arte + nome (SEM stats, pra não dar spoiler)
function showCombatReveal(st){
  const ov = $('#combatReveal'); if (!ov || !st.combat) return;
  const seen = new Set(), uniq = [];
  (st.combat.enemies||[]).forEach(e => { if (!seen.has(e.name)){ seen.add(e.name); uniq.push(e); } });
  if (!uniq.length) return;
  const cards = uniq.map(e => { const art = monsterArt(e.name);
    return `<div class="cr-card">${art?`<img src="${art}" alt="">`:'<div class="cr-noart">⚔</div>'}<div class="cr-name">${escapeHtml(e.name)}</div></div>`;
  }).join('');
  $('#crInner').innerHTML = `<div class="cr-head">⚔ Combate! ⚔</div><div class="cr-cards">${cards}</div>`;
  if (ov._t) clearTimeout(ov._t);
  ov.classList.remove('hide');
  ov._t = setTimeout(()=> ov.classList.add('hide'), 4000);
  ov.onclick = ()=> ov.classList.add('hide');
}
function hideCombatReveal(){ const ov = $('#combatReveal'); if (ov) ov.classList.add('hide'); }

// layout de combate: mapa grande no centro; chat + compositor vão para a
// lateral direita (rolagens viram uma faixa compacta no topo). Só em telas
// largas (>1100px) — no celular a lateral é overlay, então mantém o padrão.
let COMBAT_LAYOUT = false;
function applyCombatLayout(st){
  const layout = document.querySelector('.game-layout'); if (!layout) return;
  const want = mpCombatActive(st) && window.innerWidth > 1100;
  if (want === COMBAT_LAYOUT) return;
  COMBAT_LAYOUT = want;
  const main = document.querySelector('.main-col'), rp = $('#rollPanel');
  const narr = $('#narrative'), comp = document.querySelector('.composer');
  if (!main || !rp || !narr || !comp) return;
  if (want){
    layout.classList.add('combat-mode'); layout.classList.remove('rolls-hidden');   // o chat mora aqui agora
    rp.appendChild(narr); rp.appendChild(comp);                                      // chat + compositor → lateral
  } else {
    layout.classList.remove('combat-mode');
    main.appendChild(narr); main.appendChild(comp);                                  // de volta ao centro
  }
}
function renderGame(){
  const st = ROOM.state || {};
  applyCombatLayout(st);   // reflui o layout quando entra/sai de combate
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
  renderTactical(st);   // mapa tático (grade + névoa + tokens)
  // narrativa (com digitação do Mestre) + painel de rolagens espelhado
  renderNarrative(st);
  renderRollLog(st);
  renderCombatBalloons(st);   // balões fixos por jogador (só em combate)
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
      : (st.pendingRoll ? `🎲 ${st.pendingRoll.owner===ME.id ? 'Sua vez de rolar o dado!' : `Aguardando <b style="color:var(--ember)">${escapeHtml(st.pendingRoll.name)}</b> rolar…`}`
        : (st.busy ? 'O Mestre está pensando…'
        : (TYPING ? 'O Mestre está narrando…'
          : (enemyTurn ? `Turno de <b style="color:var(--blood)">${escapeHtml(cur.name)}</b>…`
            : (myTurn ? `Sua vez, <b style="color:var(--ember)">${escapeHtml(turnChar.name)}</b>`
              : (turnChar ? `Aguardando <b style="color:var(--ember)">${escapeHtml(turnChar.name)}</b> (${escapeHtml(turnChar.ownerName||'')})…` : 'Aguardando o Mestre…')))))));
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
  // console do Mestre (modo comando): só alterna visibilidade — não reconstrói (preserva a digitação)
  const dc = $('#dmConsole'); if (dc) dc.style.display = DM_DRAFT ? '' : 'none';
  // botão do Roteiro: só para o Mestre-puro (tem spoilers; some pro admin-jogador)
  const gb = $('#guideBtn'); if (gb) gb.style.display = isCommandMode() ? '' : 'none';
  // rolagem: botão flutuante para quem rola + dado 3D quando a rolagem resolve
  if (st.pendingRoll) showRollFab(st.pendingRoll); else hideRollFab();
  if (LAST_PENDING && !st.pendingRoll) settleDiceAnim(lastRollCard(st));
  LAST_PENDING = !!st.pendingRoll;
  // reveal de monstros quando o combate começa
  const inCombat = mpCombatActive(st);
  if (inCombat && !LAST_COMBAT) showCombatReveal(st);
  LAST_COMBAT = inCombat;
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
  // nota do papel + gating do editor de HP (só Mestre-puro, evita auto-buff do admin-jogador)
  const playing = !!ROOM.admin_plays;
  const rn = $('#gmRoleNote');
  if (rn) rn.textContent = playing
    ? 'Você está jogando — a IA é o Mestre. Aqui ficam só os controles de mesa (sem spoiler).'
    : 'Você é o Mestre: a narração passa pelo seu console. Controles extras abaixo.';
  const hpSec = $('#gmHpSec'); if (hpSec) hpSec.style.display = playing ? 'none' : '';
  // editor de HP (só quando você NÃO joga)
  if (!playing){
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
}

async function gmAdjustHp(idx, delta){
  if (!amIAdmin() || ROOM.admin_plays) return;   // editor de HP só no modo Mestre-puro (sem auto-buff)
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
    <div class="sh-id">${c.portrait?`<div class="sh-portrait" style="background-image:url('${c.portrait}')"></div>`:''}<div><div class="sh-name">${escapeHtml(c.name)}</div><div class="sh-sub">${c.race}${c.subrace?` (${c.subrace})`:''} · ${c.cls}${c.archetype?` [${c.archetype}]`:''}${c.fightingStyle?` · ${c.fightingStyle}`:''} · Nível ${c.level} · ${escapeHtml(c.ownerName||c.player||'')}</div></div></div>
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
      if (e) applyDamage(e, Math.abs(+m[2]), null, st, {});   // tipo null → sem resist/vuln, mas passa por Fortitude Morta-Viva
    });
  }
  [...reply.matchAll(/\[DANO:\s*([^:\]]+?)\s*:\s*(-?\d+)\s*\]/gi)].forEach(m => {
    const ci = mpFindChar(st.characters||[], m[1]);
    if (ci >= 0) applyDamage(st.characters[ci], Math.abs(+m[2]), null, st, {});   // HP temp + (futuro) concentração
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
  fxClear(st);   // zera a fila de animações no início do combate (não no fim, p/ não cortar fx do 2º cliente)
  st.combat = { enc: encId, name: enc.name, enemies: enc.enemies.map(e => ({ ...e, curHp: e.hp, conditions: [], tempHp: 0 })), order:[], turn:0, round:1 };
  const order = [];
  (st.characters||[]).forEach((c,idx) => order.push({ kind:'pc', idx, name:c.name, init: mpD20(c, abilityMod(c.abilities.DES)).total }));
  st.combat.enemies.forEach((e,idx) => order.push({ kind:'enemy', idx, name:e.name, init: mpD20(null, e.mod||0).total }));
  order.sort((a,b) => b.init - a.init);
  st.combat.order = order; st.combat.turn = 0; st.combat.round = 1;
  st.history = st.history || [];
  st.history.push({ role:'scene', text:`⚔ COMBATE: ${(enc.name||'').toUpperCase()} ⚔` });
  tacSeed(st);   // posiciona PCs e inimigos no mapa tático da cena (se houver)
  st.combat.enemies.forEach(e => { const p = aiProfile(e);   // inicia IA: sopro carregado, âncora de spawn
    if (p.breath) e.breathReady = true;
    if (p.anchor && st.tactical) e._anchor = (st.tactical.pos||{})[e.id]; });
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
  if (st.tactical){ st.tactical.moved = {};   // novo turno → renova o deslocamento
    const o = cb.order[cb.turn]; const id = o.kind==='pc' ? (st.characters[o.idx]||{}).owner : (cb.enemies[o.idx]||{}).id;
    if (id) resetReactionFor(st, id);          // renova a reação de quem entra no turno (ataque de oportunidade disponível)
    if (cb._surge && !(o.kind==='pc' && (st.characters[o.idx]||{}).owner===cb._surge)) delete cb._surge;   // limpa Surto não-usado ao trocar de ator
  }
}
function mpEndCombat(st, victory){
  (st.characters||[]).forEach(c=>{ c.raging=false; c.inspiration=null; c.resUsed={}; c.concentrating=null; });   // descanso curto: recarrega Surto/Fôlego/Fúria/Canalizar/Inspiração; encerra concentração
  st.activeEffects = [];   // buffs/debuffs de combate não persistem fora dele
  st.combat = null; st.tactical = null;
  st.history = st.history || [];
  st.history.push({ role:'scene', text: victory ? '— inimigos derrotados! fim do combate —' : '— fim do combate —' });
}
// estado de saúde qualitativo do inimigo — jogadores NÃO veem HP exato (só o Mestre-puro vê)
function enemyHealthWord(cur, max){
  if (cur <= 0) return 'Abatido';
  const p = cur / (max || 1);
  if (p > 0.75) return 'Ileso';
  if (p > 0.5)  return 'Ferido';
  if (p > 0.25) return 'Muito ferido';
  return 'Por um fio';
}
function enemyHealthClass(cur, max){
  if (cur <= 0) return 'dead';
  const p = cur / (max || 1);
  return p > 0.75 ? 'ok' : p > 0.5 ? 'hurt' : p > 0.25 ? 'bad' : 'crit';
}
// barra de combate (lida do estado compartilhado)
function renderCombatBar(st){
  const bar = $('#combatBar'); if (!bar) return;
  if (!mpCombatActive(st)){ bar.classList.add('hide'); bar.innerHTML = ''; return; }
  bar.classList.remove('hide');
  const cb = st.combat;
  const seeExact = isCommandMode();   // só o Mestre-puro vê HP exato dos inimigos
  const toks = cb.order.map((o,k) => {
    let hp, dead, hpCls = '';
    if (o.kind==='enemy'){ const e = cb.enemies[o.idx]; dead = e.curHp <= 0;
      if (seeExact){ hp = `${e.curHp}/${e.hp} HP`; }
      else { hp = enemyHealthWord(e.curHp, e.hp); hpCls = 'word ' + enemyHealthClass(e.curHp, e.hp); } }
    else { const c = st.characters[o.idx]||{}; dead = (c.hp||0) <= 0; hp = `${c.hp}/${c.maxHp} HP`; }
    const art = o.kind==='enemy' ? monsterArt(o.name) : null;
    const artDiv = art ? `<div class="cb-art" style="background-image:url('${art}')"></div>` : '';
    return `<div class="cb-tok ${o.kind} ${k===cb.turn?'current':''} ${dead?'dead':''}">${artDiv}<div class="cb-init">${o.init}</div><div>${escapeHtml(o.name)}</div><div class="cb-hp ${hpCls}">${hp}</div></div>`;
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
  if (mpCurrentActor(st) && mpCurrentActor(st).kind==='enemy'){ st.busy = true; await saveState(st); renderGame(); await mpRunEnemyTurnsAuto(st); st.busy = false; await saveState(st); renderGame(); }
}
async function gmCombatEnd(){
  if (!amIAdmin() || !mpCombatActive(ROOM.state)) return;
  if (!confirm('Encerrar o combate agora?')) return;
  mpEndCombat(ROOM.state, false);
  await saveState(ROOM.state); renderGame();
}
// (mpRunEnemyTurns antigo — narração 100% IA — foi substituído por
//  mpRunEnemyTurnsAuto: inimigos agem por código e a IA só dá o sabor.)

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
let DM_DRAFT = null;   // rascunho privado do Mestre (modo comando) — NUNCA vai para rooms.state
const ROLL_PREFIX = '@@ROLL@@';   // sinal do jogador "rolei o dado" (botão flutuante)
let ROLL_RESOLVER = null;         // resolve a Promise da engine que espera o clique de rolagem
// engine: pausa pedindo a rolagem ao jogador; resolve quando ele clica (ação @@ROLL@@)
function mpAwaitRollClick(st, actor, rollM){
  const cd = +rollM[3] > 0 ? +rollM[3] : 0;
  st.pendingRoll = { owner: actor.owner, name: actor.name, ownerName: actor.ownerName || actor.name, tipo: (rollM[1]||'Teste').trim(), atr: mpNormAbility(rollM[2]), cd };
  return new Promise(resolve => { ROLL_RESOLVER = () => { ROLL_RESOLVER = null; resolve(); }; });
}
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
  // sinal de rolagem do jogador: destrava a engine que está esperando o clique no botão flutuante
  if (action.text === ROLL_PREFIX){
    PROCESSED_IDS.add(action.id);
    if (ROLL_RESOLVER) ROLL_RESOLVER();
    try { await supa.from('room_actions').update({ processed:true }).eq('id', action.id); } catch(e){}
    return;
  }
  // movimento no mapa tático: o admin aplica a posição enviada pelo jogador
  if (typeof action.text === 'string' && action.text.startsWith(MOVE_PREFIX)){
    if (engineBusy){ setTimeout(()=>onPlayerAction(action), 300); return; }
    engineBusy = true; PROCESSED_IDS.add(action.id);
    const st = ROOM.state || {};
    try { const d = JSON.parse(action.text.slice(MOVE_PREFIX.length)); if (d && d.owner === tacActiveOwner(st)) await tacMoveToken(st, d.owner, d.x, d.y); }
    catch(e){}
    finally { engineBusy = false; try { await supa.from('room_actions').update({ processed:true }).eq('id', action.id); } catch(e){} renderGame(); }
    return;
  }
  // ataque no tabuleiro: o admin resolve o ataque enviado pelo jogador e dispara os inimigos
  if (typeof action.text === 'string' && action.text.startsWith(ATTACK_PREFIX)){
    if (engineBusy){ setTimeout(()=>onPlayerAction(action), 300); return; }
    engineBusy = true; PROCESSED_IDS.add(action.id);
    const st = ROOM.state || {};
    try { const d = JSON.parse(action.text.slice(ATTACK_PREFIX.length));
      if (d && d.owner === tacActiveOwner(st)){ await playerAttack(d.owner, d.enemyId, st); await tacAdvanceFromPc(st); } }
    catch(e){}
    finally { engineBusy = false; try { await supa.from('room_actions').update({ processed:true }).eq('id', action.id); } catch(e){} renderGame(); }
    return;
  }
  // magia/habilidade no tabuleiro: o admin resolve e dispara os inimigos
  if (typeof action.text === 'string' && action.text.startsWith(ABILITY_PREFIX)){
    if (engineBusy){ setTimeout(()=>onPlayerAction(action), 300); return; }
    engineBusy = true; PROCESSED_IDS.add(action.id);
    const st = ROOM.state || {};
    try { const d = JSON.parse(action.text.slice(ABILITY_PREFIX.length));
      if (d && d.owner === tacActiveOwner(st)){ await castAbility(d.owner, d.name, d.targetId, st); await tacAdvanceFromPc(st); } }
    catch(e){}
    finally { engineBusy = false; try { await supa.from('room_actions').update({ processed:true }).eq('id', action.id); } catch(e){} renderGame(); }
    return;
  }
  // habilidade de classe no tabuleiro
  if (typeof action.text === 'string' && action.text.startsWith(FEATURE_PREFIX)){
    if (engineBusy){ setTimeout(()=>onPlayerAction(action), 300); return; }
    engineBusy = true; PROCESSED_IDS.add(action.id);
    const st = ROOM.state || {};
    try { const d = JSON.parse(action.text.slice(FEATURE_PREFIX.length));
      if (d && d.owner === tacActiveOwner(st)){ await castFeature(d.owner, d.name, d.targetId, st); await tacAdvanceFromPc(st); } }
    catch(e){}
    finally { engineBusy = false; try { await supa.from('room_actions').update({ processed:true }).eq('id', action.id); } catch(e){} renderGame(); }
    return;
  }
  // encerrar turno no tabuleiro: passa a vez e dispara os inimigos
  if (action.text === ENDTURN_PREFIX){
    if (engineBusy){ setTimeout(()=>onPlayerAction(action), 300); return; }
    engineBusy = true; PROCESSED_IDS.add(action.id);
    const st = ROOM.state || {};
    try { await tacAdvanceFromPc(st); }
    catch(e){}
    finally { engineBusy = false; try { await supa.from('room_actions').update({ processed:true }).eq('id', action.id); } catch(e){} renderGame(); }
    return;
  }
  if (engineBusy){ setTimeout(()=>onPlayerAction(action), 800); return; }   // serializa
  engineBusy = true; PROCESSED_IDS.add(action.id);
  const st = ROOM.state || {};
  // MODO COMANDO (Mestre-puro): segura o reply da IA num rascunho até o ✓ do Mestre
  if (isCommandMode()){ await startCommandDraft(action, st); return; }
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
        const wait = mpAwaitRollClick(st, actor, rollM);    // pede a rolagem ao jogador (botão flutuante)
        await saveState(st); renderGame();                  // mostra o pedido + botão a quem rola
        await wait;                                          // espera o clique (@@ROLL@@)
        st.pendingRoll = null;
        const card = doMpRoll(actor, rollM);                // o CÓDIGO rola (justo)
        st.history.push(card);
        await saveState(st); renderGame();                  // espelha o card → dado 3D anima em todos
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
        await mpRunEnemyTurnsAuto(st);                      // auto-conduz inimigos até o próximo PC vivo
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
// ============================================================
//  MODO "MESTRE NO COMANDO" (Mestre-puro) — a IA propõe, o humano dispõe.
//  O reply da IA é encenado num RASCUNHO PRIVADO (DM_DRAFT, só no cliente
//  do admin); nada chega aos jogadores antes do ✓ Enviar. engineBusy fica
//  ligado durante a composição → a ação só vira 'processed' no finalize.
// ============================================================
function rollLabel(m){ return m ? `${(m[1]||'').trim()} (${(m[2]||'').trim()})${+m[3]>0?` CD ${m[3]}`:''}` : ''; }

// recebeu a ação de um jogador: registra, chama a IA e ABRE o console (não commita)
async function startCommandDraft(action, st){
  try {
    st.history = st.history || [];
    st.history.push({ role:'player', who: action.display_name, text: action.text });
    st.busy = true; await saveState(st); renderGame();          // jogadores: ação visível + travados
    DM_DRAFT = { action, actor: mpActivePc(st), hadCombat: mpCombatActive(st), rolls: 0, seed: undefined };
    const reply = await callDm(st);
    stageDraft(reply);
  } catch(e){
    DM_DRAFT = null; engineBusy = false;
    st.busy = false; try { await saveState(st); } catch(_){}
    toast('Erro ao preparar a cena: ' + e.message); renderGame();
  }
}
// encena um reply da IA no rascunho (marcadores só são aplicados no envio)
function stageDraft(reply){
  if (!DM_DRAFT) return;
  const d = DM_DRAFT;
  const rawRoll = reply.match(ROLL_RE);
  d.reply = reply;
  d.rawRoll = rawRoll;
  d.rollM = (d.rolls < 4) ? rawRoll : null;
  d.sceneComplete = /\[SCENE_COMPLETE\]/.test(reply);
  d.combatStart = (reply.match(/\[COMBAT_START:([A-Za-z0-9_]+)\]/) || [])[1] || null;
  d.text = reply.replace(/\[[^\]]*\]/g, '').trim();
  renderDmConsole();
  renderGame();
}
// extrai atributo/tipo de uma sugestão de teste do roteiro (ex.: "DEX (Acrobacia) para…")
function parsePossibleRoll(text){
  const t = String(text || '');
  const abM = t.match(/\b(STR|DEX|CON|INT|WIS|CHA|FOR|DES|SAB|CAR)\b/i);
  const skM = t.match(/\(([^)]+)\)/);
  let tipo = skM ? skM[1].trim() : 'Teste';
  if (/save/i.test(tipo)) tipo = 'save';
  return { atr: mpNormAbility(abM ? abM[1] : 'DES'), tipo };
}
// chips do console mexem no rascunho (a IA sugere, o Mestre dispõe)
function dmcQueueRoll(tipo, atr, cd){ if (!DM_DRAFT) return; DM_DRAFT.rollM = ['', tipo, mpNormAbility(atr), String(cd)]; DM_DRAFT.sceneComplete = false; DM_DRAFT.combatStart = null; renderDmConsole(); }
function dmcToggleScene(){ if (!DM_DRAFT) return; DM_DRAFT.sceneComplete = !DM_DRAFT.sceneComplete; if (DM_DRAFT.sceneComplete){ DM_DRAFT.rollM = null; DM_DRAFT.combatStart = null; } renderDmConsole(); }
function dmcToggleCombat(enc){ if (!DM_DRAFT) return; DM_DRAFT.combatStart = DM_DRAFT.combatStart ? null : enc; if (DM_DRAFT.combatStart){ DM_DRAFT.rollM = null; DM_DRAFT.sceneComplete = false; } renderDmConsole(); }
function dmcSeed(instruction){ if (!DM_DRAFT) return; DM_DRAFT.seed = instruction; redraftDm(); }

// painel privado do Mestre (só admin em modo comando) — rascunho + chips predefinidos da cena
function renderDmConsole(){
  const box = $('#dmConsole'); if (!box) return;
  if (!DM_DRAFT){ box.style.display = 'none'; box.innerHTML = ''; return; }
  if (DM_DRAFT.enemy){ renderEnemyCommand(box); return; }   // Fase 3: comando dos inimigos
  const d = DM_DRAFT;
  const st = ROOM.state || {};
  const sc = (typeof CAMPAIGN !== 'undefined' && CAMPAIGN.scenes[st.sceneId]) || {};
  const ABR = ['FOR','DES','CON','INT','SAB','CAR'];
  // linha da rolagem (editável) quando há uma na fila
  let rollRow = '';
  if (d.rollM){
    rollRow = `<div class="dmc-roll">🎲
      <input id="dmcRtipo" value="${escapeHtml(d.rollM[1]||'Teste')}" placeholder="tipo (Persuasão / save / ataque)">
      <select id="dmcRatr">${ABR.map(a=>`<option ${mpNormAbility(d.rollM[2])===a?'selected':''}>${a}</option>`).join('')}</select>
      <label>CD<input id="dmcRcd" type="number" min="0" max="30" value="${+d.rollM[3]||0}"></label>
      <button class="dmc-x" id="dmcRcancel" title="Cancelar rolagem">✕</button></div>`;
  }
  // chips predefinidos da cena
  const objBlock = (sc.objectives||[]).length
    ? `<div class="dmc-grp"><span class="dmc-lbl">🎯 Objetivos</span><div class="dmc-obj">${(sc.objectives||[]).map(escapeHtml).join(' · ')}</div></div>` : '';
  const rollChips = (sc.possibleRolls||[]).map((t,i)=>{ const p = parsePossibleRoll(t); return `<button class="dmc-chip" data-roll="${i}" title="${escapeHtml(t)}">🎲 ${escapeHtml(p.tipo)} (${p.atr})</button>`; }).join('');
  const rollBlock = `<div class="dmc-grp"><span class="dmc-lbl">Testes</span>${rollChips}<button class="dmc-chip alt" data-rollcustom="1">+ teste</button></div>`;
  const npcKeys = Object.keys(sc.npcs||{});
  const npcBlock = npcKeys.length ? `<div class="dmc-grp"><span class="dmc-lbl">🗣️ NPCs</span>${npcKeys.map(n=>`<button class="dmc-chip" data-npc="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join('')}</div>` : '';
  const suggs = Array.isArray(st.suggestions) ? st.suggestions : [];
  const suggBlock = suggs.length ? `<div class="dmc-grp"><span class="dmc-lbl">💡 Ideias</span>${suggs.map((s,i)=>`<button class="dmc-chip" data-sugg="${i}">${escapeHtml(s)}</button>`).join('')}</div>` : '';
  let actChips = '';
  if (sc.next) actChips += `<button class="dmc-chip act ${d.sceneComplete?'on':''}" data-scene="1">➡️ Avançar cena</button>`;
  if (sc.combat && !mpCombatActive(st)) actChips += `<button class="dmc-chip act ${d.combatStart?'on':''}" data-combat="${escapeHtml(sc.combat)}">⚔️ Iniciar combate</button>`;
  const actBlock = actChips ? `<div class="dmc-grp"><span class="dmc-lbl">Rumo</span>${actChips}</div>` : '';
  const sendLabel = d.rollM ? '✓ Enviar e rolar' : d.sceneComplete ? '✓ Enviar e avançar' : d.combatStart ? '✓ Enviar e lutar' : '✓ Enviar';
  box.style.display = '';
  box.innerHTML = `
    <div class="dmc-head">🎬 Console do Mestre <span class="dmc-sub">só você vê — os jogadores aguardam</span></div>
    <textarea id="dmcText" class="dmc-text" rows="6" placeholder="A narração que os jogadores vão ler…">${escapeHtml(d.text)}</textarea>
    ${rollRow}
    <div class="dmc-chips">${objBlock}${rollBlock}${npcBlock}${suggBlock}${actBlock}</div>
    <div class="dmc-actions">
      <button class="btn ghost" id="dmcRedraft" title="A IA gera outra versão">↻ Refazer</button>
      <button class="btn" id="dmcSend">${sendLabel}</button>
    </div>`;
  $('#dmcText').oninput = e => { DM_DRAFT.text = e.target.value; };
  if (d.rollM){
    $('#dmcRtipo').oninput = e => { DM_DRAFT.rollM[1] = e.target.value; };
    $('#dmcRatr').onchange = e => { DM_DRAFT.rollM[2] = e.target.value; };
    $('#dmcRcd').oninput = e => { DM_DRAFT.rollM[3] = e.target.value; };
    $('#dmcRcancel').onclick = () => { DM_DRAFT.rollM = null; renderDmConsole(); };
  }
  $$('#dmConsole [data-roll]').forEach(b => b.onclick = () => { const p = parsePossibleRoll((sc.possibleRolls||[])[+b.dataset.roll]); dmcQueueRoll(p.tipo, p.atr, 13); });
  const rc = $('#dmConsole [data-rollcustom]'); if (rc) rc.onclick = () => dmcQueueRoll('Teste','DES',13);
  $$('#dmConsole [data-npc]').forEach(b => b.onclick = () => dmcSeed(`Faça o NPC ${b.dataset.npc} falar ou reagir agora, coerente com a cena. Termine devolvendo o controle aos jogadores.`));
  $$('#dmConsole [data-sugg]').forEach(b => b.onclick = () => dmcSeed(`Conduza a cena nesta direção: "${suggs[+b.dataset.sugg]}". Narre em 2-3 frases curtas.`));
  const scb = $('#dmConsole [data-scene]'); if (scb) scb.onclick = dmcToggleScene;
  const cmb = $('#dmConsole [data-combat]'); if (cmb) cmb.onclick = () => dmcToggleCombat(cmb.dataset.combat);
  $('#dmcRedraft').onclick = redraftDm;
  $('#dmcSend').onclick = sendDraft;
}
// pede outra versão à IA (mantém o mesmo ponto do histórico/semente da rolagem)
async function redraftDm(){
  if (!DM_DRAFT) return;
  const st = ROOM.state || {};
  const rd = $('#dmcRedraft'), sd = $('#dmcSend');
  if (rd) rd.disabled = true;
  if (sd) sd.disabled = true;
  try { const reply = await callDm(st, DM_DRAFT.seed); stageDraft(reply); }
  catch(e){ toast('Erro ao refazer: ' + e.message); renderDmConsole(); }
}
// ✓ aprova: commita o texto editado, aplica marcadores e avança (igual ao fluxo autônomo)
async function sendDraft(){
  if (!DM_DRAFT) return;
  const st = ROOM.state || {};
  const d = DM_DRAFT;
  const text = (d.text || '').trim();
  const sd = $('#dmcSend'); if (sd) sd.disabled = true;
  try {
    // combate é decidido pelo CHIP do Mestre (d.combatStart), não pelo marcador cru → ele pode vetar a sugestão da IA
    let replyForMarkers = d.reply.replace(/\[COMBAT_START:[^\]]*\]/gi, '');
    if (d.fromEnemy) replyForMarkers = replyForMarkers.replace(/\[(DANO|HIT):[^\]]*\]/gi, '');  // dano dos inimigos já aplicado pelo código
    applyMpMarkers(replyForMarkers, st);                          // condições/dano/mapa/sugestões (sem auto-combate)
    if (d.combatStart && !mpCombatActive(st)) mpStartCombat(st, d.combatStart);
    let sceneComplete = !!d.sceneComplete;                        // idem: avanço pelo chip, não pelo marcador
    if (sceneComplete && mpCombatActive(st) && !mpAllEnemiesDead(st)) sceneComplete = false;
    if (text) st.history.push({ role:'dm', text });
    // 1) rolagem tem prioridade: commita o pedido, o código rola, e a CONSEQUÊNCIA volta ao console
    if (d.rollM && d.actor){
      d.rolls++;
      const wait = mpAwaitRollClick(st, d.actor, d.rollM);        // pede a rolagem ao jogador (botão flutuante)
      await saveState(st); renderGame();
      await wait;                                                 // espera o clique (@@ROLL@@)
      st.pendingRoll = null;
      const card = doMpRoll(d.actor, d.rollM);
      st.history.push(card);
      await saveState(st); renderGame();                         // espelha o card → dado 3D anima em todos
      d.seed = mpRollResultText(d.actor, card);
      const reply2 = await callDm(st, d.seed);
      stageDraft(reply2);
      return;                                                     // espera o próximo ✓
    }
    // 2) pediu rolagem além do teto: não perde a vez, só encerra
    if (d.rawRoll && !d.rollM){ if (!text) st.history.push({ role:'dm', text:'…' }); await finalizeDraft(st); return; }
    // 3) fim de cena
    if (sceneComplete){ st.suggestions = []; mpAdvanceScene(st); await finalizeDraft(st); return; }
    // 4) turno normal
    if (!text) st.history.push({ role:'dm', text:'…' });
    if (mpCombatActive(st)){
      if (d.hadCombat) advanceTurn(st);                          // passa o ponteiro do PC que agiu
      if (mpAllEnemiesDead(st)){ mpEndCombat(st, true); await finalizeDraft(st); return; }
      if (mpAllPcsDead(st)){ st.history.push({ role:'scene', text:'⚰ O grupo tombou em combate…' }); mpEndCombat(st, false); await finalizeDraft(st); return; }
      const acting = mpCollectEnemyCluster(st);                  // inimigos que agem agora (até o próximo PC vivo)
      if (acting.length){ await openEnemyCommand(st, acting); return; }   // o Mestre comanda → não finaliza ainda
      await finalizeDraft(st); return;                           // já é a vez de um PC
    }
    advanceTurn(st);
    await finalizeDraft(st);
  } catch(e){
    toast('Erro ao enviar: ' + e.message);
    await finalizeDraft(st);
  }
}
// fecha o ciclo da ação: destrava o grupo, marca processada e limpa o rascunho
async function finalizeDraft(st){
  const action = DM_DRAFT && DM_DRAFT.action;
  st.busy = false;
  try { await saveState(st); } catch(e){}
  engineBusy = false;
  if (action){ try { await supa.from('room_actions').update({ processed:true }).eq('id', action.id); } catch(e){} }
  DM_DRAFT = null;
  renderDmConsole();
  renderGame();
}

// ---- Fase 3: COMANDO DOS INIMIGOS (modo Mestre) ----
// junta os inimigos vivos que agem agora até o próximo PC vivo (avança o ponteiro)
function mpCollectEnemyCluster(st){
  const acting = [];
  while (mpCombatActive(st)){
    const cur = mpCurrentActor(st); if (!cur) break;
    if (cur.kind === 'pc'){ if ((st.characters[cur.idx]||{}).hp > 0) break; mpAdvanceCombat(st); continue; }
    const e = st.combat.enemies[cur.idx];
    if (e.curHp > 0) acting.push(e);
    mpAdvanceCombat(st);
  }
  return acting;
}
// abre o painel onde o Mestre escolhe o alvo de cada inimigo (não finaliza a ação)
async function openEnemyCommand(st, acting){
  if (!DM_DRAFT) return;
  const pcs = (st.characters||[]).filter(c => c.hp > 0);
  const firstIdx = pcs.length ? (st.characters||[]).indexOf(pcs[0]) : null;
  const targets = {};
  acting.forEach(e => { targets[e.id] = firstIdx; });          // alvo padrão: 1º herói vivo
  DM_DRAFT.enemy = { acting, targets };
  st.busy = true; await saveState(st); renderGame();           // jogadores: narração do PC visível, ainda travados
  renderDmConsole();
}
function renderEnemyCommand(box){
  const st = ROOM.state || {};
  const en = DM_DRAFT.enemy;
  const enc = st.combat && CAMPAIGN.encounters[st.combat.enc];
  const pcs = (st.characters||[]).map((c,idx)=>({ idx, name:c.name, ca:c.ca, hp:c.hp })).filter(p => p.hp > 0);
  const rows = en.acting.map(e => {
    const opts = pcs.map(p => `<option value="${p.idx}" ${en.targets[e.id]===p.idx?'selected':''}>${escapeHtml(p.name)} (CA ${p.ca})</option>`).join('')
      + `<option value="" ${en.targets[e.id]==null?'selected':''}>— não agir —</option>`;
    return `<div class="dmc-foe">
      <div class="dmc-foe-info"><b>${escapeHtml(e.name)}</b> <span class="dmc-foe-sub">HP ${e.curHp}/${e.hp} · ataque ${fmtMod(e.mod||0)} · dano ${escapeHtml(e.dmg||'—')}</span>${e.traits?`<div class="dmc-foe-tr">${escapeHtml(e.traits)}</div>`:''}</div>
      <select data-foe="${escapeHtml(e.id)}">${opts}</select>
    </div>`;
  }).join('');
  box.style.display = '';
  box.innerHTML = `
    <div class="dmc-head">⚔️ Turno dos inimigos <span class="dmc-sub">você comanda — escolha os alvos</span></div>
    ${enc && enc.tactics ? `<div class="dmc-hint combat">Tática: ${escapeHtml(enc.tactics)}</div>` : ''}
    <div class="dmc-foes">${rows}</div>
    <div class="dmc-actions"><button class="btn" id="dmcResolve">⚔️ Resolver ataques</button></div>`;
  $$('#dmConsole [data-foe]').forEach(s => s.onchange = e => { const v = e.target.value; DM_DRAFT.enemy.targets[e.target.dataset.foe] = (v==='') ? null : +v; });
  $('#dmcResolve').onclick = resolveEnemyCommand;
}
// o CÓDIGO rola os ataques (justo), aplica dano e devolve o resumo para a IA narrar (com aprovação)
async function resolveEnemyCommand(){
  if (!DM_DRAFT || !DM_DRAFT.enemy) return;
  const st = ROOM.state || {};
  const en = DM_DRAFT.enemy;
  const btn = $('#dmcResolve'); if (btn) btn.disabled = true;
  const results = [];
  for (const e of en.acting){
    if ((e.curHp||0) <= 0) continue;
    const tIdx = en.targets[e.id];
    const target = (tIdx!=null) ? st.characters[tIdx] : null;
    if (!target || target.hp <= 0){ results.push(`${e.name} recua e não ataca.`); continue; }
    const atk = mpD20(null, e.mod||0);
    const hit = atk.crit || (!atk.fumble && atk.total >= (target.ca||10));
    st.history.push({ role:'roll', label:`${e.name} ataca ${target.name}`, total:atk.total, mod:e.mod||0, dice:atk.dice, crit:atk.crit, fumble:atk.fumble, dc:target.ca, tipo:'ataque', nat:atk.nat });
    if (hit){
      const dmg = mpRollDmgExpr(e.dmg||'1d6', atk.crit);
      const res = applyDamage(target, dmg.total, enemyDmgType(e), st, {crit:atk.crit, srcEnemy:e});
      results.push(`${e.name} ACERTOU ${target.name}: ${res.applied} de dano${dmgMultNote(res.mult)}${atk.crit?' (CRÍTICO)':''}.`);
    } else {
      results.push(`${e.name} ERROU ${target.name} (rolou ${atk.total} vs CA ${target.ca}).`);
    }
  }
  await saveState(st); renderGame();                            // espelha os cards de ataque + HP a todos
  DM_DRAFT.enemy = null;
  if (mpAllPcsDead(st)){ st.history.push({ role:'scene', text:'⚰ O grupo tombou em combate…' }); mpEndCombat(st, false); }
  await mpSleep(500);
  DM_DRAFT.fromEnemy = true;                                    // marca: dano já aplicado pelo código (não reaplicar)
  DM_DRAFT.seed = `[TURNO DOS INIMIGOS — RESULTADO] ${results.join(' ')} Narre as ações deles AGORA em 1-3 frases, coerente com a cena. NÃO peça rolagem nem fale como sistema.`;
  try { const reply = await callDm(st, DM_DRAFT.seed); stageDraft(reply); }
  catch(e){ toast('Erro ao narrar inimigos: ' + e.message); await finalizeDraft(st); }
}
const mpSleep = ms => new Promise(r => setTimeout(r, ms));
function buildMpHistory(st){
  const msgs = [];
  (st.history||[]).slice(-12).forEach(m => {
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
  try { return await callClaudeMp(msgs, buildMpSystemPrompt(st), 512); }
  catch (e){ return `*(O Mestre tropeçou: ${e.message})*`; }
}
// Bloco ESTÁTICO do system prompt (idêntico a sessão toda) → habilita prompt caching.
let MP_STATIC_CACHE = null;
function mpStaticPrompt(){
  if (MP_STATIC_CACHE) return MP_STATIC_CACHE;
  MP_STATIC_CACHE = `Você é o Mestre (DM) de uma aventura de D&D 5e: "${CAMPAIGN.title}".
${CAMPAIGN.premise||''}

Esta é uma MESA MULTIJOGADOR: vários jogadores, cada um controla SEU personagem (o nome do jogador vem entre colchetes antes da ação). Dirija-se ao grupo; quando um personagem específico agir, narre o resultado dele e envolva os outros. Seja vívido e conciso (2-3 parágrafos). Português do Brasil; termos de regra em inglês.

REGRAS DE IMERSÃO (siga à risca):
- Você é SEMPRE o narrador EM PERSONAGEM. NUNCA fale como sistema, IA ou assistente. NUNCA cite "Apêndice A", regras, "dano", "RP", "condição" como pergunta de bastidor, nem peça ao jogador para "escolher o efeito".
- Quando a ação tem resultado CERTO/automático (ex.: beber um veneno que ele tem, abrir uma porta destrancada, conversar), NARRE direto. Mas quando o resultado é INCERTO (pode dar certo OU errado), você NÃO decide — peça uma rolagem (veja abaixo). Nunca anuncie sucesso ou fracasso de uma ação arriscada sem antes pedir o dado.
- Só faça perguntas se forem DENTRO da ficção e genuinamente necessárias. Nunca pergunte sobre mecânica.
- COERÊNCIA: o personagem só pode usar o que está NA FICHA dele (inventário/magias) e o que a CENA oferece. Se descrever usar algo que NÃO possui, corrija DENTRO da ficção. Nunca dê itens que não existem.
- ★ REGRA MAIS IMPORTANTE: você NÃO rola dados nem inventa números. Sempre que a ação puder falhar (escalar, esgueirar-se, persuadir/intimidar/enganar, investigar, atacar, resistir, arrombar etc.), sua resposta DEVE conter [ROLL:tipo:ATRIBUTO:CD] e PARAR ali. O sistema rola o d20 justo e devolve o número; só ENTÃO você narra o desfecho. Narrar o resultado sem pedir o dado está ERRADO.
  • tipo = perícia (Atletismo, Furtividade, Percepção, Persuasão, Intimidação, Enganação, Investigação...), 'save' ou 'ataque'. ATRIBUTO = FOR/DES/CON/INT/SAB/CAR. CD: 10 fácil, 13 médio, 15 difícil, 18+ muito difícil; 'ataque' usa CD 0.
  • Formato exato, sem espaços: [ROLL:Atletismo:FOR:12] · [ROLL:save:DES:14] · [ROLL:ataque:DES:0]. Uma rolagem por vez.

## MARCADORES (o sistema processa e REMOVE do texto — não os explique)
- Combate: [COMBAT_START:idDoEncontro] inicia (rola iniciativa). Dano a inimigo: [HIT:idDoInimigo:n]. Dano a herói: [DANO:NomeDoHeroi:n]. Respeite a iniciativa — o sistema diz de quem é a vez.
- Condição (Apêndice A): [CONDICAO:NomeDoHeroi:Condição] — ex.: [CONDICAO:Garrett:Envenenado]; ao acabar: [REMOVER_CONDICAO:NomeDoHeroi:Condição]. Válidas: ${Object.keys(RULES.conditions).join(', ')}.
- Avistou área nova do mapa: [REVELAR_LOCAL:id]. Não cite o nome de um local desconhecido antes de revelá-lo.
- Cena cumprida (hora de avançar de local/capítulo): termine com [SCENE_COMPLETE]. O sistema cuida da transição/nível/descanso. Não use cedo demais.
- SEMPRE termine com 2-3 sugestões curtas: [SUGESTOES: ação 1 | ação 2 | ação 3] (exceto se emitir [SCENE_COMPLETE]).

## EXEMPLOS (peça o dado e PARE quando for arriscado)
Jogador [Bjorn]: "Tento escalar o mastro escorregadio." Você: A madeira encharcada cede sob as botas. [ROLL:Atletismo:FOR:13]
Jogador [Lia]: "Tento convencer o capitão." Você: O capitão cruza os braços, desconfiado. [ROLL:Persuasão:CAR:15]
Jogador [Bjorn]: "Ataco o esqueleto." Você: Bjorn ruge e desce a lâmina. [ROLL:ataque:FOR:0]`;
  return MP_STATIC_CACHE;
}
// Bloco DINÂMICO (cena + fichas + combate + mapa) — muda por turno.
function mpDynamicPrompt(st){
  const sc = CAMPAIGN.scenes[st.sceneId] || {};
  const sheets = (st.characters||[]).map(c =>
    `- ${c.name} (${c.ownerName||'?'}): ${c.race}${c.subrace?` (${c.subrace})`:''} ${c.cls} Nv${c.level}. HP ${c.hp}/${c.maxHp}, CA ${c.ca}. ` +
    `Atrib: ${RULES.abilities.map(a=>`${a} ${c.abilities[a]}(${fmtMod(abilityMod(c.abilities[a]))})`).join(', ')}.` +
    ((c.cantripsChosen&&c.cantripsChosen.length)?` Truques: ${c.cantripsChosen.join(', ')}.`:'') +
    ((c.spellsChosen&&c.spellsChosen.length)?` Magias nv1: ${c.spellsChosen.join(', ')}.`:'') +
    ` Inventário: ${(c.inventory&&c.inventory.length)?c.inventory.join('; '):'(vazio)'}.` +
    ((c.conditions&&c.conditions.length)?` Condições: ${c.conditions.join(', ')}.`:'')
  ).join('\n');
  const npcs = sc.npcs ? Object.entries(sc.npcs).map(([n,d])=>`- ${n}: ${d}`).join('\n') : 'Nenhum NPC fixo.';
  const enc = sc.combat && CAMPAIGN.encounters[sc.combat];
  let combatBlock = '';
  if (mpCombatActive(st)){
    const cb = st.combat;
    combatBlock = `\n## COMBATE (rodada ${cb.round}) — o sistema controla a iniciativa\nOrdem: ${cb.order.map((o,k)=>`${k===cb.turn?'▶ ':''}${o.name}`).join(' > ')}\nInimigos: ${cb.enemies.map(e=>`${e.name}[id:${e.id}] HP ${e.curHp}/${e.hp}, CA ${e.ca}`).join('; ')}\nDano a inimigo: [HIT:id:n]. Dano a herói: [DANO:Nome:n].\n`;
  } else if (enc){
    combatBlock = `\n## ENCONTRO DESTA CENA\nSe virar luta, inicie com [COMBAT_START:${sc.combat}]. Encontro: "${enc.name}".${enc.negotiable?' NEGOCIÁVEL (bons testes sociais podem evitá-lo).':''}\n`;
  }
  const mapList = Object.entries(MAP_LOCS).map(([id,m])=>`- ${id}: ${mpMapKnown(st,id)?m.label:'(desconhecido)'}`).join('\n');
  return `## CENA ATUAL: ${sc.chapter||''} — ${sc.location||''}
${sc.summary||''}
Objetivos: ${(sc.objectives||[]).join('; ')}

## NPCs
${npcs}

## GRUPO
${sheets}
${combatBlock}
## MAPA (ids para [REVELAR_LOCAL])
${mapList}

Responda à ação. Se houver incerteza, peça [ROLL:...] e pare; senão narre e termine com [SUGESTOES:...].`;
}
// system como blocos: estático (cacheado) + dinâmico → corta ~90% do input repetido
function buildMpSystemPrompt(st){
  return [
    { type:'text', text: mpStaticPrompt(), cache_control:{ type:'ephemeral' } },
    { type:'text', text: mpDynamicPrompt(st) },
  ];
}

window.addEventListener('beforeunload', ()=>{ try{ if(roomChannel) supa.removeChannel(roomChannel); }catch(e){} });
// reconexão ao recuperar rede/foco
window.addEventListener('online', () => { if (ROOM) reconnectNow(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !ROOM) return;
  if (CONN !== 'live') reconnectNow(); else refreshRoom();
});
// ====================================================================
//  MODO DE TESTE (?teste=1) — partida local fake, sem login/Supabase/IA.
//  Painel de botões para disparar reveal de combate, artes, dado 3D e Roteiro.
// ====================================================================
function makeStubSupa(){
  const chain = () => { const p = Promise.resolve({ data:null, error:null });
    ['eq','neq','in','order','select','update','insert','delete','single','limit'].forEach(m => { p[m] = chain; });
    return p; };
  return {
    from: () => chain(),
    rpc: () => Promise.resolve({ data:false, error:null }),
    channel: () => ({ on(){ return this; }, subscribe(cb){ if (cb) try { cb('SUBSCRIBED'); } catch(e){} return this; },
                      track(){ return Promise.resolve(); }, untrack(){ return Promise.resolve(); }, presenceState(){ return {}; } }),
    removeChannel: () => {},
    auth: { getSession: () => Promise.resolve({ data:{ session:null } }), signOut: () => Promise.resolve() }
  };
}
function initTestMode(){
  TEST_MODE = true;
  supa = makeStubSupa();
  ME = { id:'test-admin', email:'mestre@teste' };
  MEMBERS = [{ user_id:'test-admin', role:'admin', display_name:'Mestre', ready:true, online:true }];
  const hero = { name:'Herói de Teste', player:'Mestre', slot:0, race:'Humano', subrace:'', cls:'Guerreiro',
    fightingStyle:'Defesa', archetype:'', level:3, xp:0, prof:2,
    abilities:{ FOR:16, DES:14, CON:14, INT:10, SAB:12, CAR:10 },
    maxHp:28, hp:28, ca:16, speed:9, darkvision:0, saves:['FOR','CON'], traits:[], features:[],
    spellSlots:{}, spellsKnown:[], conditions:[], inventory:[], owner:'test-admin', ownerName:'Mestre' };
  ROOM = { id:'test', code:'TESTE', host_id:'test-admin', admin_plays:true, model:'claude-haiku-4-5',
    gm_mode:false, status:'playing', scene_id:'praia', turn_owner:'test-admin',
    state:{ characters:[hero], sceneId:'praia', turnIndex:0, visited:['praia'], revealed:[], combat:null,
            history:[{ role:'scene', text:'🧪 MODO DE TESTE' },
                     { role:'dm', text:'Use o painel 🧪 no canto para disparar o reveal de combate, as artes dos monstros, o dado 3D e o Roteiro. Aqui não há IA nem login — é só pra ver o visual.' }],
            suggestions:[], version:1 } };
  enterGame();
  injectTestPanel();
}
function tpTestRoll(outcome){
  startDiceAnim({ name:'Herói de Teste', tipo:'Atletismo', cd:13 });
  const nat = outcome==='crit' ? 20 : outcome==='fumble' ? 1 : outcome==='fail' ? 5 : 14;
  const card = { role:'roll', nat, mod:5, dice:[nat], total:nat+5, dc:13, crit:nat===20, fumble:nat===1, autoFail:false,
                 dmg: outcome==='crit' ? { total:12, type:'cortante', detail:'2d6(5,3)+4' } : null };
  setTimeout(()=> settleDiceAnim(card), 1500);
}
// ---- COMBATE SIMULADO (modo teste): a engine joga sozinha, p/ ver o motor ----
let TP_SIM = false;
// garante 2 heróis no tabuleiro (mostra a regra de alvo: perto + menor HP)
function tpEnsureParty(st){
  if ((st.characters||[]).length >= 2) return;
  const h2 = JSON.parse(JSON.stringify(st.characters[0]));
  h2.name = 'Aliada de Teste'; h2.owner = 'test-ally'; h2.ownerName = 'Aliada'; h2.player = 'Aliada'; h2.slot = 1;
  h2.maxHp = Math.max(8, Math.round(h2.maxHp * 0.55)); h2.hp = Math.round(h2.maxHp * 0.45);   // menos vida → alvo preferido quando perto
  h2.weapon = 'Arco curto'; h2.weapons = ['Arco curto']; h2.ca = 13;
  st.characters.push(h2);
}
// turno automático de um PC: anda até o inimigo mais próximo e ataca (sem rodar inimigos aqui)
async function tpAutoPcTurn(st, c){
  const m = tacMap(st);
  const live = (st.combat.enemies||[]).filter(e => e.curHp > 0);
  if (!live.length){ advanceTurn(st); await saveState(st); renderGame(); return; }
  const pos = (st.tactical && st.tactical.pos) || {};
  let pp = pos[c.owner];
  // alvo: inimigo mais próximo
  let tgt = live[0], bd = Infinity;
  live.forEach(e => { const ep = pos[e.id]; const d = (ep && pp) ? tacDist(pp, ep) : 99; if (d < bd){ bd = d; tgt = e; } });
  const rng = pcAttackRange(c);
  let ep = pos[tgt.id];
  if (m && pp && ep && tacDist(pp, ep) > rng){                       // longe → anda pra perto
    const reach = tacReachable(st, m, pp, TAC_MOVE); let best = pp, bs = Infinity;
    for (const k of reach.keys()){ const [x,y] = k.split(',').map(Number); const d = tacDist([x,y], ep); if (d < bs){ bs = d; best = [x,y]; } }
    if (best[0] !== pp[0] || best[1] !== pp[1]){ await tacMoveToken(st, c.owner, best[0], best[1]); await mpSleep(380); }
  }
  pp = (st.tactical && st.tactical.pos) ? st.tactical.pos[c.owner] : null; ep = (st.tactical && st.tactical.pos) ? st.tactical.pos[tgt.id] : null;
  if (pp && ep && tacDist(pp, ep) <= rng){ await playerAttack(c.owner, tgt.id, st); await mpSleep(300); }
  if (mpCombatActive(st)) advanceTurn(st);                           // encerra o turno do PC (inimigos rodam no loop externo)
  await saveState(st); renderGame();
}
async function tpRunAuto(st){
  st.busy = true; await saveState(st); renderGame();                // esconde os botões manuais durante a simulação
  let guard = 0;
  while (TP_SIM && mpCombatActive(st) && guard++ < 80){
    const cur = mpCurrentActor(st); if (!cur) break;
    if (cur.kind === 'enemy'){ await mpRunEnemyTurnsAuto(st); await mpSleep(250); continue; }
    const c = st.characters[cur.idx];
    if (!c || c.hp <= 0){ advanceTurn(st); await saveState(st); renderGame(); await mpSleep(120); continue; }
    await tpAutoPcTurn(st, c);
    await mpSleep(420);
  }
  st.busy = false; await saveState(st); renderGame();
}
async function tpSimCombat(encId){
  const st = ROOM.state;
  tpEnsureParty(st);
  const sc = Object.keys(CAMPAIGN.scenes).find(s => CAMPAIGN.scenes[s].combat === encId);   // alinha cena ↔ encontro
  if (sc){ st.sceneId = sc; mpMarkSceneVisited(st); }
  st.combat = null; LAST_COMBAT = false; mpStartCombat(st, encId); renderGame();
  await tpRunAuto(st);
}
// monta um herói de teste de uma classe (nível 3) com truques/magias auto-escolhidos
function tpBuildTestHero(cls){
  const casterAb={ Mago:'INT', Clérigo:'SAB', Druida:'SAB', Feiticeiro:'CAR', Bardo:'CAR', Bruxo:'CAR', Paladino:'CAR', Patrulheiro:'SAB' };
  const sc={ FOR:14, DES:14, CON:14, INT:10, SAB:11, CAR:10 };
  if (casterAb[cls]) sc[casterAb[cls]]=16;
  if (cls==='Guerreiro'||cls==='Bárbaro'||cls==='Paladino') sc.FOR=16;
  const cantrips=(typeof cantripsFor==='function'?cantripsFor(cls):[]).slice(0,3);
  const spells=(typeof spellsL1For==='function'?spellsL1For(cls):[]).slice(0,4);
  let c;
  try { c=buildCharacter({ name:'Herói de Teste', player:'Mestre', slot:0, race:'Humano', cls, scores:sc, cantrips, spells, fightingStyle: cls==='Guerreiro'?'Defesa':null }); }
  catch(e){ try{ console.log('tpBuildTestHero', e.message); }catch(_){} return null; }
  c.level=3; c.prof=2;
  try { recomputeSpellSlots(c); } catch(e){}
  c.maxHp = (c.maxHp||10) + (c.level-1)*6; c.hp=c.maxHp;   // HP jogável p/ teste
  c.owner='test-admin'; c.ownerName='Mestre'; c.player='Mestre'; c.slot=0; c.conditions=[];
  return c;
}
function tpSetHeroClass(cls){
  const st=ROOM.state; const hero=tpBuildTestHero(cls);
  if (!hero){ toast('Não consegui montar '+cls); return; }
  st.characters[0]=hero; st.combat=null; st.tactical=null; LAST_COMBAT=false; PENDING_ABILITY=null; ABILITY_MENU_OPEN=false;
  const slotInfo = hero.spellSlots ? ` · slots nv1: ${hero.spellSlots.max}` : (castableAbilities(hero).length?'':' (sem magias — classe marcial)');
  toast('Herói de teste: '+cls+slotInfo);
  renderGame();
}
function injectTestPanel(){
  if (document.getElementById('testPanel')) return;
  const encs = Object.keys((typeof CAMPAIGN!=='undefined' && CAMPAIGN.encounters) || {});
  const scenes = Object.keys((typeof CAMPAIGN!=='undefined' && CAMPAIGN.scenes) || {});
  const el = document.createElement('div'); el.id = 'testPanel';
  el.innerHTML = `
    <div class="tp-head">🧪 Painel de Teste <span class="tp-build">v${BUILD}</span><button id="tpToggle" title="Mostrar/esconder">▾</button></div>
    <div class="tp-body" id="tpBody">
      <div class="tp-sec"><b>🧙 Classe do herói (testar magias)</b><div class="tp-hint">troca o herói de teste de classe pra testar truques/magias no tabuleiro (Mago/Clérigo conjuram já no nv1)</div><div class="tp-row">
        <select id="tpClass"><option>Guerreiro</option><option>Mago</option><option>Clérigo</option><option>Feiticeiro</option><option>Bardo</option><option>Paladino</option><option>Ladino</option><option>Bárbaro</option></select><button id="tpClassGo">trocar</button></div></div>
      <div class="tp-sec"><b>⚔ Combate — você controla o herói</b><div class="tp-hint">clique no mapa pra mover (alcance = Speed); clique no inimigo pra atacar; ✨ Ações pra magias; os inimigos agem sozinhos</div><div class="tp-row">
        ${encs.map(e=>`<button data-enc="${e}">${escapeHtml(CAMPAIGN.encounters[e].name||e)}</button>`).join('')}
      </div><button data-endc="1" class="wide">encerrar combate</button></div>
      <div class="tp-sec"><b>🤖 Combate simulado (a engine joga sozinha)</b><div class="tp-hint">só pra ASSISTIR — você não controla. Pra jogar, use os botões ⚔ acima.</div><div class="tp-row">
        <select id="tpSimEnc">${encs.map(e=>`<option value="${e}">${escapeHtml(CAMPAIGN.encounters[e].name||e)}</option>`).join('')}</select>
        <button id="tpSimGo">▶ simular</button><button id="tpSimStop">parar</button></div></div>
      <div class="tp-sec"><b>🎲 Dado 3D</b><div class="tp-row">
        <button data-roll="success">sucesso</button><button data-roll="fail">falha</button>
        <button data-roll="crit">crítico</button><button data-roll="fumble">falha crít.</button></div></div>
      <div class="tp-sec"><b>📖 Telas</b><div class="tp-row">
        <button id="tpGuide">Roteiro</button><button id="tpMap">Mapa</button></div></div>
      <div class="tp-sec"><b>👁 Ver HP como</b><div class="tp-row">
        <button id="tpView">alternar</button> <span id="tpViewLbl"></span></div></div>
      <div class="tp-sec"><b>🎬 Ir para cena</b><div class="tp-row">
        <select id="tpScene">${scenes.map(s=>`<option value="${s}">${s}</option>`).join('')}</select><button id="tpGo">ir</button></div></div>
    </div>`;
  document.body.appendChild(el);
  el.querySelectorAll('[data-enc]').forEach(b => b.onclick = async () => {
    const st = ROOM.state, enc = b.dataset.enc;
    const sc = Object.keys(CAMPAIGN.scenes).find(s => CAMPAIGN.scenes[s].combat === enc);   // alinha cena ↔ encontro (mapa tático)
    if (sc){ st.sceneId = sc; mpMarkSceneVisited(st); }
    st.combat = null; LAST_COMBAT = false; mpStartCombat(st, enc); renderGame();
    await tacKickEnemiesIfNeeded(st);   // se um inimigo tem a iniciativa, ele age e a vez volta pro herói
  });
  const endc = el.querySelector('[data-endc]'); if (endc) endc.onclick = () => { TP_SIM = false; if (ROOM.state.combat){ mpEndCombat(ROOM.state, true); renderGame(); } };
  const simGo = el.querySelector('#tpSimGo'), simStop = el.querySelector('#tpSimStop');
  if (simGo) simGo.onclick = () => { if (TP_SIM) return; TP_SIM = true; simGo.disabled = true;
    tpSimCombat(el.querySelector('#tpSimEnc').value).catch(e=>toast('Sim: '+e.message)).finally(()=>{ TP_SIM = false; simGo.disabled = false; }); };
  if (simStop) simStop.onclick = () => { TP_SIM = false; };
  const clsGo = el.querySelector('#tpClassGo'); if (clsGo) clsGo.onclick = () => tpSetHeroClass(el.querySelector('#tpClass').value);
  el.querySelectorAll('[data-roll]').forEach(b => b.onclick = () => tpTestRoll(b.dataset.roll));
  el.querySelector('#tpGuide').onclick = () => openGuide();
  el.querySelector('#tpMap').onclick = () => openMapMp();
  const tpUpdateView = () => { const l = el.querySelector('#tpViewLbl'); if (l) l.textContent = ROOM.admin_plays ? '🛡 Jogador (oculto)' : '👑 Mestre (exato)'; };
  el.querySelector('#tpView').onclick = () => { ROOM.admin_plays = !ROOM.admin_plays; tpUpdateView(); renderGame(); };
  tpUpdateView();
  el.querySelector('#tpGo').onclick = () => { const s = el.querySelector('#tpScene').value; const st = ROOM.state; st.sceneId = s; st.combat = null; LAST_COMBAT = false; mpMarkSceneVisited(st); renderGame(); };
  el.querySelector('#tpToggle').onclick = () => { const b = document.getElementById('tpBody'); b.style.display = b.style.display==='none' ? '' : 'none'; };
}

const BUILD = '20260627z';   // carimbo de versão — confira no console (F12) se está no código novo
try { console.log('%cStormwreck build ' + BUILD, 'color:#e8843c;font-weight:bold'); } catch(e){}
if (new URLSearchParams(location.search).get('teste') === '1') initTestMode();
else initAuth();
