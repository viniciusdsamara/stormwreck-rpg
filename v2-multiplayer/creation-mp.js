// ====================================================================
//  Criação de personagem para o lobby multiplayer (M2).
//  Porta a criação guiada da V1, reaproveitando rules.js. Cada jogador
//  cria UM personagem; ao concluir, ON_DONE(char) devolve ao lobby.
// ====================================================================
let DRAFT = null, ON_DONE = null;
const POINT_COST = {8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};
const POINT_BUDGET = 27;

function startCreationMp(playerName, onDone){
  ON_DONE = onDone;
  DRAFT = { race:null, subrace:null, cls:null, base:{ FOR:8, DES:8, CON:8, INT:8, SAB:8, CAR:8 },
            skills:[], skillsExtra:[], asiChoices:[], armor:'Nenhuma', shield:false, weapon:null,
            fightingStyle:null, archetype:null, cantrips:[], spells:[], expertise:[],
            player: playerName || 'Jogador',
            profile:{ appearance:'', context:'', motivation:'', flaw:'', quality:'' } };
  show('screen-create');
  renderCreationForm();
}

function renderCreationForm(){
  $('#cName').value = '';
  $('#raceGrid').innerHTML = Object.entries(RULES.races).map(([name, r]) => {
    const asi = Object.entries(r.asi).map(([k,v])=>`${k}+${v}`).join(' ');
    const extra = r.asiChoice ? ` +1×${r.asiChoice.count}` : '';
    const sub = (r.subraces && Object.keys(r.subraces).length) ? ' · sub-raças' : '';
    return `<div class="choice" data-race="${name}"><div class="name">${name}</div>
      <div class="meta">${asi}${extra}${r.darkvision?' · darkvision':''}${sub}</div></div>`;
  }).join('');
  $('#classGrid').innerHTML = Object.entries(RULES.classes).map(([name, c]) => {
    const sk = c.spell ? ` · conjura ${c.spell.ability}` : '';
    return `<div class="choice" data-class="${name}"><div class="name">${name}</div>
      <div class="meta">d${c.hitDie} · ${c.primary.join('/')}${sk}</div></div>`;
  }).join('');
  ['#subraceSection','#asiChoiceSection','#skillsSection','#equipmentSection','#classOptionsSection','#spellSection','#expertiseSection'].forEach(s=>$(s).classList.add('hide'));
  renderAbilityGrid();

  $$('#raceGrid .choice').forEach(el => el.onclick = () => {
    $$('#raceGrid .choice').forEach(c=>c.classList.remove('selected'));
    el.classList.add('selected');
    DRAFT.race = el.dataset.race; DRAFT.subrace = null;
    DRAFT.skills = []; DRAFT.skillsExtra = []; DRAFT.asiChoices = [];
    renderSubraces(); renderAsiChoice(); renderSkills(); renderEquipment(); renderAbilityGrid(); checkCreationReady();
  });
  $$('#classGrid .choice').forEach(el => el.onclick = () => {
    $$('#classGrid .choice').forEach(c=>c.classList.remove('selected'));
    el.classList.add('selected');
    DRAFT.cls = el.dataset.class; DRAFT.skills = [];
    DRAFT.armor = null; DRAFT.weapon = null; DRAFT.fightingStyle = null; DRAFT.archetype = null;
    DRAFT.cantrips = []; DRAFT.spells = []; DRAFT.expertise = [];
    renderSkills(); renderEquipment(); renderClassOptions(); renderSpells(); renderExpertise(); checkCreationReady();
  });
  $('#cName').oninput = checkCreationReady;
  ['appearance','context','motivation','flaw','quality'].forEach(k => {
    const el = $('#pf_'+k); if (el){ el.value=''; el.oninput = () => DRAFT.profile[k] = el.value; }
  });
  $('#cCreateBtn').onclick = finishCreationMp;
  $('#cBackBtn').onclick = () => { show('screen-room'); refreshRoom(); };
  checkCreationReady();
}

function abilityRaceBonus(ab){
  if (!DRAFT.race) return 0;
  const r = RULES.races[DRAFT.race];
  let b = r.asi[ab] || 0;
  if (DRAFT.subrace && r.subraces[DRAFT.subrace]) b += (r.subraces[DRAFT.subrace].asi || {})[ab] || 0;
  if (r.asiChoice && DRAFT.asiChoices.includes(ab)) b += r.asiChoice.amount;
  return b;
}
function pointsSpent(){ return RULES.abilities.reduce((s,a)=>s+(POINT_COST[DRAFT.base[a]]||0),0); }
function draftAbilities(){ const base={...DRAFT.base}; return DRAFT.race ? applyASI(base, DRAFT.race, DRAFT.subrace, DRAFT.asiChoices) : base; }
function updateAC(){
  if (!DRAFT.cls) return;
  let ac = computeAC(DRAFT.cls, draftAbilities(), DRAFT.armor, DRAFT.shield);
  if (DRAFT.fightingStyle === 'Defesa' && DRAFT.armor && DRAFT.armor !== 'Nenhuma') ac += 1;
  const el = $('#acPreview'); if (el) el.textContent = ac;
}
function renderAbilityGrid(){
  const left = POINT_BUDGET - pointsSpent();
  const pl = $('#pointsLeft'); if (pl) pl.textContent = left;
  $('#abilityGrid').innerHTML = RULES.abilities.map(ab => {
    const base = DRAFT.base[ab], rb = abilityRaceBonus(ab), fin = base + rb;
    const canInc = base < 15 && (POINT_COST[base+1] - POINT_COST[base]) <= left, canDec = base > 8;
    return `<div class="ability-box assigned"><div class="ab-label">${ab}${rb?` <span style="color:var(--myco)">+${rb}</span>`:''}</div>
      <div class="ab-pb"><button class="pb-btn" data-pb="-" data-ab="${ab}" ${canDec?'':'disabled'}>−</button><span class="ab-base">${base}</span><button class="pb-btn" data-pb="+" data-ab="${ab}" ${canInc?'':'disabled'}>+</button></div>
      <div class="ab-score">${fin}</div><div class="ab-mod">${fmtMod(abilityMod(fin))}</div></div>`;
  }).join('');
  $$('#abilityGrid .pb-btn').forEach(b => b.onclick = () => {
    const ab = b.dataset.ab;
    if (b.dataset.pb === '+') DRAFT.base[ab] = Math.min(15, DRAFT.base[ab] + 1);
    else DRAFT.base[ab] = Math.max(8, DRAFT.base[ab] - 1);
    renderAbilityGrid(); updateAC(); renderSpells(); checkCreationReady();
  });
}
function renderSubraces(){
  const sec=$('#subraceSection'), grid=$('#subraceGrid');
  const subs = DRAFT.race ? RULES.races[DRAFT.race].subraces : null;
  if (!subs || !Object.keys(subs).length){ sec.classList.add('hide'); grid.innerHTML=''; return; }
  sec.classList.remove('hide');
  grid.innerHTML = Object.entries(subs).map(([name, sr]) => {
    const asi = Object.entries(sr.asi||{}).map(([k,v])=>`${k}+${v}`).join(' ');
    return `<div class="choice" data-subrace="${name}"><div class="name">${name}</div><div class="meta">${asi||'—'}</div></div>`;
  }).join('');
  $$('#subraceGrid .choice').forEach(el => el.onclick = () => {
    $$('#subraceGrid .choice').forEach(c=>c.classList.remove('selected'));
    el.classList.add('selected'); DRAFT.subrace = el.dataset.subrace;
    renderSkills(); renderEquipment(); renderAbilityGrid(); renderSpells(); renderExpertise(); checkCreationReady();
  });
}
function renderAsiChoice(){
  const sec=$('#asiChoiceSection'), grid=$('#asiChoiceGrid');
  const rc = DRAFT.race ? RULES.races[DRAFT.race].asiChoice : null;
  if (!rc){ sec.classList.add('hide'); grid.innerHTML=''; return; }
  sec.classList.remove('hide');
  const exclude = rc.exclude || [];
  $('#asiChoiceNote').textContent = `Escolhidos ${DRAFT.asiChoices.length}/${rc.count}`;
  $('#asiChoiceNote').classList.toggle('done', DRAFT.asiChoices.length===rc.count);
  grid.innerHTML = RULES.abilities.map(ab => {
    const off = exclude.includes(ab), sel = DRAFT.asiChoices.includes(ab);
    return `<div class="choice ${sel?'selected':''}" data-asi="${ab}" style="${off?'opacity:.35;pointer-events:none':''}">
      <div class="name">${ab}</div><div class="meta">${(RULES.abilityNames&&RULES.abilityNames[ab])||''}${off?' (já +2)':' +1'}</div></div>`;
  }).join('');
  $$('#asiChoiceGrid .choice').forEach(el => el.onclick = () => {
    const ab = el.dataset.asi, i = DRAFT.asiChoices.indexOf(ab);
    if (i>=0) DRAFT.asiChoices.splice(i,1); else if (DRAFT.asiChoices.length < rc.count) DRAFT.asiChoices.push(ab);
    renderAsiChoice(); renderAbilityGrid(); updateAC(); checkCreationReady();
  });
}
function renderSkills(){
  const sec=$('#skillsSection');
  if (!DRAFT.cls){ sec.classList.add('hide'); return; }
  sec.classList.remove('hide');
  const need = RULES.classes[DRAFT.cls].skillCount;
  const pool = skillOptionsFor(DRAFT.cls);
  const fixed = DRAFT.race ? fixedRacialSkills(DRAFT.race, DRAFT.subrace) : [];
  DRAFT.skills = DRAFT.skills.filter(s => pool.includes(s) && !fixed.includes(s));
  $('#skillsNote').textContent = `Escolha ${need} (de ${DRAFT.cls}). Selecionadas: ${DRAFT.skills.length}/${need}`;
  $('#skillsNote').classList.toggle('done', DRAFT.skills.length===need);
  const atMax = DRAFT.skills.length >= need;
  $('#skillsGrid').innerHTML = pool.map(s => {
    if (fixed.includes(s)) return `<div class="skill-chip locked">${s}<span class="tag">raça</span></div>`;
    const sel = DRAFT.skills.includes(s), dis = !sel && atMax;
    return `<div class="skill-chip ${sel?'selected':''} ${dis?'disabled':''}" data-skill="${s}">${s}<span class="tag">${RULES.skills[s]}</span></div>`;
  }).join('');
  $$('#skillsGrid .skill-chip[data-skill]').forEach(el => el.onclick = () => {
    const s = el.dataset.skill, i = DRAFT.skills.indexOf(s);
    if (i>=0) DRAFT.skills.splice(i,1); else if (DRAFT.skills.length < need) DRAFT.skills.push(s);
    renderSkills(); renderExpertise(); checkCreationReady();
  });
  const extraN = DRAFT.race ? (RULES.races[DRAFT.race].skillChoiceExtra||0) : 0;
  const wrap = $('#skillsExtraWrap');
  if (!extraN){ wrap.classList.add('hide'); DRAFT.skillsExtra=[]; return; }
  wrap.classList.remove('hide');
  const taken = new Set([...DRAFT.skills, ...fixed]);
  DRAFT.skillsExtra = DRAFT.skillsExtra.filter(s => !taken.has(s));
  $('#skillsExtraNote').textContent = `Versatilidade em Perícia — escolha ${extraN} quaisquer: ${DRAFT.skillsExtra.length}/${extraN}`;
  $('#skillsExtraNote').classList.toggle('done', DRAFT.skillsExtra.length===extraN);
  const extraMax = DRAFT.skillsExtra.length >= extraN;
  $('#skillsExtraGrid').innerHTML = Object.keys(RULES.skills).map(s => {
    if (taken.has(s)) return `<div class="skill-chip disabled">${s}<span class="tag">${RULES.skills[s]}</span></div>`;
    const sel = DRAFT.skillsExtra.includes(s), dis = !sel && extraMax;
    return `<div class="skill-chip ${sel?'selected':''} ${dis?'disabled':''}" data-xskill="${s}">${s}<span class="tag">${RULES.skills[s]}</span></div>`;
  }).join('');
  $$('#skillsExtraGrid .skill-chip[data-xskill]').forEach(el => el.onclick = () => {
    const s = el.dataset.xskill, i = DRAFT.skillsExtra.indexOf(s);
    if (i>=0) DRAFT.skillsExtra.splice(i,1); else if (DRAFT.skillsExtra.length < extraN) DRAFT.skillsExtra.push(s);
    renderSkills(); renderExpertise(); checkCreationReady();
  });
}
function defaultArmor(cls, race, subrace){
  if (RULES.classes[cls].unarmoredDefense) return 'Nenhuma';
  const av = availableArmors(cls, race, subrace);
  for (const pref of ['Cota de Malha','Brunea','Couro Batido']) if (av.includes(pref)) return pref;
  return 'Nenhuma';
}
function renderEquipment(){
  const sec=$('#equipmentSection');
  if (!DRAFT.cls){ sec.classList.add('hide'); return; }
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
  const kitEl = $('#startKitList');
  if (kitEl){
    const items = [];
    if (DRAFT.armor && DRAFT.armor !== 'Nenhuma') items.push(DRAFT.armor);
    if (DRAFT.shield) items.push('Escudo');
    if (DRAFT.weapon) items.push(DRAFT.weapon);
    const armorKeys = new Set(Object.keys(RULES.armor || {}));
    startingFixedItems(DRAFT.cls).forEach(it => { if (!armorKeys.has(it) && it !== 'Escudo') items.push(it); });
    items.push('Pacote de Aventureiro');
    const cspell = RULES.classes[DRAFT.cls].spell;
    if (cspell && !items.some(x => /foco|bolsa de componentes/i.test(x))) items.push(cspell.ability === 'INT' ? 'Foco arcano' : 'Foco de conjuração');
    const seen = new Set();
    kitEl.innerHTML = items.filter(x=>{const k=x.toLowerCase().trim(); if(seen.has(k))return false; seen.add(k); return true;}).map(x=>`<li>${x}</li>`).join('');
  }
  updateAC();
}
function renderClassOptions(){
  const sec=$('#classOptionsSection');
  if (!DRAFT.cls){ sec.classList.add('hide'); return; }
  const cls = DRAFT.cls;
  const hasStyle = fightingStyleLevel(cls) === 1;
  const subAtL1 = RULES.classes[cls].subclassLevel === 1;
  if (!hasStyle && !subAtL1){ sec.classList.add('hide'); return; }
  sec.classList.remove('hide');
  const fw = $('#fightingStyleWrap');
  if (hasStyle){
    fw.classList.remove('hide');
    $('#fightingStyleGrid').innerHTML = Object.entries(RULES.fightingStyles).map(([name,desc])=>
      `<div class="choice ${DRAFT.fightingStyle===name?'selected':''}" data-fs="${name}"><div class="name">${name}</div><div class="meta">${desc}</div></div>`).join('');
    $$('#fightingStyleGrid .choice').forEach(el=>el.onclick=()=>{ DRAFT.fightingStyle=el.dataset.fs; renderClassOptions(); updateAC(); checkCreationReady(); });
  } else { fw.classList.add('hide'); DRAFT.fightingStyle=null; }
  const aw = $('#archetypeWrap');
  if (subAtL1){
    aw.classList.remove('hide');
    $('#archetypeGrid').innerHTML = (RULES.classes[cls].subclasses||[]).map(name=>
      `<div class="choice ${DRAFT.archetype===name?'selected':''}" data-arch="${name}"><div class="name">${name}</div></div>`).join('');
    $$('#archetypeGrid .choice').forEach(el=>el.onclick=()=>{ DRAFT.archetype=el.dataset.arch; renderClassOptions(); checkCreationReady(); });
  } else { aw.classList.add('hide'); DRAFT.archetype=null; }
}
function renderSpells(){
  const sec=$('#spellSection');
  if (!DRAFT.cls){ sec.classList.add('hide'); return; }
  const picks = spellPicks(DRAFT.cls, draftAbilities(), 1);
  if (!picks){ sec.classList.add('hide'); DRAFT.cantrips=[]; DRAFT.spells=[]; return; }
  sec.classList.remove('hide');
  const cw = $('#cantripWrap');
  if (picks.cantrips > 0){
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
  if (picks.spells > 0 && picks.spellList.length){
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
function spellPicksDraft(){ return DRAFT.cls ? spellPicks(DRAFT.cls, draftAbilities(), 1) : null; }
function renderExpertise(){
  const sec=$('#expertiseSection');
  if (DRAFT.cls !== 'Ladino'){ sec.classList.add('hide'); DRAFT.expertise=[]; return; }
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
function checkCreationReady(){
  const r = DRAFT.race ? RULES.races[DRAFT.race] : null;
  const subOk = !r || !Object.keys(r.subraces||{}).length || DRAFT.subrace;
  const asiOk = !r || !r.asiChoice || DRAFT.asiChoices.length === r.asiChoice.count;
  const skillsOk = DRAFT.cls && DRAFT.skills.length === RULES.classes[DRAFT.cls].skillCount;
  const extraN = r ? (r.skillChoiceExtra||0) : 0;
  const extraOk = DRAFT.skillsExtra.length === extraN;
  const styleOk = !DRAFT.cls || fightingStyleLevel(DRAFT.cls) !== 1 || DRAFT.fightingStyle;
  const archOk  = !DRAFT.cls || RULES.classes[DRAFT.cls].subclassLevel !== 1 || DRAFT.archetype;
  const picks = spellPicksDraft();
  const spellsOk = !picks || (DRAFT.cantrips.length === picks.cantrips && DRAFT.spells.length === Math.min(picks.spells, picks.spellList.length));
  const expertiseOk = DRAFT.cls !== 'Ladino' || DRAFT.expertise.length === 2;
  const nameOk = $('#cName').value.trim();
  const ready = DRAFT.race && subOk && asiOk && DRAFT.cls && skillsOk && extraOk && styleOk && archOk && spellsOk && expertiseOk && nameOk;
  $('#cCreateBtn').disabled = !ready;

  const miss = [];
  if (!nameOk) miss.push('nome');
  if (!DRAFT.race) miss.push('raça'); else if (!subOk) miss.push('sub-raça');
  if (!asiOk && r && r.asiChoice) miss.push(`${r.asiChoice.count} atributo(s) +1`);
  if (!DRAFT.cls) miss.push('classe');
  else {
    if (!skillsOk) miss.push(`perícias (${DRAFT.skills.length}/${RULES.classes[DRAFT.cls].skillCount})`);
    if (!extraOk) miss.push(`perícia(s) de raça (${DRAFT.skillsExtra.length}/${extraN})`);
    if (!styleOk) miss.push('estilo de luta');
    if (!archOk) miss.push('subclasse');
    if (!spellsOk && picks){
      if (DRAFT.cantrips.length !== picks.cantrips) miss.push(`truques (${DRAFT.cantrips.length}/${picks.cantrips})`);
      const sNeed = Math.min(picks.spells, picks.spellList.length);
      if (DRAFT.spells.length !== sNeed) miss.push(`magias (${DRAFT.spells.length}/${sNeed})`);
    }
    if (!expertiseOk) miss.push(`especializações (${DRAFT.expertise.length}/2)`);
  }
  const el = $('#cMissing');
  if (el){ if (ready){ el.textContent='✓ Tudo pronto!'; el.classList.add('ok'); } else { el.textContent='Falta: '+miss.join(', '); el.classList.remove('ok'); } }
}
function finishCreationMp(){
  const char = buildCharacter({
    name: $('#cName').value.trim(), player: DRAFT.player, slot: 0,
    race: DRAFT.race, subrace: DRAFT.subrace, cls: DRAFT.cls, scores: { ...DRAFT.base },
    asiChoices: DRAFT.asiChoices, skills: [...DRAFT.skills, ...DRAFT.skillsExtra],
    armor: DRAFT.armor, shield: DRAFT.shield, weapons: DRAFT.weapon ? [DRAFT.weapon] : [],
    fightingStyle: DRAFT.fightingStyle, archetype: DRAFT.archetype,
    cantrips: [...DRAFT.cantrips], spells: [...DRAFT.spells], expertise: [...DRAFT.expertise],
    profile: { ...DRAFT.profile }
  });
  if (ON_DONE) ON_DONE(char);
}
