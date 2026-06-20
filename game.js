// ============================================================
// game.js — Motor do jogo
// Gerencia: estado, telas, criação de personagem, rolagem de
// dados (justa, no código), e comunicação com a IA (Haiku).
// ============================================================

// ---------- CONFIG SUPABASE (chaves públicas, protegidas por RLS) ----------
const SUPA_URL = 'https://qyqvnokqkukhecnpykds.supabase.co';
const SUPA_KEY = 'sb_publishable_7Pnila08_CO32ae28pIM5g_3WACbxV1';
let supa = null;

// ---------- ESTADO GLOBAL ----------
const STATE = {
  user: null,
  apiKey: '',
  model: 'claude-haiku-4-5',
  characters: [],       // [{...}, {...}]
  activeChar: 0,        // de quem é a vez
  sceneId: 'chegada',
  history: [],          // mensagens da conversa com a IA
  inCombat: false,
  combat: null,         // estado de combate ativo
  creationSlot: 0       // 0 ou 1 durante criação
};

// rascunho de criação do personagem atual
let DRAFT = { race:null, subrace:null, cls:null, scores:null, assigned:{},
              skills:[], skillsExtra:[], asiChoices:[], armor:'Nenhuma', shield:false, weapon:null };

// ---------- UTIL DOM ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#'+id).classList.add('active');
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ---------- DADOS (rolagem justa) ----------
function rollDie(s) { return Math.floor(Math.random() * s) + 1; }
function rollDiceArr(count, sides) { return Array.from({length:count}, () => rollDie(sides)); }
function rollAbility() {
  const r = rollDiceArr(4,6).sort((a,b)=>b-a);
  const dropped = r.pop();
  return r.reduce((s,x)=>s+x,0);
}
function d20(mod=0, opts={}) {
  let a = rollDie(20), b = null, chosen = a;
  if (opts.adv || opts.dis) { b = rollDie(20); chosen = opts.adv ? Math.max(a,b) : Math.min(a,b); }
  return { nat: chosen, total: chosen+mod, mod, dice:[a,b].filter(x=>x!==null), crit: chosen===20, fumble: chosen===1 };
}
// rola expressão tipo "1d6+2" ou "2d6+4"
function rollExpr(expr) {
  const m = expr.match(/(\d+)d(\d+)(?:\+(\d+))?/);
  if (!m) return { total:0, rolls:[] };
  const [, c, s, bonus] = m;
  const rolls = rollDiceArr(+c, +s);
  const total = rolls.reduce((a,b)=>a+b,0) + (bonus ? +bonus : 0);
  return { total, rolls, bonus: bonus?+bonus:0 };
}

// d20 com o traço Sortudo do Halfling: re-rola um 1 natural uma vez.
function d20ForChar(c, mod=0, opts={}) {
  const r = d20(mod, opts);
  const lucky = c && c.racialEffects && c.racialEffects.flags && c.racialEffects.flags.rerollNat1;
  if (lucky && r.nat === 1) { const r2 = d20(mod, {}); r2.lucky = true; return r2; }
  return r;
}

// rola o dano de uma arma; dobra os DADOS no crítico; Ataques Selvagens soma 1 dado no crit.
function rollDamage(spec, crit) {
  if (!spec.dmg) {
    const total = (spec.flat || 1) + (spec.bonus || 0);
    return { total, detail: `${spec.flat||1}${spec.bonus?fmtMod(spec.bonus):''}` };
  }
  const m = spec.dmg.match(/(\d+)d(\d+)/);
  let nDice = +m[1]; const sides = +m[2];
  if (crit) nDice *= 2;
  if (crit && spec.savage) nDice += 1;   // Ataques Selvagens: 1 dado extra da arma
  const rolls = rollDiceArr(nDice, sides);
  const total = rolls.reduce((a,b)=>a+b,0) + (spec.bonus || 0);
  return { total, detail: `${nDice}d${sides}${spec.bonus?fmtMod(spec.bonus):''} (${rolls.join(',')})` };
}

// rola o dano de um ATAQUE com features (Armas Grandes re-rola 1/2, Ataque Furtivo, crit dobra tudo).
function rollAttackDamage(ap, crit) {
  let total = 0; const parts = [];
  if (ap.dmg) {
    const m = ap.dmg.match(/(\d+)d(\d+)/);
    let n = +m[1]; const sides = +m[2];
    if (crit) n *= 2;
    if (crit && ap.savage) n += 1;                       // Ataques Selvagens (Meio-Orc)
    const r = [];
    for (let k=0;k<n;k++){ let v=rollDie(sides); if (ap.gwf && (v===1||v===2)) v=rollDie(sides); r.push(v); }
    total += r.reduce((a,b)=>a+b,0); parts.push(`${n}d${sides}(${r.join(',')})`);
  } else { total += (ap.flat||1); parts.push(`${ap.flat||1}`); }
  if (ap.sneak) {                                         // Ataque Furtivo (Ladino)
    let n = ap.sneak; if (crit) n *= 2;
    const r = []; for (let k=0;k<n;k++) r.push(rollDie(6));
    total += r.reduce((a,b)=>a+b,0); parts.push(`Furtivo ${n}d6(${r.join(',')})`);
  }
  if (ap.bonus) { total += ap.bonus; parts.push(fmtMod(ap.bonus)); }
  return { total, detail: parts.join(' + ') };
}

// =====================================================
//  TELA 1 — SETUP
// =====================================================
// =====================================================
//  AUTENTICAÇÃO (Supabase) — porta de entrada
// =====================================================
let signupMode = false;

async function initAuth() {
  supa = window.supabase.createClient(SUPA_URL, SUPA_KEY);

  $('#loginBtn').onclick = doAuth;
  $('#toSignupBtn').onclick = () => { signupMode = !signupMode; updateLoginMode(); $('#loginStatus').innerHTML = ''; };
  $('#loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAuth(); } });
  $('#loginEmail').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#loginPass').focus(); } });

  const { data: { session } } = await supa.auth.getSession();
  if (session) enterApp(session); else showScreen('screen-login');
}

function updateLoginMode() {
  $('#loginTitle').textContent  = signupMode ? 'Criar conta' : 'Entrar';
  $('#loginBtn').textContent    = signupMode ? 'Criar conta →' : 'Entrar →';
  $('#toSignupBtn').textContent = signupMode ? 'Já tenho conta' : 'Criar conta';
  $('#loginHint').textContent   = signupMode ? 'Crie sua conta de acesso (uma vez).' : 'Use seu e-mail e senha.';
}

function loginStatus(msg, ok) { $('#loginStatus').innerHTML = `<div class="${ok?'ok':'err'}">${msg}</div>`; }

async function doAuth() {
  const email = $('#loginEmail').value.trim();
  const pass = $('#loginPass').value;
  if (!email || !pass) { loginStatus('Preencha e-mail e senha.', false); return; }
  loginStatus(signupMode ? 'Criando conta…' : 'Entrando…', true);
  try {
    const { data, error } = signupMode
      ? await supa.auth.signUp({ email, password: pass })
      : await supa.auth.signInWithPassword({ email, password: pass });
    if (error) { loginStatus('Erro: ' + error.message, false); return; }
    if (signupMode && !data.session) {
      loginStatus('Conta criada. Confirme pelo e-mail (se solicitado) e então entre.', true);
      signupMode = false; updateLoginMode(); return;
    }
    const { data: { session } } = await supa.auth.getSession();
    if (session) enterApp(session); else loginStatus('Não foi possível iniciar a sessão.', false);
  } catch (e) { loginStatus('Erro: ' + e.message, false); }
}

async function doLogout() {
  try { await supa.auth.signOut(); } catch (e) {}
  STATE.user = null; STATE.characters = []; STATE.history = [];
  $('#loginPass').value = '';
  showScreen('screen-login');
}

function enterApp(session) {
  STATE.user = session.user;
  if ($('#userEmail')) $('#userEmail').textContent = session.user.email;
  initSetup();
}

// =====================================================
//  TELA 1 — SETUP (pós-login)
// =====================================================
async function initSetup() {
  showScreen('screen-setup');
  STATE.model = $('#modelChoice').value;
  $('#modelChoice').onchange = () => { STATE.model = $('#modelChoice').value; };
  $('#toCreationBtn').onclick = () => { STATE.model = $('#modelChoice').value; startCreation(); };
  $('#loadSaveBtn').onclick = loadGame;
  $('#logoutBtn').onclick = doLogout;

  // há jogo salvo no servidor?
  try {
    const { data } = await supa.from('saves').select('slot').eq('user_id', STATE.user.id).limit(1);
    $('#loadSaveBtn').style.display = (data && data.length) ? 'inline-flex' : 'none';
  } catch (e) {}
}

function showKeyStatus(msg, ok) {
  $('#keyStatus').innerHTML = `<div class="${ok?'ok':'err'}">${msg}</div>`;
}

// =====================================================
//  TELA 2 — CRIAÇÃO DE PERSONAGEM
// =====================================================
function startCreation() {
  STATE.creationSlot = 0;
  STATE.characters = [];
  showScreen('screen-creation');
  renderCreation();
}

function renderCreation() {
  DRAFT = { race:null, subrace:null, cls:null, scores:null, assigned:{},
            skills:[], skillsExtra:[], asiChoices:[], armor:'Nenhuma', shield:false, weapon:null,
            fightingStyle:null, archetype:null };
  $('#creationStepLabel').textContent = `Aventureiro ${STATE.creationSlot+1} de 2`;
  $('#charName').value = '';
  $('#playerName').value = '';

  // raças
  $('#raceGrid').innerHTML = Object.entries(RULES.races).map(([name, r]) => {
    const asi = Object.entries(r.asi).map(([k,v])=>`${k}+${v}`).join(' ');
    const extra = r.asiChoice ? ` +1×${r.asiChoice.count}` : '';
    const sub = (r.subraces && Object.keys(r.subraces).length) ? ' · sub-raças' : '';
    return `<div class="choice" data-race="${name}">
      <div class="name">${name}</div>
      <div class="meta">${asi}${extra}${r.darkvision?' · darkvision':''}${sub}</div>
    </div>`;
  }).join('');

  // classes
  $('#classGrid').innerHTML = Object.entries(RULES.classes).map(([name, c]) => {
    const sk = c.spell ? ` · conjura ${c.spell.ability}` : '';
    return `<div class="choice" data-class="${name}">
      <div class="name">${name}</div>
      <div class="meta">d${c.hitDie} · ${c.primary.join('/')}${sk}</div>
    </div>`;
  }).join('');

  // seções dependentes começam ocultas
  ['#subraceSection','#asiChoiceSection','#skillsSection','#equipmentSection','#classOptionsSection'].forEach(s=>$(s).classList.add('hide'));

  // atributos vazios
  renderScorePool();
  renderAbilityGrid();

  // eventos
  $$('#raceGrid .choice').forEach(el => el.onclick = () => {
    $$('#raceGrid .choice').forEach(c=>c.classList.remove('selected'));
    el.classList.add('selected');
    DRAFT.race = el.dataset.race; DRAFT.subrace = null;
    DRAFT.skills = []; DRAFT.skillsExtra = []; DRAFT.asiChoices = [];
    renderSubraces(); renderAsiChoice(); renderSkills(); renderEquipment();
    renderAbilityGrid(); checkCreationReady();
  });
  $$('#classGrid .choice').forEach(el => el.onclick = () => {
    $$('#classGrid .choice').forEach(c=>c.classList.remove('selected'));
    el.classList.add('selected');
    DRAFT.cls = el.dataset.class; DRAFT.skills = [];
    DRAFT.armor = null; DRAFT.weapon = null;   // recalcula equipamento padrão p/ a nova classe
    DRAFT.fightingStyle = null; DRAFT.archetype = null;
    renderSkills(); renderEquipment(); renderClassOptions(); checkCreationReady();
  });
  $('#rollScoresBtn').onclick = doRollScores;
  $('#resetScoresBtn').onclick = () => { DRAFT.scores=null; DRAFT.assigned={}; renderScorePool(); renderAbilityGrid(); updateAC(); checkCreationReady(); };
  $('#charName').oninput = checkCreationReady;
  $('#playerName').oninput = checkCreationReady;
  $('#charNextBtn').onclick = commitCharacter;
}

// ---- Sub-raça ----
function renderSubraces() {
  const sec = $('#subraceSection'), grid = $('#subraceGrid');
  const subs = DRAFT.race ? RULES.races[DRAFT.race].subraces : null;
  if (!subs || !Object.keys(subs).length) { sec.classList.add('hide'); grid.innerHTML=''; return; }
  sec.classList.remove('hide');
  grid.innerHTML = Object.entries(subs).map(([name, sr]) => {
    const asi = Object.entries(sr.asi||{}).map(([k,v])=>`${k}+${v}`).join(' ');
    return `<div class="choice" data-subrace="${name}">
      <div class="name">${name}</div><div class="meta">${asi||'—'}</div></div>`;
  }).join('');
  $$('#subraceGrid .choice').forEach(el => el.onclick = () => {
    $$('#subraceGrid .choice').forEach(c=>c.classList.remove('selected'));
    el.classList.add('selected');
    DRAFT.subrace = el.dataset.subrace;
    renderSkills(); renderEquipment(); renderAbilityGrid(); checkCreationReady();
  });
}

// ---- Escolha de ASI (Meio-Elfo: +1 em dois) ----
function renderAsiChoice() {
  const sec = $('#asiChoiceSection'), grid = $('#asiChoiceGrid');
  const rc = DRAFT.race ? RULES.races[DRAFT.race].asiChoice : null;
  if (!rc) { sec.classList.add('hide'); grid.innerHTML=''; return; }
  sec.classList.remove('hide');
  const exclude = rc.exclude || [];
  $('#asiChoiceNote').textContent = `Escolhidos ${DRAFT.asiChoices.length}/${rc.count}`;
  $('#asiChoiceNote').classList.toggle('done', DRAFT.asiChoices.length===rc.count);
  grid.innerHTML = RULES.abilities.map(ab => {
    const off = exclude.includes(ab);
    const sel = DRAFT.asiChoices.includes(ab);
    return `<div class="choice ${sel?'selected':''} ${off?'':''}" data-asi="${ab}" style="${off?'opacity:.35;pointer-events:none':''}">
      <div class="name">${ab}</div><div class="meta">${RULES.abilityNames[ab]}${off?' (já +2)':' +1'}</div></div>`;
  }).join('');
  $$('#asiChoiceGrid .choice').forEach(el => el.onclick = () => {
    const ab = el.dataset.asi;
    const i = DRAFT.asiChoices.indexOf(ab);
    if (i>=0) DRAFT.asiChoices.splice(i,1);
    else if (DRAFT.asiChoices.length < rc.count) DRAFT.asiChoices.push(ab);
    renderAsiChoice(); renderAbilityGrid(); updateAC(); checkCreationReady();
  });
}

// ---- Perícias (classe + extra racial) ----
function renderSkills() {
  const sec = $('#skillsSection');
  if (!DRAFT.cls) { sec.classList.add('hide'); return; }
  sec.classList.remove('hide');
  const need = RULES.classes[DRAFT.cls].skillCount;
  const pool = skillOptionsFor(DRAFT.cls);
  const fixed = DRAFT.race ? fixedRacialSkills(DRAFT.race, DRAFT.subrace) : [];
  // remove de DRAFT.skills qualquer que tenha virado fixa ou saído do pool
  DRAFT.skills = DRAFT.skills.filter(s => pool.includes(s) && !fixed.includes(s));

  $('#skillsNote').textContent = `Escolha ${need} (de ${DRAFT.cls}). Selecionadas: ${DRAFT.skills.length}/${need}`;
  $('#skillsNote').classList.toggle('done', DRAFT.skills.length===need);
  const atMax = DRAFT.skills.length >= need;
  $('#skillsGrid').innerHTML = pool.map(s => {
    if (fixed.includes(s)) return `<div class="skill-chip locked">${s}<span class="tag">raça</span></div>`;
    const sel = DRAFT.skills.includes(s);
    const dis = !sel && atMax;
    return `<div class="skill-chip ${sel?'selected':''} ${dis?'disabled':''}" data-skill="${s}">${s}<span class="tag">${RULES.skills[s]}</span></div>`;
  }).join('');
  $$('#skillsGrid .skill-chip[data-skill]').forEach(el => el.onclick = () => {
    const s = el.dataset.skill; const i = DRAFT.skills.indexOf(s);
    if (i>=0) DRAFT.skills.splice(i,1);
    else if (DRAFT.skills.length < need) DRAFT.skills.push(s);
    renderSkills(); checkCreationReady();
  });

  // extra racial (Meio-Elfo: 2 quaisquer)
  const extraN = DRAFT.race ? (RULES.races[DRAFT.race].skillChoiceExtra||0) : 0;
  const wrap = $('#skillsExtraWrap');
  if (!extraN) { wrap.classList.add('hide'); DRAFT.skillsExtra=[]; return; }
  wrap.classList.remove('hide');
  const taken = new Set([...DRAFT.skills, ...fixed]);
  DRAFT.skillsExtra = DRAFT.skillsExtra.filter(s => !taken.has(s));
  $('#skillsExtraNote').textContent = `Versatilidade em Perícia — escolha ${extraN} quaisquer: ${DRAFT.skillsExtra.length}/${extraN}`;
  $('#skillsExtraNote').classList.toggle('done', DRAFT.skillsExtra.length===extraN);
  const extraMax = DRAFT.skillsExtra.length >= extraN;
  $('#skillsExtraGrid').innerHTML = Object.keys(RULES.skills).map(s => {
    if (taken.has(s)) return `<div class="skill-chip disabled">${s}<span class="tag">${RULES.skills[s]}</span></div>`;
    const sel = DRAFT.skillsExtra.includes(s);
    const dis = !sel && extraMax;
    return `<div class="skill-chip ${sel?'selected':''} ${dis?'disabled':''}" data-xskill="${s}">${s}<span class="tag">${RULES.skills[s]}</span></div>`;
  }).join('');
  $$('#skillsExtraGrid .skill-chip[data-xskill]').forEach(el => el.onclick = () => {
    const s = el.dataset.xskill; const i = DRAFT.skillsExtra.indexOf(s);
    if (i>=0) DRAFT.skillsExtra.splice(i,1);
    else if (DRAFT.skillsExtra.length < extraN) DRAFT.skillsExtra.push(s);
    renderSkills(); checkCreationReady();
  });
}

// ---- Equipamento (armadura, escudo, arma) ----
function defaultArmor(cls, race, subrace) {
  if (RULES.classes[cls].unarmoredDefense) return 'Nenhuma';
  const av = availableArmors(cls, race, subrace);
  for (const pref of ['Cota de Malha','Brunea','Couro Batido']) if (av.includes(pref)) return pref;
  return 'Nenhuma';
}
function renderEquipment() {
  const sec = $('#equipmentSection');
  if (!DRAFT.cls) { sec.classList.add('hide'); return; }
  sec.classList.remove('hide');
  const armors = availableArmors(DRAFT.cls, DRAFT.race, DRAFT.subrace);
  if (!armors.includes(DRAFT.armor)) DRAFT.armor = defaultArmor(DRAFT.cls, DRAFT.race, DRAFT.subrace);
  $('#armorSelect').innerHTML = armors.map(a=>`<option value="${a}" ${a===DRAFT.armor?'selected':''}>${a}${a==='Nenhuma'?'':` (${RULES.armor[a].base}${RULES.armor[a].dexCap===0?'':'+DES'})`}</option>`).join('');
  $('#armorSelect').onchange = e => { DRAFT.armor = e.target.value; updateAC(); checkCreationReady(); };

  const weapons = availableWeapons(DRAFT.cls, DRAFT.race, DRAFT.subrace).sort();
  if (!weapons.includes(DRAFT.weapon)) DRAFT.weapon = weapons[0] || null;
  $('#weaponSelect').innerHTML = weapons.map(w=>`<option value="${w}" ${w===DRAFT.weapon?'selected':''}>${w} (${RULES.weapons[w].dmg} ${RULES.weapons[w].type})</option>`).join('');
  $('#weaponSelect').onchange = e => { DRAFT.weapon = e.target.value; checkCreationReady(); };

  const canShield = canUseShield(DRAFT.cls, DRAFT.race, DRAFT.subrace);
  const row = $('#shieldRow'); row.classList.toggle('disabled', !canShield);
  if (!canShield) DRAFT.shield = false;
  $('#shieldCheck').checked = DRAFT.shield;
  $('#shieldCheck').onchange = e => { DRAFT.shield = e.target.checked; updateAC(); };
  updateAC();
}

// abilities atuais do rascunho (scores atribuídos + ASI racial/escolha; fallback 10)
function draftAbilities() {
  const base = {};
  RULES.abilities.forEach(a => {
    const idx = DRAFT.assigned[a];
    base[a] = (DRAFT.scores && idx!==undefined) ? DRAFT.scores[idx] : 10;
  });
  return DRAFT.race ? applyASI(base, DRAFT.race, DRAFT.subrace, DRAFT.asiChoices) : base;
}
function updateAC() {
  if (!DRAFT.cls) return;
  let ac = computeAC(DRAFT.cls, draftAbilities(), DRAFT.armor, DRAFT.shield);
  if (DRAFT.fightingStyle === 'Defesa' && DRAFT.armor && DRAFT.armor !== 'Nenhuma') ac += 1;
  const el = $('#acPreview'); if (el) el.textContent = ac;
}

// ---- Opções de classe: Estilo de Luta (Guerreiro nv1) e Subclasse (nv1) ----
function renderClassOptions() {
  const sec = $('#classOptionsSection');
  if (!DRAFT.cls) { sec.classList.add('hide'); return; }
  const cls = DRAFT.cls;
  const hasStyle = fightingStyleLevel(cls) === 1;                 // no nível 1, só Guerreiro
  const subAtL1 = RULES.classes[cls].subclassLevel === 1;         // Bruxo, Clérigo, Feiticeiro
  if (!hasStyle && !subAtL1) { sec.classList.add('hide'); return; }
  sec.classList.remove('hide');

  const fw = $('#fightingStyleWrap');
  if (hasStyle) {
    fw.classList.remove('hide');
    $('#fightingStyleGrid').innerHTML = Object.entries(RULES.fightingStyles).map(([name,desc])=>
      `<div class="choice ${DRAFT.fightingStyle===name?'selected':''}" data-fs="${name}"><div class="name">${name}</div><div class="meta">${desc}</div></div>`).join('');
    $$('#fightingStyleGrid .choice').forEach(el=>el.onclick=()=>{ DRAFT.fightingStyle=el.dataset.fs; renderClassOptions(); updateAC(); checkCreationReady(); });
  } else { fw.classList.add('hide'); DRAFT.fightingStyle=null; }

  const aw = $('#archetypeWrap');
  if (subAtL1) {
    aw.classList.remove('hide');
    $('#archetypeGrid').innerHTML = (RULES.classes[cls].subclasses||[]).map(name=>
      `<div class="choice ${DRAFT.archetype===name?'selected':''}" data-arch="${name}"><div class="name">${name}</div></div>`).join('');
    $$('#archetypeGrid .choice').forEach(el=>el.onclick=()=>{ DRAFT.archetype=el.dataset.arch; renderClassOptions(); checkCreationReady(); });
  } else { aw.classList.add('hide'); DRAFT.archetype=null; }
}

function doRollScores() {
  DRAFT.scores = Array.from({length:6}, () => rollAbility());
  DRAFT.assigned = {};
  renderScorePool();
  renderAbilityGrid();
  $('#abilityHint').textContent = 'Clique num valor abaixo e depois num atributo para atribuí-lo.';
  checkCreationReady();
}

let pendingScore = null;
function renderScorePool() {
  if (!DRAFT.scores) { $('#scorePool').innerHTML = '<span class="hint">Nenhum atributo rolado ainda.</span>'; return; }
  const usedIdx = Object.values(DRAFT.assigned);
  $('#scorePool').innerHTML = DRAFT.scores.map((s, i) => {
    const used = usedIdx.includes(i);
    return `<div class="chip ${used?'used':''}" data-idx="${i}">${s}</div>`;
  }).join('');
  $$('#scorePool .chip').forEach(el => el.onclick = () => {
    if (el.classList.contains('used')) return;
    $$('#scorePool .chip').forEach(c=>c.style.outline='');
    pendingScore = +el.dataset.idx;
    el.style.outline = '2px solid var(--ember)';
  });
}

function abilityRaceBonus(ab) {
  if (!DRAFT.race) return 0;
  const r = RULES.races[DRAFT.race];
  let b = r.asi[ab] || 0;
  if (DRAFT.subrace && r.subraces[DRAFT.subrace]) b += (r.subraces[DRAFT.subrace].asi || {})[ab] || 0;
  if (r.asiChoice && DRAFT.asiChoices.includes(ab)) b += r.asiChoice.amount;
  return b;
}
function renderAbilityGrid() {
  $('#abilityGrid').innerHTML = RULES.abilities.map(ab => {
    const idx = DRAFT.assigned[ab];
    const score = idx!==undefined ? DRAFT.scores[idx] : null;
    const raceBonus = abilityRaceBonus(ab);
    const finalScore = score!==null ? score + raceBonus : null;
    const mod = finalScore!==null ? abilityMod(finalScore) : null;
    return `<div class="ability-box ${score!==null?'assigned':''}" data-ab="${ab}">
      <div class="ab-label">${ab}${raceBonus?` <span style="color:var(--myco)">+${raceBonus}</span>`:''}</div>
      <div class="ab-score">${finalScore!==null?finalScore:'—'}</div>
      <div class="ab-mod">${mod!==null?fmtMod(mod):''}</div>
    </div>`;
  }).join('');
  $$('#abilityGrid .ability-box').forEach(el => el.onclick = () => {
    const ab = el.dataset.ab;
    if (pendingScore !== null) {
      // remove esse score de qualquer atributo anterior
      for (const k in DRAFT.assigned) if (DRAFT.assigned[k]===pendingScore) delete DRAFT.assigned[k];
      DRAFT.assigned[ab] = pendingScore;
      pendingScore = null;
      renderScorePool(); renderAbilityGrid(); updateAC(); checkCreationReady();
    } else if (DRAFT.assigned[ab] !== undefined) {
      // clicar num atribuído remove
      delete DRAFT.assigned[ab];
      renderScorePool(); renderAbilityGrid(); updateAC(); checkCreationReady();
    }
  });
}

function checkCreationReady() {
  const r = DRAFT.race ? RULES.races[DRAFT.race] : null;
  const allAssigned = DRAFT.scores && Object.keys(DRAFT.assigned).length === 6;
  const subOk = !r || !Object.keys(r.subraces||{}).length || DRAFT.subrace;
  const asiOk = !r || !r.asiChoice || DRAFT.asiChoices.length === r.asiChoice.count;
  const skillsOk = DRAFT.cls && DRAFT.skills.length === RULES.classes[DRAFT.cls].skillCount;
  const extraN = r ? (r.skillChoiceExtra||0) : 0;
  const extraOk = DRAFT.skillsExtra.length === extraN;
  const styleOk = !DRAFT.cls || fightingStyleLevel(DRAFT.cls) !== 1 || DRAFT.fightingStyle;
  const archOk  = !DRAFT.cls || RULES.classes[DRAFT.cls].subclassLevel !== 1 || DRAFT.archetype;
  const ready = DRAFT.race && subOk && asiOk && DRAFT.cls && allAssigned && skillsOk && extraOk && styleOk && archOk
    && $('#charName').value.trim() && $('#playerName').value.trim();
  $('#charNextBtn').disabled = !ready;
  $('#charNextBtn').textContent = STATE.creationSlot === 0 ? 'Próximo aventureiro →' : 'Começar aventura →';
}

function commitCharacter() {
  const scores = {};
  RULES.abilities.forEach(ab => { scores[ab] = DRAFT.scores[DRAFT.assigned[ab]]; });
  const char = buildCharacter({
    name: $('#charName').value.trim(),
    player: $('#playerName').value.trim(),
    slot: STATE.creationSlot,
    race: DRAFT.race, subrace: DRAFT.subrace, cls: DRAFT.cls, scores,
    asiChoices: DRAFT.asiChoices,
    skills: [...DRAFT.skills, ...DRAFT.skillsExtra],
    armor: DRAFT.armor, shield: DRAFT.shield,
    weapons: DRAFT.weapon ? [DRAFT.weapon] : [],
    fightingStyle: DRAFT.fightingStyle, archetype: DRAFT.archetype
  });
  STATE.characters.push(char);

  if (STATE.creationSlot === 0) {
    STATE.creationSlot = 1;
    renderCreation();
    window.scrollTo(0,0);
  } else {
    startGame();
  }
}

// =====================================================
//  TELA 3 — JOGO
// =====================================================
function startGame() {
  showScreen('screen-game');
  STATE.sceneId = 'chegada';
  STATE.activeChar = 0;
  STATE.history = [];
  renderSidebar();
  $('#rollLogList').innerHTML = '<div class="rolllog-empty">Nenhuma rolagem ainda.</div>';
  $('#saveBtn').onclick = saveGame;
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('mobile-open');
  $('#rollsToggleBtn').onclick = () => $('.game-layout').classList.toggle('rolls-hidden');
  $('#hideRollsBtn').onclick = () => $('.game-layout').classList.add('rolls-hidden');
  $('#sendBtn').onclick = submitAction;
  $('#actionInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAction(); }
  });
  // primeira narração da cena de abertura
  beginScene('chegada', true);
}

function renderSidebar() {
  const sb = $('#charPanel');
  const restBar = `<div class="rest-bar"><button class="rest-btn" id="shortRestBtn">☕ Descanso Curto</button><button class="rest-btn" id="longRestBtn">🌙 Descanso Longo</button></div>`;
  sb.innerHTML = restBar + STATE.characters.map((c, i) => {
    const pct = Math.max(0, Math.round(c.hp / c.maxHp * 100));
    const sub = `${c.race}${c.subrace?` (${c.subrace})`:''} ${c.cls}${c.fightingStyle?` · ${c.fightingStyle}`:''} Nv${c.level}`;
    return `<div class="char-card ${i===STATE.activeChar?'active-turn':''}">
      <div class="cc-name">${c.name}</div>
      <div class="cc-sub"><span class="player-tag ${i===0?'p1':'p2'}">${c.player}</span> · ${sub}</div>
      <div class="hpbar-wrap"><div class="hpbar" style="width:${pct}%"></div><div class="hpbar-label">${c.hp} / ${c.maxHp} HP</div></div>
      <div class="stat-row"><span>AC <b>${c.ca}</b></span><span>Speed <b>${c.speed}m</b></span><span>Prof <b>+${c.prof}</b></span></div>
      <div class="stat-row"><span>XP <b>${c.xp}/${RULES.xpTable[c.level+1]||'max'}</b></span></div>
      <div class="mini-abilities">${RULES.abilities.map(ab=>`
        <div class="mini-ab"><div class="l">${ab}</div><div class="v">${c.abilities[ab]} <span style="color:var(--stone-400);font-size:0.7rem">${fmtMod(abilityMod(c.abilities[ab]))}</span></div></div>
      `).join('')}</div>
      ${resourcesHtml(c, i)}
      ${conditionsHtml(c, i)}
    </div>`;
  }).join('');
  $('#shortRestBtn').onclick = () => doRest('short');
  $('#longRestBtn').onclick = () => doRest('long');
  attachResourceHandlers();
}

// HTML dos recursos clicáveis da ficha (slots, Fúria, contadores, pool).
function resourcesHtml(c, i) {
  const res = classResources(c);
  if (!res.length) return '';
  const rows = res.map(r => {
    if (r.kind === 'slots') {
      const left = r.max - (c.spellSlots ? c.spellSlots.used : 0);
      const pips = Array.from({length:r.max},(_,k)=>`<span class="res-pip ${k<left?'full':''}" data-ci="${i}" data-rk="slot" data-idx="${k}"></span>`).join('');
      return `<div class="res-row"><span class="res-label">${r.label}</span><span class="res-pips">${pips}</span></div>`;
    }
    if (r.kind === 'toggle') {   // Fúria
      const left = r.max - (c.resUsed[r.key]||0);
      const pips = Array.from({length:r.max},(_,k)=>`<span class="res-pip ${k<left?'full':''}"></span>`).join('');
      return `<div class="res-row"><button class="res-btn ${c.raging?'on':''}" data-ci="${i}" data-rk="rage">${c.raging?'Fúria ATIVA ●':'Fúria'}</button><span class="res-pips" title="usos">${pips}</span></div>`;
    }
    if (r.kind === 'counter') {
      const left = r.max - (c.resUsed[r.key]||0);
      const pips = Array.from({length:r.max},(_,k)=>`<span class="res-pip ${k<left?'full':''}" data-ci="${i}" data-rk="ctr" data-key="${r.key}" data-idx="${k}"></span>`).join('');
      return `<div class="res-row"><span class="res-label">${r.label}</span><span class="res-pips">${pips}</span></div>`;
    }
    if (r.kind === 'pool') {
      const left = r.max - (c.resUsed[r.key]||0);
      return `<div class="res-row"><span class="res-label">${r.label}</span><span class="res-pool"><button class="res-mini" data-ci="${i}" data-rk="pool-" data-key="${r.key}">−5</button><b>${left}</b>/${r.max}<button class="res-mini" data-ci="${i}" data-rk="poolr" data-key="${r.key}">↺</button></span></div>`;
    }
    return '';
  }).join('');
  return `<div class="res-block">${rows}</div>`;
}

function attachResourceHandlers() {
  $$('#charPanel [data-rk]').forEach(el => el.onclick = () => {
    const c = STATE.characters[+el.dataset.ci];
    const rk = el.dataset.rk;
    if (rk === 'slot') {
      const idx = +el.dataset.idx, left = c.spellSlots.max - c.spellSlots.used;
      c.spellSlots.used += (idx < left) ? 1 : -1;          // pip cheio gasta; vazio recupera
      c.spellSlots.used = Math.max(0, Math.min(c.spellSlots.max, c.spellSlots.used));
    } else if (rk === 'ctr') {
      const key = el.dataset.key, idx = +el.dataset.idx;
      const r = classResources(c).find(x=>x.key===key);
      const left = r.max - (c.resUsed[key]||0);
      c.resUsed[key] = Math.max(0, Math.min(r.max, (c.resUsed[key]||0) + ((idx < left) ? 1 : -1)));
    } else if (rk === 'rage') {
      if (c.raging) { c.raging = false; }                  // desligar não devolve o uso
      else { const left = ragesByLevel(c.level) - (c.resUsed.rage||0);
             if (left > 0) { c.raging = true; c.resUsed.rage = (c.resUsed.rage||0)+1; }
             else toast('Sem usos de Fúria. Descanse.'); }
    } else if (rk === 'pool-') {
      const key = el.dataset.key, r = classResources(c).find(x=>x.key===key);
      const left = r.max - (c.resUsed[key]||0);
      c.resUsed[key] = (c.resUsed[key]||0) + Math.min(5, left);
    } else if (rk === 'poolr') {
      c.resUsed[el.dataset.key] = 0;
    }
    renderSidebar();
  });
  // condições: adicionar (select) e remover (chip)
  $$('#charPanel .cond-add').forEach(sel => sel.onchange = () => {
    const c = STATE.characters[+sel.dataset.ci], v = sel.value;
    if (v && !(c.conditions||[]).includes(v)) c.conditions = (c.conditions||[]).concat(v);
    renderSidebar();
  });
  $$('#charPanel .cond-chip').forEach(el => el.onclick = () => {
    const c = STATE.characters[+el.dataset.ci];
    c.conditions = (c.conditions||[]).filter(n => n !== el.dataset.cn);
    renderSidebar();
  });
}

// Chips de condição (Apêndice A) na ficha — clicáveis para adicionar/remover.
function conditionsHtml(c, i) {
  const opts = Object.keys(RULES.conditions).map(n=>`<option value="${n}">${n}</option>`).join('');
  const chips = (c.conditions||[]).map(n=>`<span class="cond-chip" data-ci="${i}" data-cn="${n}" title="${RULES.conditions[n].desc}">${n} ✕</span>`).join('');
  return `<div class="cond-block">
    <select class="cond-add" data-ci="${i}"><option value="">+ condição</option>${opts}</select>
    <div class="cond-chips">${chips}</div>
  </div>`;
}

// Descanso: curto restaura recursos 'short' (e Pacto do Bruxo); longo restaura tudo + HP.
function doRest(kind) {
  STATE.characters.forEach(c => {
    const res = classResources(c);
    if (kind === 'long') {
      c.hp = c.maxHp; c.raging = false; c.resUsed = {};
      if (c.spellSlots) c.spellSlots.used = 0;
    } else {
      res.forEach(r => {
        if (r.recharge === 'short') {
          if (r.kind === 'slots' && c.spellSlots) c.spellSlots.used = 0;  // Bruxo (Pacto)
          else c.resUsed[r.key] = 0;
        }
      });
    }
  });
  renderSidebar();
  toast(kind === 'long' ? 'Descanso longo: HP e recursos restaurados.' : 'Descanso curto: recursos de descanso curto restaurados.');
}

// ---------- NARRATIVA / MENSAGENS ----------
function addMsg(role, html, who) {
  const n = $('#narrative');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = (who?`<div class="who">${who}</div>`:'') + `<div class="body">${html}</div>`;
  n.appendChild(div);
  n.scrollTop = n.scrollHeight;
  return div;
}

// Mensagem do Mestre revelada progressivamente (efeito de digitação).
// rawText é o texto cru (com *itálico*); markers já removidos. Clique pula.
function addMsgTyped(role, rawText, who) {
  const n = $('#narrative');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = (who?`<div class="who">${who}</div>`:'') + `<div class="body typing"></div>`;
  n.appendChild(div);
  const body = div.querySelector('.body');
  const tokens = rawText.split(/(\s+)/);      // palavras + espaços
  return new Promise(resolve => {
    let i = 0, done = false;
    function finish() {
      if (done) return; done = true;
      body.classList.remove('typing');
      body.innerHTML = formatNarration(rawText);
      n.scrollTop = n.scrollHeight;
      div.onclick = null;
      resolve();
    }
    div.onclick = finish;                      // clicar pula a animação
    function step() {
      if (done) return;
      i++;
      const partial = tokens.slice(0, i).join('');
      body.innerHTML = formatNarration(partial).replace(/\*(?=[^*]*$)/, '');
      n.scrollTop = n.scrollHeight;
      if (i >= tokens.length) { finish(); return; }
      setTimeout(step, 16);
    }
    step();
  });
}
function addThinking() {
  const n = $('#narrative');
  const d = document.createElement('div');
  d.className = 'thinking'; d.id = 'thinkingNode'; d.textContent = 'O Mestre observa';
  n.appendChild(d); n.scrollTop = n.scrollHeight;
}
function removeThinking() { const t = $('#thinkingNode'); if (t) t.remove(); }

function showRollCard(label, result, dc) {
  const n = $('#narrative');
  const div = document.createElement('div');
  div.className = 'roll-card';
  let outcome = '';
  if (dc != null) {
    const success = result.total >= dc;
    outcome = `<div class="rout ${success?'success':'fail'}">${success?'SUCESSO':'FALHA'} (CD ${dc})</div>`;
  }
  const numClass = result.crit ? 'crit' : result.fumble ? 'fumble' : '';
  const diceStr = result.dice ? result.dice.join(', ') : '';
  div.innerHTML = `<div class="rtype">${label}</div>
    <div class="rnum ${numClass} dice-anim">${result.total}</div>
    <div class="rbreak">d20 [${diceStr}] ${result.mod>=0?'+':''}${result.mod}${result.crit?' · CRÍTICO!':''}${result.fumble?' · FALHA CRÍTICA':''}</div>
    ${outcome}`;
  n.appendChild(div); n.scrollTop = n.scrollHeight;
}

// Acrescenta a rolagem ao painel direito (mais recente no topo), com a quebra
// dos dados e o dano. dmg = { total, detail, type } (opcional).
function logRoll(label, result, dc, dmg) {
  const list = $('#rollLogList'); if (!list) return;
  const empty = list.querySelector('.rolllog-empty'); if (empty) empty.remove();
  const auto = (!result.dice || !result.dice.length);   // falha automática por condição
  let cls = result.crit ? 'crit' : result.fumble ? 'fumble' : '';
  let out = '';
  if (dc != null) {
    const ok = result.total >= dc;
    if (!cls) cls = ok ? 'ok' : 'fail';
    out = `${ok ? '✓' : '✗'} CD ${dc}`;
  }
  if (result.crit) out = 'CRÍTICO! ' + out;
  const breakLine = auto ? 'falha automática (condição)' : `d20 [${result.dice.join(', ')}] ${fmtMod(result.mod)} = ${result.total}`;
  const dmgLine = dmg ? `<div class="rl-dmg">⚔ Dano <b>${dmg.total}</b> <span class="rl-sub">${dmg.detail} [${dmg.type}]</span></div>` : '';
  const e = document.createElement('div');
  e.className = 'rl-entry ' + cls;
  e.innerHTML = `<div class="rl-head">${label}</div>
    <div class="rl-line"><span class="rl-num">${auto?'✗':result.total}</span><span class="rl-out">${out.trim()}</span></div>
    <div class="rl-break">${breakLine}</div>${dmgLine}`;
  list.insertBefore(e, list.firstChild);
}

// ---------- FLUXO DE CENA ----------
function updateTopbar() {
  const sc = CAMPAIGN.scenes[STATE.sceneId];
  $('#chapterLabel').textContent = sc.chapter;
  $('#locationLabel').textContent = sc.location;
}

function updateQuickActions() {
  const sc = CAMPAIGN.scenes[STATE.sceneId];
  const acts = sc.possibleRolls || [];
  $('#quickActions').innerHTML = acts.map(a => `<div class="qa">${a}</div>`).join('');
  $$('#quickActions .qa').forEach(el => el.onclick = () => {
    $('#actionInput').value = el.textContent;
    $('#actionInput').focus();
  });
}

function updateTurnIndicator() {
  const c = STATE.characters[STATE.activeChar];
  $('#turnIndicator').innerHTML = `Vez de <b style="color:var(--ember)">${c.name}</b> (${c.player})`;
}

async function beginScene(sceneId, isFirst) {
  STATE.sceneId = sceneId;
  const sc = CAMPAIGN.scenes[sceneId];
  updateTopbar(); updateQuickActions(); updateTurnIndicator();

  // level up automático se a cena exige
  if (sc.levelUp) applyLevelUp(sc.levelUp);

  // mostra o texto de leitura da cena (vem do roteiro, não da IA — economiza tokens)
  await addMsgTyped('dm', sc.readAloud);

  // pede à IA para continuar/ambientar a cena e abrir para ação
  const kickoff = isFirst
    ? "Apresente a cena aos jogadores de forma viva e termine perguntando o que eles fazem. Não repita literalmente o texto que já foi lido."
    : "Continue a partir do texto da cena. Ambiente brevemente e abra para a ação dos jogadores.";
  await askDM(kickoff, true);
}

function formatNarration(text) {
  // converte *itálico* em <em>
  return text.replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g,'\n');
}

function applyLevelUp(newLevel) {
  STATE.characters.forEach(c => {
    if (c.level < newLevel) {
      const hd = RULES.classes[c.cls].hitDie;
      const gain = Math.floor(hd/2)+1 + abilityMod(c.abilities.CON); // média do hit die
      c.level = newLevel;
      c.maxHp += gain;
      c.hp = c.maxHp;
      c.xp = RULES.xpTable[newLevel];
      if (c.spellSlots) c.spellSlots.max = Math.min(c.spellSlots.max+1, 4);
    }
  });
  renderSidebar();
  toast(`Subiram para o nível ${newLevel}! HP restaurado.`);
}

// =====================================================
//  AÇÃO DO JOGADOR
// =====================================================
async function submitAction() {
  const txt = $('#actionInput').value.trim();
  if (!txt) return;
  const c = STATE.characters[STATE.activeChar];
  addMsg('player', txt, `${c.name} · ${c.player}`);
  $('#actionInput').value = '';
  await askDM(`[${c.name} (${c.player})]: ${txt}`, false);
}

// alterna de personagem ativo
function switchTurn() {
  STATE.activeChar = (STATE.activeChar + 1) % STATE.characters.length;
  renderSidebar();
  updateTurnIndicator();
}

// ============================================================
//  COMUNICAÇÃO COM A IA (HAIKU) — prompt enxuto por cena
// ============================================================
function buildSystemPrompt() {
  const sc = CAMPAIGN.scenes[STATE.sceneId];
  const enc = sc.combat ? CAMPAIGN.encounters[sc.combat] : null;

  const charSheets = STATE.characters.map(c =>
    `- ${c.name} (jogador ${c.player}): ${c.race}${c.subrace?` (${c.subrace})`:''} ${c.cls}${c.archetype?` [${c.archetype}]`:''} Nv${c.level}${c.raging?' — EM FÚRIA':''}. ` +
    `HP ${c.hp}/${c.maxHp}, AC ${c.ca}. ` +
    `Atributos: ${RULES.abilities.map(a=>`${a} ${c.abilities[a]}(${fmtMod(abilityMod(c.abilities[a]))})`).join(', ')}. ` +
    `Saves proficientes: ${c.saves.join(', ')}. Perícias proficientes: ${(c.skills||[]).join(', ')||'nenhuma'}. Bônus de proficiência +${c.prof}.` +
    (c.fightingStyle?` Estilo de Luta: ${c.fightingStyle}.`:'') +
    (c.features&&c.features.length?` Características: ${c.features.join(', ')}.`:'') +
    (c.spellSlots?` Spell slots nv1: ${c.spellSlots.max-c.spellSlots.used}/${c.spellSlots.max} (CD ${c.spellDC}).`:'') +
    (c.conditions&&c.conditions.length?` Condições ativas: ${c.conditions.join(', ')}.`:'')
  ).join('\n');

  const npcs = sc.npcs ? Object.entries(sc.npcs).map(([n,d])=>`- ${n}: ${d}`).join('\n') : 'Nenhum NPC fixo nesta cena.';

  let combatInfo = '';
  if (enc) {
    combatInfo = `\n## COMBATE DESTA CENA: ${enc.name}\nInimigos:\n` +
      enc.enemies.map(e=>`- ${e.name}: HP ${e.hp}, AC ${e.ca}, ataque +${e.mod} (${e.dmg})${e.traits?'. '+e.traits:''}`).join('\n') +
      `\nTática: ${enc.tactics}` +
      (enc.negotiable?`\nEste combate é NEGOCIÁVEL — os jogadores podem evitar a luta com bons testes sociais.`:'');
  }
  if (STATE.inCombat && STATE.combat) {
    const cb = STATE.combat;
    combatInfo += `\n\n## ESTADO DO COMBATE (rodada ${cb.round})\n` +
      `Ordem de iniciativa: ${cb.order.map((o,k)=>`${k===cb.turn?'▶ ':''}${o.name}(${o.init})`).join(' > ')}\n` +
      `HP atual dos inimigos: ${cb.enemies.map(e=>`${e.name}[id:${e.id}] ${e.curHp}/${e.hp}`).join(', ')}\n` +
      `IMPORTANTE: quando um inimigo sofrer dano, emita [HIT:id:quantidade] (ex.: [HIT:${cb.enemies[0]?cb.enemies[0].id:'z1'}:8]) para o sistema baixar o HP. Respeite a ordem de iniciativa.`;
  }

  return `Você é o Mestre (DM) de uma aventura de D&D 5e: "${CAMPAIGN.title}".

${CAMPAIGN.premise}

## REGRAS DO MESTRE (siga rigorosamente)
${CAMPAIGN.dmRules.map(r=>'- '+r).join('\n')}

## MARCADORES DE SISTEMA (use quando aplicável, em linha própria)
- Para pedir uma rolagem: [ROLL:tipo:ATRIBUTO:CD] — ex: [ROLL:Atletismo:FOR:12], [ROLL:save:DES:14], [ROLL:ataque:DES:0]. Em saves, acrescente a AMEAÇA como 5º campo para ativar vantagens de traço (veneno, enfeitiçar, amedrontar, magia, sol): ex. [ROLL:save:CON:12:veneno], [ROLL:save:SAB:13:amedrontar], [ROLL:save:INT:14:magia]. O sistema aplica proficiência, vantagem/desvantagem e o dano da arma automaticamente — você só narra. Depois do marcador, PARE e espere o resultado.
- Para iniciar combate: [COMBAT_START:${sc.combat||'id'}]
- Em combate, ao causar dano a um inimigo: [HIT:id_do_inimigo:dano] (o sistema baixa o HP e respeita a iniciativa)
- Quando a cena termina: [SCENE_COMPLETE]

## CENA ATUAL: ${sc.chapter} — ${sc.location}
Resumo: ${sc.summary}
Objetivos: ${sc.objectives.join('; ')}
${sc.lore?'Lore a revelar: '+sc.lore:''}
${sc.hooks?'Ganchos disponíveis: '+sc.hooks.join(' | '):''}

## NPCs DESTA CENA
${npcs}
${combatInfo}

## PERSONAGENS DOS JOGADORES
${charSheets}

Narre só esta cena. Seja conciso (2-4 parágrafos). Português do Brasil, termos de regra em inglês.`;
}

async function askDM(userMsg, isSceneKickoff) {
  addThinking();
  $('#sendBtn').disabled = true;

  STATE.history.push({ role:'user', content: userMsg });
  // mantém histórico enxuto: últimas 12 mensagens
  const recent = STATE.history.slice(-12);

  try {
    const reply = await callClaude(recent, buildSystemPrompt(), 700, STATE.apiKey, STATE.model);
    removeThinking();
    STATE.history.push({ role:'assistant', content: reply });
    await processDMReply(reply);
  } catch(e) {
    removeThinking();
    addMsg('dm', `<span style="color:var(--blood)">O Mestre tropeçou: ${e.message}. Tente novamente ou verifique sua chave/créditos.</span>`);
  } finally {
    $('#sendBtn').disabled = false;
  }
}

// processa marcadores [ROLL], [COMBAT_START], [SCENE_COMPLETE]
async function processDMReply(reply) {
  // separa marcadores do texto
  const rollMatch = reply.match(/\[ROLL:([^:\]]+):([^:\]]+):(\d+)(?::([^:\]]+))?\]/);
  const combatMatch = reply.match(/\[COMBAT_START:([^\]]+)\]/);
  const sceneComplete = reply.includes('[SCENE_COMPLETE]');

  // texto limpo de marcadores
  const clean = reply
    .replace(/\[ROLL:[^\]]+\]/g,'')
    .replace(/\[COMBAT_START:[^\]]+\]/g,'')
    .replace(/\[HIT:[^\]]+\]/g,'')
    .replace(/\[SCENE_COMPLETE\]/g,'')
    .trim();

  if (clean) await addMsgTyped('dm', clean);

  // dano em inimigos durante o combate: [HIT:id:dano] → o código baixa o HP
  const hits = [...reply.matchAll(/\[HIT:([^:\]]+):(-?\d+)\]/g)];
  if (hits.length && STATE.combat) {
    hits.forEach(h => {
      const e = STATE.combat.enemies.find(x => x.id === h[1] || x.name.toLowerCase() === h[1].toLowerCase());
      if (e) e.curHp = Math.max(0, e.curHp - Math.abs(+h[2]));
    });
    renderCombatBar();
  }

  // pedido de rolagem → o CÓDIGO rola (justo) e devolve à IA
  if (rollMatch) {
    const [, tipo, atr, cd, tag] = rollMatch;
    const c = STATE.characters[STATE.activeChar];
    const abr = atr.toUpperCase().slice(0,3);

    // decisão (proficiência, vantagem/desvantagem, condições) na lógica pura da rules.js
    const rm = rollModifiers(c, tipo, abr, tag);
    const { adv, dis, prof } = rm;
    const cdNum = +cd > 0 ? +cd : null;
    const result = rm.autoFail
      ? { nat:'—', total:0, mod:rm.mod, dice:[], crit:false, fumble:true }   // condição: falha automática
      : d20ForChar(c, rm.mod, { adv, dis });

    const advNote = adv && !dis ? ' · vantagem' : dis && !adv ? ' · desvantagem' : '';
    const condNote = rm.autoFail ? ' · falha automática' : '';
    const label = `${c.name} · ${tipo} (${abr})${advNote}${condNote}`;
    showRollCard(label, result, cdNum);

    // ataque: rola o dano da arma equipada (justo); a IA decide se acerta vs a AC do alvo
    let dmgNote = '', dmgInfo = null;
    if (tipo.toLowerCase() === 'ataque' && !rm.autoFail) {
      const ap = attackProfile(c, abr, adv && !dis);
      const dmg = rollAttackDamage(ap, result.crit);
      dmgInfo = { total: dmg.total, detail: dmg.detail, type: ap.type };
      dmgNote = ` Dano se acertar: ${dmg.total} [${ap.type}] (${ap.name}: ${dmg.detail}${result.crit?' — CRÍTICO':''}${ap.sneak?' · Ataque Furtivo!':''}${c.raging?' · Fúria':''}).`;
    }
    logRoll(label, result, cdNum, dmgInfo);   // registra no painel direito

    const outcome = rm.autoFail ? 'FALHA AUTOMÁTICA (condição)' : (cdNum ? (result.total>=cdNum?'SUCESSO':'FALHA') : 'resultado');
    await askDM(`[RESULTADO DA ROLAGEM] ${c.name} rolou ${tipo} (${abr})${prof?' [proficiente]':''}${advNote}: ${rm.autoFail?'FALHA AUTOMÁTICA por condição':`d20=${result.nat} ${fmtMod(result.mod)} = ${result.total}${cdNum?` vs CD ${cdNum} → ${outcome}`:''}`}${result.crit?' (CRÍTICO!)':''}${result.fumble&&!rm.autoFail?' (FALHA CRÍTICA!)':''}${result.lucky?' (Sortudo: re-rolou o 1)':''}.${dmgNote} Narre a consequência e continue.`, false);
    return;
  }

  // início de combate
  if (combatMatch) {
    startCombat(combatMatch[1]);
    return;
  }

  // fim de cena → transição
  if (sceneComplete) {
    const sc = CAMPAIGN.scenes[STATE.sceneId];
    if (sc.ending) {
      addMsg('dm', `<div style="text-align:center;color:var(--gold-bone);font-family:var(--font-display);font-size:1.3rem;margin-top:20px">⚜ Fim da aventura ⚜</div>`);
      return;
    }
    if (sc.next) {
      setTimeout(() => {
        addMsg('dm', `<div style="text-align:center;color:var(--ember);font-family:var(--font-mono);font-size:0.8rem;letter-spacing:0.15em;margin:14px 0">— A jornada continua —</div>`);
        beginScene(sc.next, false);
      }, 1400);
    }
  }

  // alterna turno entre jogadores após ação resolvida (fora de combate)
  if (!STATE.inCombat && !rollMatch) switchTurn();
}

// ---------- COMBATE (simplificado, IA narra, código rola) ----------
function startCombat(encId) {
  const enc = CAMPAIGN.encounters[encId];
  if (!enc) return;
  STATE.inCombat = true;
  STATE.combat = { enc: encId, name: enc.name, enemies: enc.enemies.map(e => ({...e, curHp: e.hp})), order: [], turn: 0, round: 1 };
  rollInitiative();
  addMsg('dm', `<div style="text-align:center;color:var(--blood);font-family:var(--font-mono);font-size:0.82rem;letter-spacing:0.18em;margin:10px 0">⚔ COMBATE: ${enc.name.toUpperCase()} ⚔</div>`);
  renderCombatBar();
  toast('Combate iniciado! Iniciativa rolada.');
}

// Rola iniciativa (PCs: d20+DES; inimigos: d20+bônus) e ordena.
function rollInitiative() {
  const order = [];
  STATE.characters.forEach((c, idx) => order.push({ kind:'pc', idx, name:c.name, init: d20(abilityMod(c.abilities.DES)).total }));
  STATE.combat.enemies.forEach((e, idx) => order.push({ kind:'enemy', idx, name:e.name, init: d20(e.mod || 0).total }));
  order.sort((a,b) => b.init - a.init);
  STATE.combat.order = order; STATE.combat.turn = 0; STATE.combat.round = 1;
}

function renderCombatBar() {
  const bar = $('#combatBar');
  if (!bar) return;
  if (!STATE.inCombat || !STATE.combat) { bar.classList.add('hide'); bar.innerHTML = ''; return; }
  bar.classList.remove('hide');
  const cb = STATE.combat;
  const toks = cb.order.map((o, k) => {
    let hp, dead;
    if (o.kind === 'enemy') { const e = cb.enemies[o.idx]; hp = `${e.curHp}/${e.hp} HP`; dead = e.curHp <= 0; }
    else { const c = STATE.characters[o.idx]; hp = `${c.hp}/${c.maxHp} HP`; dead = c.hp <= 0; }
    return `<div class="cb-tok ${o.kind} ${k===cb.turn?'current':''} ${dead?'dead':''}"><div class="cb-init">${o.init}</div><div>${o.name}</div><div class="cb-hp">${hp}</div></div>`;
  }).join('');
  bar.innerHTML = `<span class="cb-round">Rodada ${cb.round}</span><div class="cb-list">${toks}</div>
    <div class="cb-btns"><button class="cb-btn" id="nextTurnBtn">Próximo turno →</button><button class="cb-btn end" id="endCombatBtn">Encerrar</button></div>`;
  $('#nextTurnBtn').onclick = advanceTurn;
  $('#endCombatBtn').onclick = endCombat;
}

function advanceTurn() {
  const cb = STATE.combat; if (!cb || !cb.order.length) return;
  let guard = 0;
  do {
    cb.turn++;
    if (cb.turn >= cb.order.length) { cb.turn = 0; cb.round++; }
    const o = cb.order[cb.turn];
    const dead = o.kind === 'enemy' ? cb.enemies[o.idx].curHp <= 0 : STATE.characters[o.idx].hp <= 0;
    if (!dead) break;
  } while (++guard < cb.order.length * 2);
  const cur = cb.order[cb.turn];
  if (cur.kind === 'pc') { STATE.activeChar = cur.idx; updateTurnIndicator(); }
  renderSidebar(); renderCombatBar();
}

function endCombat() {
  STATE.inCombat = false; STATE.combat = null;
  renderCombatBar();
  addMsg('dm', `<div style="text-align:center;color:var(--myco);font-family:var(--font-mono);font-size:0.8rem;letter-spacing:0.15em;margin:10px 0">— fim do combate —</div>`);
}

// =====================================================
//  CHAMADA À API ANTHROPIC
// =====================================================
// Chama a Edge Function 'dm' (proxy seguro). A chave da Anthropic fica no
// servidor; aqui só vai o JWT da sessão do usuário logado.
async function callClaude(messages, system, maxTokens, _key, model) {
  const { data: { session } } = await supa.auth.getSession();
  if (!session) { showScreen('screen-login'); throw new Error('Sessão expirada. Entre novamente.'); }
  const res = await fetch(`${SUPA_URL}/functions/v1/dm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPA_KEY
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages })
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n');
}

// =====================================================
//  SALVAR / CARREGAR
// =====================================================
async function saveGame() {
  const save = {
    characters: STATE.characters,
    activeChar: STATE.activeChar,
    sceneId: STATE.sceneId,
    history: STATE.history,
    model: STATE.model
  };
  try {
    const { error } = await supa.from('saves').upsert({
      user_id: STATE.user.id, slot: 'default', data: save, updated_at: new Date().toISOString()
    });
    if (error) throw error;
    toast('Jogo salvo na sua conta.');
  } catch (e) { toast('Erro ao salvar: ' + e.message); }
}

async function loadGame() {
  let save;
  try {
    const { data, error } = await supa.from('saves')
      .select('data').eq('user_id', STATE.user.id).eq('slot', 'default').maybeSingle();
    if (error) throw error;
    if (!data) { toast('Nenhum jogo salvo.'); return; }
    save = data.data;
  } catch (e) { toast('Erro ao carregar: ' + e.message); return; }

  STATE.characters = save.characters;
  STATE.activeChar = save.activeChar;
  STATE.sceneId = save.sceneId;
  STATE.history = save.history;
  STATE.model = save.model || 'claude-haiku-4-5';

  showScreen('screen-game');
  renderSidebar();
  updateTopbar(); updateQuickActions(); updateTurnIndicator();
  $('#saveBtn').onclick = saveGame;
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('mobile-open');
  $('#rollsToggleBtn').onclick = () => $('.game-layout').classList.toggle('rolls-hidden');
  $('#hideRollsBtn').onclick = () => $('.game-layout').classList.add('rolls-hidden');
  $('#sendBtn').onclick = submitAction;
  $('#actionInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAction(); }
  });

  // re-renderiza histórico
  const n = $('#narrative'); n.innerHTML = '';
  save.history.forEach(m => {
    if (m.role === 'assistant') {
      const clean = m.content.replace(/\[[^\]]+\]/g,'').trim();
      if (clean) addMsg('dm', formatNarration(clean));
    } else if (m.role === 'user' && !m.content.startsWith('[RESULTADO') && !m.content.includes('Apresente a cena')) {
      const match = m.content.match(/^\[([^\]]+)\]:\s*(.+)/s);
      if (match) addMsg('player', match[2], match[1]);
    }
  });
  toast('Jogo carregado.');
}

// ---------- INIT ----------
initAuth();
