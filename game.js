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
  creationSlot: 0,      // 0 ou 1 durante criação
  visited: [],          // ids de locais do mapa já visitados (alcançados)
  revealed: [],         // ids de locais revelados pelo Mestre (mas ainda não alcançados)
  gmMode: false         // "Modo Mestre": reativa edição manual de recursos/condições p/ correção
};

// ---------- MAPA INTERATIVO DA ILHA ----------
// Coordenadas num viewBox 0 0 360 400 (arte original estilizada, não copia o mapa oficial).
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
// mapeia cada cena do roteiro para um local no mapa.
// 'chegada' (no barco, em alto-mar) NÃO mapeia para nada — a praia só é
// revelada quando os heróis desembarcam (cena 'praia'), preservando a imersão.
const SCENE_LOC = {
  praia:'praia',
  claustro:'claustro', claustro_volta:'claustro', epilogo:'claustro',
  cavernas:'cavernas', sharruth:'cavernas',
  naufragio:'naufragio', observatorio:'observatorio'
};
// rota da jornada (ordem das pernas, para desenhar os caminhos)
const MAP_ROUTE = ['praia','claustro','cavernas','claustro','naufragio','observatorio'];

// rascunho de criação do personagem atual
let DRAFT = { race:null, subrace:null, cls:null, base:{ FOR:8, DES:8, CON:8, INT:8, SAB:8, CAR:8 },
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

  // controle de acesso: a conta precisa estar autorizada para jogar
  try {
    const { data: allowed } = await supa.rpc('am_i_allowed');
    const { data: isAdmin } = await supa.rpc('is_app_admin');
    if (isAdmin && $('#adminLink')) $('#adminLink').style.display = 'block';
    if (!allowed) {
      $('#accessNote').innerHTML = `<div class="err" style="margin-top:14px;line-height:1.5">⏳ Sua conta ainda não foi autorizada pelo mestre. Avise o administrador e recarregue depois que ele liberar.</div>`;
      $('#toCreationBtn').disabled = true;
      $('#loadSaveBtn').style.display = 'none';
      return;
    }
  } catch (e) {}

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
  showCreationModePick();
}

// Escolha do modo de criação (guiada x conversando com o Mestre)
function showCreationModePick() {
  $('#creationStepLabel').textContent = `Aventureiro ${STATE.creationSlot+1} de 2`;
  $('#creationModePick').classList.remove('hide');
  $('#creationGuided').classList.add('hide');
  $('#creationChat').classList.add('hide');
  $('#modeGuidedBtn').onclick = showGuidedCreation;
  $('#modeChatBtn').onclick = startCreationChat;
  window.scrollTo(0,0);
}

function showGuidedCreation() {
  $('#creationModePick').classList.add('hide');
  $('#creationChat').classList.add('hide');
  $('#creationGuided').classList.remove('hide');
  renderCreation();
}

// ---- Criação dinâmica: chat com o Mestre ----
let CC = { history: [], spec: null };

function startCreationChat() {
  $('#creationModePick').classList.add('hide');
  $('#creationGuided').classList.add('hide');
  $('#creationChat').classList.remove('hide');
  CC = { history: [], spec: null };
  $('#ccChat').innerHTML = '';
  $('#ccFinishBtn').classList.add('hide');
  $('#ccSendBtn').onclick = ccSend;
  $('#ccBackBtn').onclick = showCreationModePick;
  $('#ccFinishBtn').onclick = ccFinish;
  $('#ccInput').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ccSend(); } };
  ccAddMsg('dm', 'Olá! Vou te ajudar a criar seu aventureiro para *Stormwreck Isle*. Me conta: que herói você imagina? Pode ser um conceito ("um anão durão"), uma raça/classe, ou só uma vibe.');
}

function ccAddMsg(role, text) {
  const n = $('#ccChat');
  const d = document.createElement('div');
  d.className = 'cc-msg ' + role;
  d.innerHTML = role === 'dm' ? formatNarration(text) : '';
  if (role !== 'dm') d.textContent = text;
  n.appendChild(d); n.scrollTop = n.scrollHeight;
}

function creationChatSystemPrompt() {
  const races = Object.keys(RULES.races).join(', ');
  const classes = Object.keys(RULES.classes).join(', ');
  const skills = Object.keys(RULES.skills).join(', ');
  return `Você é o Mestre de D&D 5e ajudando a criar UM personagem de NÍVEL 1 para a campanha Dragons of Stormwreck Isle. Fale em português do Brasil, de forma acolhedora e concisa (2-4 frases por vez): faça perguntas, sugira e explique. Conduza por: conceito → raça (e sub-raça se houver) → classe → atributos → perícias → equipamento → opções de classe (estilo de luta/subclasse) → magias (se conjurador) → perfil (aparência, contexto, motivações, defeitos, qualidades).

Opções válidas (use os nomes EXATOS):
- Raças: ${races}. (algumas têm sub-raças)
- Classes: ${classes}.
- Atributos: point-buy de 27 pontos, cada um entre 8 e 15 (custo 5e: 14→15 custa 2).
- Perícias: ${skills}.

Quando — e SOMENTE quando — tudo estiver definido e o jogador confirmar, inclua na MESMA mensagem, na última linha, um bloco JSON exatamente neste formato (nomes exatos do sistema; deixe campos não aplicáveis como null ou lista vazia):
[CHARACTER]{"name":"","race":"","subrace":null,"cls":"","base":{"FOR":10,"DES":10,"CON":10,"INT":10,"SAB":10,"CAR":10},"asiChoices":[],"skills":[],"armor":"Nenhuma","shield":false,"weapon":"","fightingStyle":null,"archetype":null,"cantrips":[],"spells":[],"expertise":[],"profile":{"appearance":"","context":"","motivation":"","flaw":"","quality":""}}[/CHARACTER]
NÃO emita o bloco antes de tudo estar pronto e confirmado.`;
}

async function ccSend() {
  const txt = $('#ccInput').value.trim();
  if (!txt) return;
  ccAddMsg('player', txt);
  $('#ccInput').value = '';
  CC.history.push({ role:'user', content: txt });
  const thinking = document.createElement('div');
  thinking.className = 'cc-msg dm'; thinking.textContent = 'O Mestre pensa…';
  $('#ccChat').appendChild(thinking); $('#ccChat').scrollTop = $('#ccChat').scrollHeight;
  $('#ccSendBtn').disabled = true;
  try {
    const reply = await callClaude(CC.history.slice(-16), creationChatSystemPrompt(), 700, null, STATE.model);
    thinking.remove();
    CC.history.push({ role:'assistant', content: reply });
    const m = reply.match(/\[CHARACTER\]([\s\S]*?)\[\/CHARACTER\]/);
    const visible = reply.replace(/\[CHARACTER\][\s\S]*?\[\/CHARACTER\]/, '').trim();
    if (visible) ccAddMsg('dm', visible);
    if (m) {
      try { CC.spec = JSON.parse(m[1].trim()); $('#ccFinishBtn').classList.remove('hide'); ccAddMsg('dm', '✓ *Ficha montada!* Revise acima e clique em **Concluir personagem** — ou peça ajustes.'); }
      catch (e) { ccAddMsg('dm', '(tive um problema ao montar a ficha — pode confirmar os detalhes de novo?)'); }
    }
  } catch (e) {
    thinking.remove(); ccAddMsg('dm', 'Erro: ' + e.message);
  } finally { $('#ccSendBtn').disabled = false; }
}

function ccFinish() {
  if (!CC.spec) { $('#ccInput').value = 'Pode finalizar minha ficha agora?'; ccSend(); return; }
  const char = buildFromSpec(CC.spec);
  STATE.characters.push(char);
  $('#creationChat').classList.add('hide');
  if (STATE.creationSlot === 0) { STATE.creationSlot = 1; showCreationModePick(); }
  else startGame();
}

// Monta um personagem a partir do JSON do Mestre, validando/saneando contra as regras.
function buildFromSpec(s) {
  s = s || {};
  const race = RULES.races[s.race] ? s.race : 'Humano';
  const r = RULES.races[race];
  const subs = Object.keys(r.subraces || {});
  const subrace = subs.length ? (r.subraces[s.subrace] ? s.subrace : subs[0]) : null;
  const cls = RULES.classes[s.cls] ? s.cls : 'Guerreiro';
  const c = RULES.classes[cls];

  const base = {};
  RULES.abilities.forEach(a => { let v = (s.base && +s.base[a]) || 10; base[a] = Math.max(8, Math.min(15, v)); });

  let asiChoices = [];
  if (r.asiChoice) {
    const excl = r.asiChoice.exclude || [];
    asiChoices = (Array.isArray(s.asiChoices) ? s.asiChoices : []).filter(a => RULES.abilities.includes(a) && !excl.includes(a));
    asiChoices = Array.from(new Set(asiChoices)).slice(0, r.asiChoice.count);
    RULES.abilities.forEach(a => { if (asiChoices.length < r.asiChoice.count && !asiChoices.includes(a) && !excl.includes(a)) asiChoices.push(a); });
  }
  const abilities = applyASI(base, race, subrace, asiChoices);

  const pool = skillOptionsFor(cls), fixed = fixedRacialSkills(race, subrace);
  let skills = (Array.isArray(s.skills) ? s.skills : []).filter(x => pool.includes(x) && !fixed.includes(x));
  skills = Array.from(new Set(skills)).slice(0, c.skillCount);
  for (const cand of pool) { if (skills.length >= c.skillCount) break; if (!skills.includes(cand) && !fixed.includes(cand)) skills.push(cand); }
  let extra = [];
  if (r.skillChoiceExtra) {
    const taken = new Set([...skills, ...fixed]);
    extra = (Array.isArray(s.skillsExtra) ? s.skillsExtra : []).filter(x => RULES.skills[x] && !taken.has(x)).slice(0, r.skillChoiceExtra);
    for (const cand of Object.keys(RULES.skills)) { if (extra.length >= r.skillChoiceExtra) break; if (!taken.has(cand) && !extra.includes(cand)) extra.push(cand); }
  }
  const allSkills = [...skills, ...extra];

  const armors = availableArmors(cls, race, subrace);
  const armor = armors.includes(s.armor) ? s.armor : defaultArmor(cls, race, subrace);
  const shield = !!s.shield && canUseShield(cls, race, subrace);
  const weapons = availableWeapons(cls, race, subrace).sort();
  const weapon = weapons.includes(s.weapon) ? s.weapon : weapons[0];

  const fightingStyle = fightingStyleLevel(cls) === 1 ? (RULES.fightingStyles[s.fightingStyle] ? s.fightingStyle : 'Defesa') : null;
  const archetype = c.subclassLevel === 1 ? ((c.subclasses || []).includes(s.archetype) ? s.archetype : (c.subclasses || [])[0]) : null;

  let cantrips = [], spells = [];
  const picks = spellPicks(cls, abilities, 1);
  if (picks) {
    cantrips = (Array.isArray(s.cantrips) ? s.cantrips : []).filter(x => picks.cantripList.includes(x)).slice(0, picks.cantrips);
    for (const cand of picks.cantripList) { if (cantrips.length >= picks.cantrips) break; if (!cantrips.includes(cand)) cantrips.push(cand); }
    const needSp = Math.min(picks.spells, picks.spellList.length);
    spells = (Array.isArray(s.spells) ? s.spells : []).filter(x => picks.spellList.includes(x)).slice(0, needSp);
    for (const cand of picks.spellList) { if (spells.length >= needSp) break; if (!spells.includes(cand)) spells.push(cand); }
  }
  let expertise = [];
  if (cls === 'Ladino') {
    const epool = Array.from(new Set([...allSkills, ...fixed]));
    expertise = (Array.isArray(s.expertise) ? s.expertise : []).filter(x => epool.includes(x)).slice(0, 2);
    for (const cand of epool) { if (expertise.length >= 2) break; if (!expertise.includes(cand)) expertise.push(cand); }
  }
  const profile = Object.assign({ appearance:'', context:'', motivation:'', flaw:'', quality:'' }, s.profile || {});
  const name = (s.name || '').toString().trim() || 'Aventureiro';
  const player = (s.player || '').toString().trim() || 'Jogador';

  return buildCharacter({ name, player, slot: STATE.creationSlot, race, subrace, cls, scores: base, asiChoices,
    skills: allSkills, armor, shield, weapons: [weapon], fightingStyle, archetype, cantrips, spells, expertise, profile });
}

function renderCreation() {
  DRAFT = { race:null, subrace:null, cls:null, base:{ FOR:8, DES:8, CON:8, INT:8, SAB:8, CAR:8 },
            skills:[], skillsExtra:[], asiChoices:[], armor:'Nenhuma', shield:false, weapon:null,
            fightingStyle:null, archetype:null, cantrips:[], spells:[], expertise:[],
            profile:{ appearance:'', context:'', motivation:'', flaw:'', quality:'' } };
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
  ['#subraceSection','#asiChoiceSection','#skillsSection','#equipmentSection','#classOptionsSection','#spellSection','#expertiseSection'].forEach(s=>$(s).classList.add('hide'));

  // atributos (point-buy)
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
    DRAFT.cantrips = []; DRAFT.spells = []; DRAFT.expertise = [];
    renderSkills(); renderEquipment(); renderClassOptions(); renderSpells(); renderExpertise(); checkCreationReady();
  });
  $('#charName').oninput = checkCreationReady;
  $('#playerName').oninput = checkCreationReady;

  // perfil narrativo (opcional) + ajuda da IA
  ['appearance','context','motivation','flaw','quality'].forEach(k => {
    const el = $('#pf_'+k);
    if (el) { el.value = ''; el.oninput = () => DRAFT.profile[k] = el.value; }
  });
  $('#aiHelpStatus').textContent = '';
  $('#aiHelpBtn').onclick = askMestreForProfile;

  $('#charNextBtn').onclick = commitCharacter;
  $('#charBackBtn').onclick = showCreationModePick;
}

// Pede ao Mestre (IA) para sugerir o perfil do personagem com base nas escolhas.
async function askMestreForProfile() {
  if (!DRAFT.race || !DRAFT.cls) { aiStatus('Escolha raça e classe primeiro.', false); return; }
  const name = $('#charName').value.trim() || 'um aventureiro sem nome';
  aiStatus('O Mestre está imaginando…', true);
  $('#aiHelpBtn').disabled = true;
  const sys = `Você é o Mestre de uma campanha de D&D 5e (Dragons of Stormwreck Isle). Crie um perfil curto e evocativo para um personagem jogador. Responda APENAS com um objeto JSON válido, sem texto fora dele, com as chaves: appearance, context, motivation, flaw, quality. Cada valor tem 1 ou 2 frases, em português do Brasil.`;
  const user = `Personagem: ${name}, ${DRAFT.race}${DRAFT.subrace?` (${DRAFT.subrace})`:''} ${DRAFT.cls}${DRAFT.archetype?` [${DRAFT.archetype}]`:''}. Ele chega à ilha Stormwreck para ajudar o claustro de Dragon's Rest. Gere: appearance (descrição física), context (por que está aqui), motivation (motivações), flaw (defeitos) e quality (qualidades).`;
  try {
    const reply = await callClaude([{ role:'user', content:user }], sys, 600, null, STATE.model);
    const m = reply.match(/\{[\s\S]*\}/);
    const data = JSON.parse(m ? m[0] : reply);
    ['appearance','context','motivation','flaw','quality'].forEach(k => {
      if (data[k]) { DRAFT.profile[k] = String(data[k]); const el = $('#pf_'+k); if (el) el.value = DRAFT.profile[k]; }
    });
    aiStatus('Pronto! Pode editar à vontade.', true);
  } catch (e) {
    aiStatus('Não consegui agora: ' + e.message, false);
  } finally {
    $('#aiHelpBtn').disabled = false;
  }
}
function aiStatus(msg, ok) { const el = $('#aiHelpStatus'); if (el) { el.textContent = msg; el.style.color = ok ? 'var(--myco)' : 'var(--blood)'; } }

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
    renderSkills(); renderEquipment(); renderAbilityGrid(); renderSpells(); renderExpertise(); checkCreationReady();
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
    renderSkills(); renderExpertise(); checkCreationReady();
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
    renderSkills(); renderExpertise(); checkCreationReady();
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
  $('#armorSelect').onchange = e => { DRAFT.armor = e.target.value; updateAC(); renderEquipment(); checkCreationReady(); };

  const weapons = availableWeapons(DRAFT.cls, DRAFT.race, DRAFT.subrace).sort();
  if (!weapons.includes(DRAFT.weapon)) DRAFT.weapon = weapons[0] || null;
  $('#weaponSelect').innerHTML = weapons.map(w=>`<option value="${w}" ${w===DRAFT.weapon?'selected':''}>${w} (${RULES.weapons[w].dmg} ${RULES.weapons[w].type})</option>`).join('');
  $('#weaponSelect').onchange = e => { DRAFT.weapon = e.target.value; renderEquipment(); checkCreationReady(); };

  const canShield = canUseShield(DRAFT.cls, DRAFT.race, DRAFT.subrace);
  const row = $('#shieldRow'); row.classList.toggle('disabled', !canShield);
  if (!canShield) DRAFT.shield = false;
  $('#shieldCheck').checked = DRAFT.shield;
  $('#shieldCheck').onchange = e => { DRAFT.shield = e.target.checked; updateAC(); renderEquipment(); };

  // prévia de itens iniciais (armadura/arma escolhidas + kit fixo da classe)
  const kitEl = $('#startKitList');
  if (kitEl) {
    const items = [];
    if (DRAFT.armor && DRAFT.armor !== 'Nenhuma') items.push(DRAFT.armor);
    if (DRAFT.shield) items.push('Escudo');
    if (DRAFT.weapon) items.push(DRAFT.weapon);
    const armorKeys = new Set(Object.keys(RULES.armor || {}));
    startingFixedItems(DRAFT.cls).forEach(it => { if (!armorKeys.has(it) && it !== 'Escudo') items.push(it); });
    items.push('Pacote de Aventureiro');
    const cspell = RULES.classes[DRAFT.cls].spell;
    if (cspell && !items.some(x => /foco|bolsa de componentes/i.test(x)))
      items.push(cspell.ability === 'INT' ? 'Foco arcano' : 'Foco de conjuração');
    const seen = new Set();
    const uniq = items.filter(x => { const k = x.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; });
    kitEl.innerHTML = uniq.map(x => `<li>${x}</li>`).join('');
  }
  updateAC();
}

// abilities atuais do rascunho (scores atribuídos + ASI racial/escolha; fallback 10)
function draftAbilities() {
  const base = { ...DRAFT.base };
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

// ---- Seleção de truques e magias iniciais ----
function renderSpells() {
  const sec = $('#spellSection');
  if (!DRAFT.cls) { sec.classList.add('hide'); return; }
  const picks = spellPicks(DRAFT.cls, draftAbilities(), 1);
  if (!picks) { sec.classList.add('hide'); DRAFT.cantrips=[]; DRAFT.spells=[]; return; }
  sec.classList.remove('hide');

  const cw = $('#cantripWrap');
  if (picks.cantrips > 0) {
    cw.classList.remove('hide');
    DRAFT.cantrips = DRAFT.cantrips.filter(s => picks.cantripList.includes(s)).slice(0, picks.cantrips);
    $('#cantripNote').textContent = `Escolha ${picks.cantrips} truque(s): ${DRAFT.cantrips.length}/${picks.cantrips}`;
    $('#cantripNote').classList.toggle('done', DRAFT.cantrips.length===picks.cantrips);
    const atMax = DRAFT.cantrips.length >= picks.cantrips;
    $('#cantripGrid').innerHTML = picks.cantripList.map(s => {
      const sel = DRAFT.cantrips.includes(s), dis = !sel && atMax;
      return `<div class="skill-chip ${sel?'selected':''} ${dis?'disabled':''}" data-cantrip="${s}" title="${RULES.spells[s].desc}">${s}</div>`;
    }).join('');
    $$('#cantripGrid .skill-chip[data-cantrip]').forEach(el => el.onclick = () => {
      const s=el.dataset.cantrip, i=DRAFT.cantrips.indexOf(s);
      if (i>=0) DRAFT.cantrips.splice(i,1); else if (DRAFT.cantrips.length<picks.cantrips) DRAFT.cantrips.push(s);
      renderSpells(); checkCreationReady();
    });
  } else { cw.classList.add('hide'); DRAFT.cantrips=[]; }

  const sw = $('#spellWrap');
  if (picks.spells > 0 && picks.spellList.length) {
    sw.classList.remove('hide');
    $('#spellWrapTitle').textContent = (picks.prepared ? 'Magias preparadas' : 'Magias conhecidas') + ' (nível 1)';
    DRAFT.spells = DRAFT.spells.filter(s => picks.spellList.includes(s)).slice(0, picks.spells);
    $('#spellNote').textContent = `Escolha ${picks.spells}: ${DRAFT.spells.length}/${picks.spells}`;
    $('#spellNote').classList.toggle('done', DRAFT.spells.length===picks.spells);
    const atMax = DRAFT.spells.length >= picks.spells;
    $('#spellGrid').innerHTML = picks.spellList.map(s => {
      const sel = DRAFT.spells.includes(s), dis = !sel && atMax;
      return `<div class="skill-chip ${sel?'selected':''} ${dis?'disabled':''}" data-spell="${s}" title="${RULES.spells[s].desc}">${s}</div>`;
    }).join('');
    $$('#spellGrid .skill-chip[data-spell]').forEach(el => el.onclick = () => {
      const s=el.dataset.spell, i=DRAFT.spells.indexOf(s);
      if (i>=0) DRAFT.spells.splice(i,1); else if (DRAFT.spells.length<picks.spells) DRAFT.spells.push(s);
      renderSpells(); checkCreationReady();
    });
  } else { sw.classList.add('hide'); DRAFT.spells=[]; }
}

// ---- Especialização do Ladino (2 perícias com proficiência dobrada) ----
function renderExpertise() {
  const sec = $('#expertiseSection');
  if (DRAFT.cls !== 'Ladino') { sec.classList.add('hide'); DRAFT.expertise=[]; return; }
  sec.classList.remove('hide');
  const fixed = DRAFT.race ? fixedRacialSkills(DRAFT.race, DRAFT.subrace) : [];
  const pool = Array.from(new Set([...DRAFT.skills, ...DRAFT.skillsExtra, ...fixed]));
  DRAFT.expertise = DRAFT.expertise.filter(s => pool.includes(s)).slice(0, 2);
  $('#expertiseNote').textContent = pool.length ? `Escolha 2 perícias proficientes: ${DRAFT.expertise.length}/2` : 'Escolha as perícias primeiro.';
  $('#expertiseNote').classList.toggle('done', DRAFT.expertise.length===2);
  const atMax = DRAFT.expertise.length >= 2;
  $('#expertiseGrid').innerHTML = pool.map(s => {
    const sel = DRAFT.expertise.includes(s), dis = !sel && atMax;
    return `<div class="skill-chip ${sel?'selected':''} ${dis?'disabled':''}" data-exp="${s}">${s}</div>`;
  }).join('');
  $$('#expertiseGrid .skill-chip[data-exp]').forEach(el => el.onclick = () => {
    const s=el.dataset.exp, i=DRAFT.expertise.indexOf(s);
    if (i>=0) DRAFT.expertise.splice(i,1); else if (DRAFT.expertise.length<2) DRAFT.expertise.push(s);
    renderExpertise(); checkCreationReady();
  });
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
const POINT_COST = {8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};
const POINT_BUDGET = 27;
function pointsSpent() { return RULES.abilities.reduce((s,a)=>s+(POINT_COST[DRAFT.base[a]]||0),0); }

function renderAbilityGrid() {
  const left = POINT_BUDGET - pointsSpent();
  const pl = $('#pointsLeft'); if (pl) pl.textContent = left;
  $('#abilityGrid').innerHTML = RULES.abilities.map(ab => {
    const base = DRAFT.base[ab];
    const raceBonus = abilityRaceBonus(ab);
    const finalScore = base + raceBonus;
    const canInc = base < 15 && (POINT_COST[base+1] - POINT_COST[base]) <= left;
    const canDec = base > 8;
    return `<div class="ability-box assigned" data-ab="${ab}">
      <div class="ab-label">${ab}${raceBonus?` <span style="color:var(--myco)">+${raceBonus}</span>`:''}</div>
      <div class="ab-pb"><button class="pb-btn" data-pb="-" data-ab="${ab}" ${canDec?'':'disabled'}>−</button><span class="ab-base">${base}</span><button class="pb-btn" data-pb="+" data-ab="${ab}" ${canInc?'':'disabled'}>+</button></div>
      <div class="ab-score">${finalScore}</div>
      <div class="ab-mod">${fmtMod(abilityMod(finalScore))}</div>
    </div>`;
  }).join('');
  $$('#abilityGrid .pb-btn').forEach(b => b.onclick = () => {
    const ab = b.dataset.ab;
    if (b.dataset.pb === '+') DRAFT.base[ab] = Math.min(15, DRAFT.base[ab] + 1);
    else DRAFT.base[ab] = Math.max(8, DRAFT.base[ab] - 1);
    renderAbilityGrid(); updateAC(); renderSpells(); checkCreationReady();
  });
}

function checkCreationReady() {
  const r = DRAFT.race ? RULES.races[DRAFT.race] : null;
  const subOk = !r || !Object.keys(r.subraces||{}).length || DRAFT.subrace;
  const asiOk = !r || !r.asiChoice || DRAFT.asiChoices.length === r.asiChoice.count;
  const skillsOk = DRAFT.cls && DRAFT.skills.length === RULES.classes[DRAFT.cls].skillCount;
  const extraN = r ? (r.skillChoiceExtra||0) : 0;
  const extraOk = DRAFT.skillsExtra.length === extraN;
  const styleOk = !DRAFT.cls || fightingStyleLevel(DRAFT.cls) !== 1 || DRAFT.fightingStyle;
  const archOk  = !DRAFT.cls || RULES.classes[DRAFT.cls].subclassLevel !== 1 || DRAFT.archetype;
  const picks = DRAFT.cls ? spellPicks(DRAFT.cls, draftAbilities(), 1) : null;
  const spellsOk = !picks || (DRAFT.cantrips.length === picks.cantrips && DRAFT.spells.length === Math.min(picks.spells, picks.spellList.length));
  const expertiseOk = DRAFT.cls !== 'Ladino' || DRAFT.expertise.length === 2;
  const nameOk = $('#charName').value.trim(), playerOk = $('#playerName').value.trim();
  const ready = DRAFT.race && subOk && asiOk && DRAFT.cls && skillsOk && extraOk && styleOk && archOk && spellsOk && expertiseOk
    && nameOk && playerOk;
  $('#charNextBtn').disabled = !ready;
  $('#charNextBtn').textContent = STATE.creationSlot === 0 ? 'Próximo aventureiro →' : 'Começar aventura →';

  // lista o que ainda falta para liberar o botão
  const miss = [];
  if (!nameOk) miss.push('nome do personagem');
  if (!playerOk) miss.push('seu nome (jogador)');
  if (!DRAFT.race) miss.push('raça');
  else if (!subOk) miss.push('sub-raça');
  if (!asiOk && r && r.asiChoice) miss.push(`${r.asiChoice.count} atributo(s) +1`);
  if (!DRAFT.cls) miss.push('classe');
  else {
    if (!skillsOk) miss.push(`perícias (${DRAFT.skills.length}/${RULES.classes[DRAFT.cls].skillCount})`);
    if (!extraOk) miss.push(`perícia(s) extra de raça (${DRAFT.skillsExtra.length}/${extraN})`);
    if (!styleOk) miss.push('estilo de luta');
    if (!archOk) miss.push('subclasse');
    if (!spellsOk && picks) {
      if (DRAFT.cantrips.length !== picks.cantrips) miss.push(`truques (${DRAFT.cantrips.length}/${picks.cantrips})`);
      const sNeed = Math.min(picks.spells, picks.spellList.length);
      if (DRAFT.spells.length !== sNeed) miss.push(`magias (${DRAFT.spells.length}/${sNeed})`);
    }
    if (!expertiseOk) miss.push(`especializações (${DRAFT.expertise.length}/2)`);
  }
  const el = $('#creationMissing');
  if (el) {
    if (ready) { el.textContent = '✓ Tudo pronto!'; el.classList.add('ok'); }
    else { el.textContent = 'Falta: ' + miss.join(', '); el.classList.remove('ok'); }
  }
}

function commitCharacter() {
  const scores = { ...DRAFT.base };
  const char = buildCharacter({
    name: $('#charName').value.trim(),
    player: $('#playerName').value.trim(),
    slot: STATE.creationSlot,
    race: DRAFT.race, subrace: DRAFT.subrace, cls: DRAFT.cls, scores,
    asiChoices: DRAFT.asiChoices,
    skills: [...DRAFT.skills, ...DRAFT.skillsExtra],
    armor: DRAFT.armor, shield: DRAFT.shield,
    weapons: DRAFT.weapon ? [DRAFT.weapon] : [],
    fightingStyle: DRAFT.fightingStyle, archetype: DRAFT.archetype,
    cantrips: [...DRAFT.cantrips], spells: [...DRAFT.spells], expertise: [...DRAFT.expertise],
    profile: { ...DRAFT.profile }
  });
  STATE.characters.push(char);

  if (STATE.creationSlot === 0) {
    STATE.creationSlot = 1;
    showCreationModePick();
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
  STATE.visited = [];
  STATE.revealed = [];
  renderSidebar();
  $('#rollLogList').innerHTML = '<div class="rolllog-empty">Nenhuma rolagem ainda.</div>';
  $('#saveBtn').onclick = saveGame;
  $('#menuBtn').onclick = openOptionsMenu;
  $('#rollsToggleBtn').onclick = () => $('.game-layout').classList.toggle('rolls-hidden');
  $('#hideRollsBtn').onclick = () => $('.game-layout').classList.add('rolls-hidden');
  $('#mapBtn').onclick = openMap;
  $('#sendBtn').onclick = submitAction;
  $('#actionInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAction(); }
  });
  // primeira narração da cena de abertura
  beginScene('chegada', true);
}

function renderSidebar() {
  const sb = $('#charPanel');
  // Descanso não é mais manual — é automático em momentos seguros do roteiro
  // (refúgios) ou disparado pelo Mestre via [DESCANSO:...]. Evita recuperação livre.
  const gmBanner = STATE.gmMode ? `<div class="gm-banner">🛠️ Modo Mestre ativo — edição manual</div>` : '';
  sb.innerHTML = gmBanner + STATE.characters.map((c, i) => {
    const pct = Math.max(0, Math.round(c.hp / c.maxHp * 100));
    const sub = `${c.race}${c.subrace?` (${c.subrace})`:''} ${c.cls}${c.fightingStyle?` · ${c.fightingStyle}`:''} Nv${c.level}`;
    return `<div class="char-card ${i===STATE.activeChar?'active-turn':''}">
      <div class="cc-name" data-sheet="${i}" title="Ver ficha completa">${c.name}</div>
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
  attachResourceHandlers();
}

// HTML dos recursos da ficha. Somente leitura por padrão (mudam pela automação
// do Mestre); no "Modo Mestre" (STATE.gmMode) viram controles manuais de correção.
function resourcesHtml(c, i) {
  const res = classResources(c);
  if (!res.length) return '';
  const gm = STATE.gmMode;
  const rows = res.map(r => {
    if (r.kind === 'slots') {
      const pool = c[r.pool] || { used:0 };
      const left = r.max - (pool.used || 0);
      const pips = Array.from({length:r.max},(_,k)=>`<span class="res-pip ${k<left?'full':''}" ${gm?`data-ci="${i}" data-rk="slot" data-pool="${r.pool}" data-idx="${k}"`:''}></span>`).join('');
      return `<div class="res-row"><span class="res-label">${r.label}</span><span class="res-pips">${pips}</span></div>`;
    }
    if (r.kind === 'toggle') {   // Fúria
      const left = r.max - (c.resUsed[r.key]||0);
      const pips = Array.from({length:r.max},(_,k)=>`<span class="res-pip ${k<left?'full':''}"></span>`).join('');
      if (gm) return `<div class="res-row"><button class="res-btn ${c.raging?'on':''}" data-ci="${i}" data-rk="rage">${c.raging?'Fúria ATIVA ●':'Fúria'}</button><span class="res-pips" title="usos">${pips}</span></div>`;
      return `<div class="res-row"><span class="res-label ${c.raging?'on':''}">${r.label}${c.raging?' <b>ATIVA ●</b>':''}</span><span class="res-pips" title="usos">${pips}</span></div>`;
    }
    if (r.kind === 'counter') {
      const left = r.max - (c.resUsed[r.key]||0);
      const pips = Array.from({length:r.max},(_,k)=>`<span class="res-pip ${k<left?'full':''}" ${gm?`data-ci="${i}" data-rk="ctr" data-key="${r.key}" data-idx="${k}"`:''}></span>`).join('');
      return `<div class="res-row"><span class="res-label">${r.label}</span><span class="res-pips">${pips}</span></div>`;
    }
    if (r.kind === 'pool') {
      const left = r.max - (c.resUsed[r.key]||0);
      const ctrl = gm
        ? `<span class="res-pool"><button class="res-mini" data-ci="${i}" data-rk="pool-" data-key="${r.key}">−5</button><b>${left}</b>/${r.max}<button class="res-mini" data-ci="${i}" data-rk="poolr" data-key="${r.key}">↺</button></span>`
        : `<span class="res-pool"><b>${left}</b>/${r.max}</span>`;
      return `<div class="res-row"><span class="res-label">${r.label}</span>${ctrl}</div>`;
    }
    return '';
  }).join('');
  return `<div class="res-block">${rows}</div>`;
}

function attachResourceHandlers() {
  // clicar no nome abre a ficha completa (sempre)
  $$('#charPanel [data-sheet]').forEach(el => el.onclick = () => openSheet(+el.dataset.sheet));
  if (!STATE.gmMode) return;   // fora do Modo Mestre, recursos/condições são só leitura

  $$('#charPanel [data-rk]').forEach(el => el.onclick = () => {
    const c = STATE.characters[+el.dataset.ci];
    const rk = el.dataset.rk;
    if (rk === 'slot') {
      const pool = c[el.dataset.pool]; if (!pool) return;
      const idx = +el.dataset.idx, left = pool.max - pool.used;   // pip cheio gasta; vazio recupera
      pool.used = Math.max(0, Math.min(pool.max, pool.used + ((idx < left) ? 1 : -1)));
    } else if (rk === 'ctr') {
      const key = el.dataset.key, idx = +el.dataset.idx;
      const r = classResources(c).find(x=>x.key===key);
      const left = r.max - (c.resUsed[key]||0);
      c.resUsed[key] = Math.max(0, Math.min(r.max, (c.resUsed[key]||0) + ((idx < left) ? 1 : -1)));
    } else if (rk === 'rage') {
      if (c.raging) { c.raging = false; }
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
  $$('#charPanel .cond-chip[data-cn]').forEach(el => el.onclick = () => {
    const c = STATE.characters[+el.dataset.ci];
    c.conditions = (c.conditions||[]).filter(n => n !== el.dataset.cn);
    renderSidebar();
  });
}

// Chips de condição (Apêndice A). Somente leitura por padrão; editáveis no Modo Mestre.
function conditionsHtml(c, i) {
  const gm = STATE.gmMode;
  if (!gm && !(c.conditions||[]).length) return '';
  const chips = (c.conditions||[]).map(n=> gm
    ? `<span class="cond-chip" data-ci="${i}" data-cn="${n}" title="${RULES.conditions[n]?RULES.conditions[n].desc:''}">${n} ✕</span>`
    : `<span class="cond-chip ro" title="${RULES.conditions[n]?RULES.conditions[n].desc:''}">${n}</span>`).join('');
  if (!gm) return `<div class="cond-block"><div class="cond-chips">${chips}</div></div>`;
  const opts = Object.keys(RULES.conditions).map(n=>`<option value="${n}">${n}</option>`).join('');
  return `<div class="cond-block">
    <select class="cond-add" data-ci="${i}"><option value="">+ condição</option>${opts}</select>
    <div class="cond-chips">${chips}</div>
  </div>`;
}

// ---- Ficha completa (modal) ----
function openSheet(i) {
  const c = STATE.characters[i]; if (!c) return;
  $('#sheetCard').innerHTML = sheetHtml(c, i);
  $('#sheetModal').classList.remove('hide');
  $('#sheetModal').onclick = e => { if (e.target.id === 'sheetModal') closeSheet(); };
  $('#sheetCloseBtn').onclick = closeSheet;
  $$('#sheetCard [data-gold]').forEach(b => b.onclick = () => { c.gold = Math.max(0, c.gold + (b.dataset.gold==='+'?1:-1)); openSheet(i); });
  $$('#sheetCard [data-prof]').forEach(t => t.oninput = () => { c.profile = c.profile || {}; c.profile[t.dataset.prof] = t.value; });
}
function closeSheet() { $('#sheetModal').classList.add('hide'); }

// ---------- MAPA INTERATIVO ----------
function mapMarkSceneVisited() {
  const loc = SCENE_LOC[STATE.sceneId];
  if (loc && !STATE.visited.includes(loc)) STATE.visited.push(loc);
}
// um local é "conhecido" (nome/detalhe visíveis) se foi alcançado OU revelado pelo Mestre.
function mapKnown(id) {
  return STATE.visited.includes(id) || (STATE.revealed||[]).includes(id);
}

// para saves antigos sem 'visited': reconstrói pela ordem linear da campanha
const SCENE_ORDER = ['chegada','praia','claustro','cavernas','sharruth','claustro_volta','naufragio','observatorio','epilogo'];
function reconstructVisited(sceneId) {
  const end = SCENE_ORDER.indexOf(sceneId);
  const seen = [];
  SCENE_ORDER.slice(0, (end < 0 ? SCENE_ORDER.length : end + 1)).forEach(s => {
    const loc = SCENE_LOC[s];
    if (loc && !seen.includes(loc)) seen.push(loc);
  });
  return seen;
}

function mapSvg() {
  const cur = SCENE_LOC[STATE.sceneId];
  // caminhos da rota: só traça entre locais já CONHECIDOS (sem revelar o que falta)
  let paths = '';
  for (let i = 0; i < MAP_ROUTE.length - 1; i++) {
    const a = MAP_LOCS[MAP_ROUTE[i]], b = MAP_LOCS[MAP_ROUTE[i+1]];
    if (!a || !b) continue;
    if (!mapKnown(MAP_ROUTE[i]) || !mapKnown(MAP_ROUTE[i+1])) continue;
    const done = STATE.visited.includes(MAP_ROUTE[i]) && STATE.visited.includes(MAP_ROUTE[i+1]);
    paths += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="map-route ${done?'done':''}" />`;
  }
  const markers = Object.entries(MAP_LOCS).map(([id, m]) => {
    const isCur = id === cur;
    const visited = STATE.visited.includes(id);
    const known = mapKnown(id);
    // local desconhecido → marcador de névoa "?", sem revelar nome nem ícone
    if (!known) {
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

function openMap() {
  mapMarkSceneVisited();
  const m = MAP_LOCS[SCENE_LOC[STATE.sceneId]];
  $('#mapCard').innerHTML = `
    <div class="map-head">
      <div><h3>🗺️ Stormwreck Isle</h3><span class="map-sub">A jornada até aqui</span></div>
      <button class="rp-close" id="mapCloseBtn" title="Fechar">✕</button>
    </div>
    <div class="map-body">${mapSvg()}</div>
    <div class="map-detail" id="mapDetail"></div>`;
  $('#mapModal').classList.remove('hide');
  $('#mapModal').onclick = e => { if (e.target.id === 'mapModal') closeMap(); };
  $('#mapCloseBtn').onclick = closeMap;
  const showDetail = id => {
    const loc = MAP_LOCS[id]; if (!loc) return;
    // local desconhecido → não revela nome nem resumo
    if (!mapKnown(id)) {
      $('#mapDetail').innerHTML = `<div class="map-d-head">❔ <b>Área desconhecida</b> <span class="map-tag dim">não revelada</span></div>
        <p>Uma região da ilha que vocês ainda não alcançaram nem ouviram falar. Explore ou deixe o Mestre revelá-la.</p>`;
      return;
    }
    const here = id === SCENE_LOC[STATE.sceneId];
    const seen = STATE.visited.includes(id);
    const tag = here ? '<span class="map-tag here">você está aqui</span>'
              : seen ? '<span class="map-tag seen">visitado</span>'
              : '<span class="map-tag revealed">revelado pelo Mestre</span>';
    $('#mapDetail').innerHTML = `<div class="map-d-head">${loc.icon} <b>${loc.label}</b> ${tag}</div>
      <div class="map-d-chap">${loc.chapter}</div>
      <p>${loc.summary}</p>`;
  };
  $$('#mapCard .map-marker').forEach(g => {
    g.onclick = () => showDetail(g.dataset.loc);
    g.onkeydown = e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); showDetail(g.dataset.loc); } };
  });
  // detalhe inicial: local atual se houver; senão, instrução
  const curLoc = SCENE_LOC[STATE.sceneId];
  if (curLoc) showDetail(curLoc);
  else $('#mapDetail').innerHTML = `<p>Vocês ainda estão em alto-mar, a caminho da ilha. As áreas serão reveladas conforme exploram.</p>`;
}
function closeMap() { $('#mapModal').classList.add('hide'); }

// ---------- MENU DE OPÇÕES (botão ☰) ----------
function openOptionsMenu() {
  const modelLabel = STATE.model && STATE.model.includes('sonnet') ? 'Sonnet 4.6 (rico)' : 'Haiku 4.5 (rápido)';
  $('#menuCard').innerHTML = `
    <div class="map-head">
      <div><h3>☰ Opções</h3><span class="map-sub">${CAMPAIGN.title}</span></div>
      <button class="rp-close" id="menuCloseBtn" title="Fechar">✕</button>
    </div>
    <div class="menu-list">
      <button class="menu-item" id="miSave"><span class="mi-ic">💾</span><span><b>Salvar jogo</b><small>Guarda o progresso na sua conta</small></span></button>
      <button class="menu-item" id="miLoad"><span class="mi-ic">📂</span><span><b>Carregar jogo salvo</b><small>Substitui a sessão atual pelo último save</small></span></button>
      <button class="menu-item" id="miMap"><span class="mi-ic">🗺️</span><span><b>Mapa da ilha</b><small>Locais descobertos e a jornada</small></span></button>
      <div class="menu-item static"><span class="mi-ic">🤖</span><span style="flex:1"><b>Modelo da IA</b><small>Atual: ${modelLabel}</small></span>
        <select id="miModel" class="menu-select">
          <option value="claude-haiku-4-5" ${STATE.model&&STATE.model.includes('haiku')?'selected':''}>Haiku (barato)</option>
          <option value="claude-sonnet-4-6" ${STATE.model&&STATE.model.includes('sonnet')?'selected':''}>Sonnet (rico)</option>
        </select>
      </div>
      <button class="menu-item" id="miChars"><span class="mi-ic">👥</span><span><b>Ver personagens</b><small>Abre/fecha o painel de fichas</small></span></button>
      <button class="menu-item ${STATE.gmMode?'gm-on':''}" id="miGm"><span class="mi-ic">🛠️</span><span><b>Modo Mestre — edição manual ${STATE.gmMode?'<i>(LIGADO)</i>':''}</b><small>Reativa os controles de recurso/condição na ficha p/ corrigir à mão</small></span></button>
      <button class="menu-item warn" id="miRestart"><span class="mi-ic">🔄</span><span><b>Reiniciar do começo</b><small>Recomeça a aventura com os mesmos heróis</small></span></button>
      <button class="menu-item danger" id="miLogout"><span class="mi-ic">🚪</span><span><b>Sair da conta</b><small>Faz logout e volta ao login</small></span></button>
    </div>`;
  $('#menuModal').classList.remove('hide');
  $('#menuModal').onclick = e => { if (e.target.id === 'menuModal') closeOptionsMenu(); };
  $('#menuCloseBtn').onclick = closeOptionsMenu;
  $('#miSave').onclick = () => { closeOptionsMenu(); saveGame(); };
  $('#miLoad').onclick = () => { if (confirm('Carregar o último jogo salvo? O progresso não salvo desta sessão será perdido.')) { closeOptionsMenu(); loadGame(); } };
  $('#miMap').onclick = () => { closeOptionsMenu(); openMap(); };
  $('#miModel').onchange = e => { STATE.model = e.target.value; toast('Modelo: ' + (e.target.value.includes('sonnet')?'Sonnet 4.6':'Haiku 4.5')); };
  $('#miChars').onclick = () => { closeOptionsMenu(); $('#sidebar').classList.toggle('mobile-open'); };
  $('#miGm').onclick = () => {
    STATE.gmMode = !STATE.gmMode;
    renderSidebar();
    toast(STATE.gmMode ? '🛠️ Modo Mestre LIGADO — controles manuais ativos.' : 'Modo Mestre desligado — ficha somente leitura.');
    openOptionsMenu();   // re-renderiza o menu p/ atualizar o rótulo
  };
  $('#miRestart').onclick = () => { if (confirm('Reiniciar a aventura do começo? Os personagens são mantidos, mas a história recomeça.')) { closeOptionsMenu(); startGame(); } };
  $('#miLogout').onclick = () => { if (confirm('Sair da sua conta? Salve antes se quiser manter o progresso.')) { closeOptionsMenu(); doLogout(); } };
}
function closeOptionsMenu() { $('#menuModal').classList.add('hide'); }

// revela um local do mapa (chamado pelo marcador [REVELAR_LOCAL:id] do Mestre)
function revealMapLocation(id) {
  if (!MAP_LOCS[id] || mapKnown(id)) return false;
  STATE.revealed = STATE.revealed || [];
  STATE.revealed.push(id);
  return true;
}

// ---------- AUTOMAÇÃO DE RECURSOS/CONDIÇÕES (marcadores do Mestre) ----------
// resolve um personagem pelo nome (ou nome do jogador), tolerante a caixa/parciais
function findCharIndexByName(name) {
  if (!name) return -1;
  const q = name.trim().toLowerCase();
  const first = q.split(/\s+/)[0];
  let i = STATE.characters.findIndex(c => c.name.toLowerCase() === q);
  if (i < 0) i = STATE.characters.findIndex(c => c.name.toLowerCase().split(/\s+/)[0] === first);
  if (i < 0) i = STATE.characters.findIndex(c => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()));
  if (i < 0) i = STATE.characters.findIndex(c => (c.player||'').toLowerCase() === q);
  return i;
}
// consome 1 espaço de magia do nível indicado (1 ou 2)
function spendSpellSlot(ci, level) {
  const c = STATE.characters[ci]; if (!c) return null;
  const pool = (+level >= 2) ? c.spellSlots2 : c.spellSlots;
  if (!pool || pool.max == null) return null;
  if (pool.used >= pool.max) return `${c.name}: sem slots de nível ${level}`;
  pool.used += 1;
  return `${c.name} gastou 1 slot nv${level} (${pool.max - pool.used}/${pool.max})`;
}
// consome um recurso de classe pela chave (rage, secondwind, ki, channel, layon, etc.)
function spendResource(ci, key, amount) {
  const c = STATE.characters[ci]; if (!c) return null;
  const r = classResources(c).find(x => x.key.toLowerCase() === String(key).toLowerCase());
  if (!r) return null;
  if (r.kind === 'slots') {                       // slots de pacto (Bruxo)
    const pool = c[r.pool]; if (!pool) return null;
    if (pool.used >= pool.max) return `${c.name}: sem ${r.label}`;
    pool.used += 1; return `${c.name}: ${r.label} (${pool.max-pool.used}/${pool.max})`;
  }
  if (r.kind === 'toggle') {                       // Fúria
    const left = r.max - (c.resUsed[r.key]||0);
    if (c.raging) return null;
    if (left <= 0) return `${c.name}: sem usos de ${r.label}`;
    c.raging = true; c.resUsed[r.key] = (c.resUsed[r.key]||0)+1;
    return `${c.name}: ${r.label} ATIVA (${left-1} restante)`;
  }
  if (r.kind === 'pool') {                          // Imposição das Mãos
    const left = r.max - (c.resUsed[r.key]||0);
    const amt = Math.min(left, Math.max(1, +amount || 5));
    if (left <= 0) return `${c.name}: ${r.label} esgotada`;
    c.resUsed[r.key] = (c.resUsed[r.key]||0) + amt;
    return `${c.name}: ${r.label} −${amt} (${left-amt}/${r.max})`;
  }
  // counter (Retomar Fôlego, Surto, Canalizar, Ki, Inspiração, Recuperação)
  const left = r.max - (c.resUsed[r.key]||0);
  if (left <= 0) return `${c.name}: sem usos de ${r.label}`;
  c.resUsed[r.key] = (c.resUsed[r.key]||0) + 1;
  return `${c.name}: ${r.label} usado (${left-1}/${r.max})`;
}
// casa o nome de condição com as chaves de RULES.conditions (tolerante a acento/caixa)
function matchConditionName(name) {
  if (!name) return null;
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const q = norm(name);
  return Object.keys(RULES.conditions).find(k => norm(k) === q)
      || Object.keys(RULES.conditions).find(k => norm(k).startsWith(q) || q.startsWith(norm(k)))
      || null;
}
function applyCondition(ci, name) {
  const c = STATE.characters[ci]; if (!c) return null;
  const key = matchConditionName(name); if (!key) return null;
  c.conditions = c.conditions || [];
  if (c.conditions.includes(key)) return null;
  c.conditions.push(key);
  return `${c.name}: ${key}`;
}
function removeCondition(ci, name) {
  const c = STATE.characters[ci]; if (!c) return null;
  const key = matchConditionName(name); if (!key) return null;
  if (!(c.conditions||[]).includes(key)) return null;
  c.conditions = c.conditions.filter(n => n !== key);
  return `${c.name}: fim de ${key}`;
}

function sheetHtml(c, i) {
  const abil = RULES.abilities.map(a => {
    const save = c.saves.includes(a), sm = abilityMod(c.abilities[a]) + (save?c.prof:0);
    return `<div class="sh-ab"><div class="l">${a}</div><div class="v">${c.abilities[a]}</div><div class="m">${fmtMod(abilityMod(c.abilities[a]))}</div><div class="sv ${save?'prof':''}">save ${fmtMod(sm)}</div></div>`;
  }).join('');
  const skills = Object.entries(RULES.skills).map(([name,ab]) => {
    const prof = (c.skills||[]).includes(name), m = abilityMod(c.abilities[ab]) + (prof?c.prof:0);
    return `<div class="sh-skill ${prof?'prof':''}"><span>${prof?'●':'○'} ${name} <small>(${ab})</small></span><b>${fmtMod(m)}</b></div>`;
  }).join('');
  const traits = (c.traits||[]).map(t=>`<span class="sh-tag">${t}</span>`).join('') || '—';
  const feats  = (c.features||[]).map(t=>`<span class="sh-tag">${t}</span>`).join('') || '—';
  const conds  = (c.conditions||[]).length ? `<h4>Condições</h4><div class="sh-tags">${c.conditions.map(t=>`<span class="sh-tag">${t}</span>`).join('')}</div>` : '';
  const spell  = c.spellSlots ? `<div class="sh-line">Conjuração — habilidade ${c.spellAbility}, CD ${c.spellDC}, slots nv${c.spellSlots.level||1} ${c.spellSlots.max-c.spellSlots.used}/${c.spellSlots.max}${c.spellSlots2&&c.spellSlots2.max?`, nv2 ${c.spellSlots2.max-c.spellSlots2.used}/${c.spellSlots2.max}`:''}${c.cantripsKnown?`, truques ${c.cantripsKnown}`:''}</div>` : '';
  const known  = ((c.cantripsChosen&&c.cantripsChosen.length)||(c.spellsChosen&&c.spellsChosen.length))
    ? `<h4>Magias conhecidas</h4><div class="sh-tags">${(c.cantripsChosen||[]).map(s=>`<span class="sh-tag" title="${(RULES.spells[s]||{}).desc||''}">${s} <small>(truque)</small></span>`).join('')}${(c.spellsChosen||[]).map(s=>`<span class="sh-tag" title="${(RULES.spells[s]||{}).desc||''}">${s}</span>`).join('')}</div>` : '';
  const exp    = (c.expertise&&c.expertise.length) ? `<div class="sh-line" style="color:var(--myco)">Especialização (proficiência dobrada): ${c.expertise.join(', ')}</div>` : '';
  const inv    = (c.inventory||[]).map(it=>`<li>${it}</li>`).join('') || '<li>—</li>';
  const p = c.profile || {};
  const pf = (k,label) => `<label class="sh-pf"><span>${label}</span><textarea data-prof="${k}" data-ci="${i}" rows="2">${p[k]||''}</textarea></label>`;
  return `
  <div class="sh-top">
    <div><div class="sh-name">${c.name}</div><div class="sh-sub">${c.race}${c.subrace?` (${c.subrace})`:''} · ${c.cls}${c.archetype?` [${c.archetype}]`:''}${c.fightingStyle?` · ${c.fightingStyle}`:''} · Nível ${c.level} · ${c.player}</div></div>
    <button class="rp-close" id="sheetCloseBtn">✕</button>
  </div>
  <div class="sh-stats">
    <div class="sh-stat"><span>CA</span><b>${c.ca}</b></div>
    <div class="sh-stat"><span>HP</span><b>${c.hp}/${c.maxHp}</b></div>
    <div class="sh-stat"><span>Deslocamento</span><b>${c.speed}m</b></div>
    <div class="sh-stat"><span>Iniciativa</span><b>${fmtMod(abilityMod(c.abilities.DES))}</b></div>
    <div class="sh-stat"><span>Proficiência</span><b>+${c.prof}</b></div>
    <div class="sh-stat"><span>Visão escuro</span><b>${c.darkvision?c.darkvisionRange+'m':'—'}</b></div>
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
      <h4>Bolsa <span class="sh-gold">${c.gold} <button class="res-mini" data-gold="-" data-ci="${i}">−</button> <button class="res-mini" data-gold="+" data-ci="${i}">+</button> po</span></h4>
      <ul class="sh-inv">${inv}</ul>
    </div>
  </div>
  <h4>Perfil do personagem</h4>
  <div class="sh-profile">
    ${pf('appearance','Descrição física')}
    ${pf('context','Por que está aqui')}
    ${pf('motivation','Motivações')}
    ${pf('flaw','Defeitos')}
    ${pf('quality','Qualidades')}
  </div>`;
}

// Descanso: curto restaura recursos 'short' (e Pacto do Bruxo); longo restaura tudo + HP.
// auto=true → disparado pelo roteiro/Mestre; anuncia na narrativa em vez de toast.
function doRest(kind, auto) {
  STATE.characters.forEach(c => {
    const res = classResources(c);
    if (kind === 'long') {
      c.hp = c.maxHp; c.raging = false; c.resUsed = {}; c.conditions = [];
      if (c.spellSlots) c.spellSlots.used = 0;
      if (c.spellSlots2) c.spellSlots2.used = 0;
    } else {
      res.forEach(r => {
        if (r.recharge === 'short') {
          if (r.kind === 'slots') { if (c[r.pool]) c[r.pool].used = 0; }   // Bruxo (Pacto)
          else c.resUsed[r.key] = 0;
        }
      });
    }
  });
  renderSidebar();
  const msg = kind === 'long'
    ? '🌙 Descanso longo — HP, espaços de magia, condições e recursos restaurados.'
    : '☕ Descanso curto — recursos de descanso curto restaurados.';
  if (auto) addMsg('dm', `<div style="text-align:center;color:var(--myco);font-family:var(--font-mono);font-size:0.8rem;letter-spacing:0.08em;margin:10px 0">${msg}</div>`);
  else toast(msg);
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
  mapMarkSceneVisited();
  updateTopbar(); updateQuickActions(); updateTurnIndicator();

  // level up interativo se a cena exige
  if (sc.levelUp) await beginLevelUp(sc.levelUp);

  // mostra o texto de leitura da cena (vem do roteiro, não da IA — economiza tokens)
  await addMsgTyped('dm', sc.readAloud);

  // descanso automático quando o roteiro indica um momento seguro (refúgio)
  if (sc.rest) doRest(sc.rest, true);

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

// ---- LEVEL-UP INTERATIVO ----
let LU = null, LU_LEVEL = 1, LU_RESOLVE = null;

function beginLevelUp(newLevel) {
  const leveling = STATE.characters.map((c,i)=>({c,i})).filter(x => x.c.level < newLevel);
  if (!leveling.length) return Promise.resolve();
  LU_LEVEL = newLevel;
  LU = leveling.map(({c,i}) => ({
    i, hpMode:'avg', hpRolled:null,
    hpGain: hitDieAverage(RULES.classes[c.cls].hitDie) + abilityMod(c.abilities.CON),
    archetype:null, fightingStyle:null
  }));
  renderLevelUp();
  $('#levelupModal').classList.remove('hide');
  return new Promise(res => { LU_RESOLVE = res; });
}

function luCharHtml(st, k) {
  const c = STATE.characters[st.i];
  const hd = RULES.classes[c.cls].hitDie;
  const avg = hitDieAverage(hd) + abilityMod(c.abilities.CON);
  const need = levelUpNeeds(c, LU_LEVEL);
  const feats = (RULES.classes[c.cls].features && RULES.classes[c.cls].features[LU_LEVEL]) || [];
  let h = `<div class="lu-char"><div class="lu-name">${c.name} — ${c.cls} nível ${c.level} → ${LU_LEVEL}</div>`;
  h += `<div class="lu-row"><span>Pontos de vida (CON ${fmtMod(abilityMod(c.abilities.CON))})</span><div class="lu-opts">
    <button class="lu-opt ${st.hpMode==='avg'?'sel':''}" data-lu="avg" data-k="${k}">Média +${avg}</button>
    <button class="lu-opt ${st.hpMode==='roll'?'sel':''}" data-lu="roll" data-k="${k}">🎲 Rolar d${hd}${st.hpRolled?` → +${st.hpGain}`:''}</button>
  </div></div>`;
  if (need.subclass) h += `<div class="lu-row"><span>Subclasse <em>(obrigatório)</em></span><div class="lu-opts">` +
    (RULES.classes[c.cls].subclasses||[]).map(s=>`<button class="lu-opt ${st.archetype===s?'sel':''}" data-lu="arch" data-k="${k}" data-v="${s}">${s}</button>`).join('') + `</div></div>`;
  if (need.fightingStyle) h += `<div class="lu-row"><span>Estilo de Luta <em>(obrigatório)</em></span><div class="lu-opts">` +
    Object.keys(RULES.fightingStyles).map(s=>`<button class="lu-opt ${st.fightingStyle===s?'sel':''}" data-lu="fs" data-k="${k}" data-v="${s}">${s}</button>`).join('') + `</div></div>`;
  if (feats.length) h += `<div class="lu-feats">Ganha: ${feats.join(', ')}</div>`;
  return h + `</div>`;
}

function renderLevelUp() {
  const card = $('#levelupCard');
  card.innerHTML = `<div class="lu-head">⬆ Subir para o nível ${LU_LEVEL}</div>` +
    LU.map((st,k)=>luCharHtml(st,k)).join('') +
    `<div class="lu-actions"><button class="btn" id="luApplyBtn">Aplicar e continuar →</button></div>`;
  LU.forEach((st, k) => {
    const c = STATE.characters[st.i], hd = RULES.classes[c.cls].hitDie, conMod = abilityMod(c.abilities.CON);
    card.querySelector(`[data-lu="avg"][data-k="${k}"]`).onclick = () => { st.hpMode='avg'; st.hpRolled=null; st.hpGain=hitDieAverage(hd)+conMod; renderLevelUp(); };
    card.querySelector(`[data-lu="roll"][data-k="${k}"]`).onclick = () => { st.hpRolled=rollDie(hd); st.hpMode='roll'; st.hpGain=st.hpRolled+conMod; renderLevelUp(); };
    card.querySelectorAll(`[data-lu="arch"][data-k="${k}"]`).forEach(el=>el.onclick=()=>{ st.archetype=el.dataset.v; renderLevelUp(); });
    card.querySelectorAll(`[data-lu="fs"][data-k="${k}"]`).forEach(el=>el.onclick=()=>{ st.fightingStyle=el.dataset.v; renderLevelUp(); });
  });
  const ok = LU.every(st => { const c=STATE.characters[st.i], n=levelUpNeeds(c,LU_LEVEL); return (!n.subclass||st.archetype)&&(!n.fightingStyle||st.fightingStyle); });
  $('#luApplyBtn').disabled = !ok;
  $('#luApplyBtn').onclick = applyLevelUp;
}

function applyLevelUp() {
  LU.forEach(st => {
    const c = STATE.characters[st.i];
    c.maxHp += Math.max(1, st.hpGain);
    c.level = LU_LEVEL;
    c.xp = RULES.xpTable[LU_LEVEL] || c.xp;
    c.prof = profBonus(c.level);
    if (st.archetype) c.archetype = st.archetype;
    if (st.fightingStyle) c.fightingStyle = st.fightingStyle;
    if (c.fightingStyle === 'Defesa' && c.armor && c.armor !== 'Nenhuma') c.ca = computeAC(c.cls, c.abilities, c.armor, c.shield) + 1;
    ((RULES.classes[c.cls].features && RULES.classes[c.cls].features[c.level]) || []).forEach(f => { if (!c.features.includes(f)) c.features.push(f); });
    recomputeSpellSlots(c);
    // descanso longo embutido: restaura tudo
    c.hp = c.maxHp; c.raging = false; c.resUsed = {}; c.conditions = [];
    if (c.spellSlots) c.spellSlots.used = 0;
    if (c.spellSlots2) c.spellSlots2.used = 0;
  });
  $('#levelupModal').classList.add('hide');
  renderSidebar();
  toast(`Subiram para o nível ${LU_LEVEL}!`);
  const r = LU_RESOLVE; LU = null; LU_RESOLVE = null;
  if (r) r();
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
    (c.spellSlots?` Spell slots nv${c.spellSlots.level||1}: ${c.spellSlots.max-c.spellSlots.used}/${c.spellSlots.max} (CD ${c.spellDC}).${c.spellSlots2&&c.spellSlots2.max?` Nv2: ${c.spellSlots2.max-c.spellSlots2.used}/${c.spellSlots2.max}.`:''}`:'') +
    ((c.cantripsChosen&&c.cantripsChosen.length)?` Truques: ${c.cantripsChosen.join(', ')}.`:'') +
    ((c.spellsChosen&&c.spellsChosen.length)?` Magias nv1: ${c.spellsChosen.join(', ')}.`:'') +
    ((c.expertise&&c.expertise.length)?` Especialização: ${c.expertise.join(', ')}.`:'') +
    (c.conditions&&c.conditions.length?` Condições ativas: ${c.conditions.join(', ')}.`:'') +
    (classResources(c).length?` Recursos [chave→restante]: ${classResources(c).map(r=>{const used=r.kind==='slots'?(c[r.pool]?c[r.pool].used:0):(c.resUsed[r.key]||0);return `${r.key}→${r.max-used}/${r.max}`;}).join(', ')}.`:'') +
    ((c.profile&&(c.profile.appearance||c.profile.context||c.profile.motivation||c.profile.flaw||c.profile.quality))
      ? ` Perfil — aparência: ${c.profile.appearance||'—'}; por que está aqui: ${c.profile.context||'—'}; motivações: ${c.profile.motivation||'—'}; defeitos: ${c.profile.flaw||'—'}; qualidades: ${c.profile.quality||'—'}.`
      : '')
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
- Quando um personagem conjura uma MAGIA de nível 1+ (não truque/cantrip): [GASTAR_SLOT:NomeDoPersonagem:nível] — ex.: [GASTAR_SLOT:Eldrin:1]. O sistema baixa o slot na ficha automaticamente. Truques NÃO gastam slot.
- Quando um personagem usa um RECURSO de classe (Fúria, Retomar Fôlego, Surto de Ação, Canalizar Divindade, Ki, Inspiração de Bardo, Recuperação Arcana, Imposição das Mãos): [GASTAR_RECURSO:NomeDoPersonagem:chave] — use a "chave" exata listada nos Recursos de cada ficha (ex.: [GASTAR_RECURSO:Garrett:secondwind], [GASTAR_RECURSO:Bjorn:rage]). Para Imposição das Mãos, informe os pontos: [GASTAR_RECURSO:Auric:layon:10]. A ficha é somente leitura — só estes marcadores alteram recursos e condições.
- Quando um personagem fica sob uma CONDIÇÃO (Apêndice A): [CONDICAO:NomeDoPersonagem:Condição] — ex.: [CONDICAO:Garrett:Envenenado]. Quando a condição acaba: [REMOVER_CONDICAO:NomeDoPersonagem:Condição]. Condições válidas: ${Object.keys(RULES.conditions).join(', ')}.
- Para revelar uma área do mapa que os heróis avistaram ou ouviram falar (mas ainda não alcançaram): [REVELAR_LOCAL:id]. Áreas só aparecem nomeadas no mapa quando reveladas ou alcançadas.
- Descanso SÓ em momento narrativamente seguro (acampamento protegido, refúgio, após escapar do perigo): [DESCANSO:curto] ou [DESCANSO:longo]. O sistema restaura HP/recursos automaticamente. NUNCA conceda descanso no meio de uma masmorra hostil, em combate, ou só porque os jogadores pediram — exija ficção que justifique. Refúgios do roteiro já descansam sozinhos.
- Quando a cena termina: [SCENE_COMPLETE]

## MAPA DA ILHA (ids para [REVELAR_LOCAL])
${Object.entries(MAP_LOCS).map(([id,m])=>`- ${id}: ${m.label} — ${mapKnown(id)?'JÁ CONHECIDO pelos jogadores':'desconhecido (não mencione o nome até revelar/alcançar)'}`).join('\n')}

## EXEMPLO de uso dos marcadores (emita-os SEMPRE que o evento ocorrer — a ficha é automática)
Jogador: "Lanço Mísseis Mágicos no esqueleto."
Mestre: Três dardos de força perfuram o esqueleto. [GASTAR_SLOT:Eldrin:1] [HIT:e1:9]
Jogador: "O Bárbaro entra em fúria e ataca."
Mestre: Bjorn ruge e avança. [GASTAR_RECURSO:Bjorn:rage] [ROLL:ataque:FOR:0]
Mestre (após o veneno): O líquido queima as veias dele. [CONDICAO:Bjorn:Envenenado]

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
    .replace(/\[GASTAR_SLOT:[^\]]+\]/g,'')
    .replace(/\[CONDICAO:[^\]]+\]/g,'')
    .replace(/\[REMOVER_CONDICAO:[^\]]+\]/g,'')
    .replace(/\[GASTAR_RECURSO:[^\]]+\]/g,'')
    .replace(/\[REVELAR_LOCAL:[^\]]+\]/g,'')
    .replace(/\[DESCANSO:[^\]]+\]/g,'')
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

  // automação de fichas: gasto de slot, condições aplicadas/removidas, revelação de mapa
  let sheetChanged = false;
  const notes = [];
  [...reply.matchAll(/\[GASTAR_SLOT:([^:\]]+):(\d+)\]/g)].forEach(m => {
    const ci = findCharIndexByName(m[1]); if (ci < 0) return;
    const r = spendSpellSlot(ci, +m[2]); if (r) { notes.push('🔮 '+r); sheetChanged = true; }
  });
  [...reply.matchAll(/\[CONDICAO:([^:\]]+):([^:\]]+)\]/g)].forEach(m => {
    const ci = findCharIndexByName(m[1]); if (ci < 0) return;
    const r = applyCondition(ci, m[2]); if (r) { notes.push('☠️ '+r); sheetChanged = true; }
  });
  [...reply.matchAll(/\[REMOVER_CONDICAO:([^:\]]+):([^:\]]+)\]/g)].forEach(m => {
    const ci = findCharIndexByName(m[1]); if (ci < 0) return;
    const r = removeCondition(ci, m[2]); if (r) { notes.push('✨ '+r); sheetChanged = true; }
  });
  [...reply.matchAll(/\[GASTAR_RECURSO:([^:\]]+):([^:\]]+)(?::(\d+))?\]/g)].forEach(m => {
    const ci = findCharIndexByName(m[1]); if (ci < 0) return;
    const r = spendResource(ci, m[2], m[3]); if (r) { notes.push('⚡ '+r); sheetChanged = true; }
  });
  [...reply.matchAll(/\[REVELAR_LOCAL:([^\]]+)\]/g)].forEach(m => {
    if (revealMapLocation(m[1].trim())) notes.push('🗺️ Novo local revelado: ' + MAP_LOCS[m[1].trim()].label);
  });
  // descanso disparado pela narrativa (momento seguro): [DESCANSO:curto|longo]
  const restMark = reply.match(/\[DESCANSO:(curto|longo|short|long)\]/i);
  if (restMark) {
    const kind = /long|longo/i.test(restMark[1]) ? 'long' : 'short';
    doRest(kind, true);
  }
  if (sheetChanged) renderSidebar();
  notes.forEach(n => toast(n));

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
    model: STATE.model,
    visited: STATE.visited,
    revealed: STATE.revealed
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
  STATE.visited = Array.isArray(save.visited) && save.visited.length
    ? save.visited
    : reconstructVisited(save.sceneId);
  STATE.revealed = Array.isArray(save.revealed) ? save.revealed : [];
  mapMarkSceneVisited();
  STATE.history = save.history;
  STATE.model = save.model || 'claude-haiku-4-5';

  showScreen('screen-game');
  renderSidebar();
  updateTopbar(); updateQuickActions(); updateTurnIndicator();
  $('#saveBtn').onclick = saveGame;
  $('#menuBtn').onclick = openOptionsMenu;
  $('#rollsToggleBtn').onclick = () => $('.game-layout').classList.toggle('rolls-hidden');
  $('#hideRollsBtn').onclick = () => $('.game-layout').classList.add('rolls-hidden');
  $('#mapBtn').onclick = openMap;
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
