// ====================================================================
//  Criação de personagem para o lobby multiplayer (M2).
//  Porta a criação guiada da V1, reaproveitando rules.js. Cada jogador
//  cria UM personagem; ao concluir, ON_DONE(char) devolve ao lobby.
// ====================================================================
let DRAFT = null, ON_DONE = null, PLAYER_NAME = 'Jogador', CC = { history:[], spec:null };
const POINT_COST = {8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};
const POINT_BUDGET = 27;

// ponto de entrada: escolhe o modo (guiada ou conversa com o Mestre)
function startCreationMp(playerName, onDone){
  ON_DONE = onDone; PLAYER_NAME = playerName || 'Jogador';
  show('screen-cmode');
  $('#cmGuided').onclick = openGuidedCreation;
  $('#cmChat').onclick = openChatCreation;
  $('#cmBack').onclick = () => { if (typeof ROOM !== 'undefined' && ROOM){ show('screen-room'); refreshRoom(); } else { show('screen-hub'); enterHub(); } };
}
function openGuidedCreation(){
  DRAFT = { race:null, subrace:null, cls:null, base:{ FOR:8, DES:8, CON:8, INT:8, SAB:8, CAR:8 },
            skills:[], skillsExtra:[], asiChoices:[], armor:'Nenhuma', shield:false, weapon:null,
            fightingStyle:null, archetype:null, cantrips:[], spells:[], expertise:[],
            player: PLAYER_NAME, portrait: null,
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
  wirePortraitUpload();
  $('#cCreateBtn').onclick = finishCreationMp;
  $('#cBackBtn').onclick = () => show('screen-cmode');
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
  char.portrait = DRAFT.portrait || null;
  if (ON_DONE) ON_DONE(char);
}

// ---- retrato: upload OU geração por IA, embutido na ficha ----
function wirePortraitUpload(){
  const input = $('#pf_portrait_input'), btn = $('#pf_portrait_btn'), clear = $('#pf_portrait_clear'),
        ai = $('#pf_portrait_ai'), prev = $('#pf_portrait_preview');
  if (!input || !btn || !prev) return;
  const refresh = () => {
    if (DRAFT.portrait){ prev.style.backgroundImage = `url('${DRAFT.portrait}')`; prev.classList.add('has'); prev.textContent = '';
      if (clear) clear.style.display = ''; btn.textContent = '📷 Trocar'; }
    else { prev.style.backgroundImage = ''; prev.classList.remove('has'); if (!prev.classList.contains('gen')) prev.textContent = '';
      if (clear) clear.style.display = 'none'; btn.textContent = '📷 Enviar imagem'; }
  };
  refresh();
  btn.onclick = () => input.click();
  if (clear) clear.onclick = () => { DRAFT.portrait = null; input.value = ''; refresh(); };
  input.onchange = () => { const f = input.files && input.files[0]; if (f) shrinkPortrait(f, (dataUrl) => { DRAFT.portrait = dataUrl; refresh(); }); };
  if (ai) ai.onclick = () => {
    if (!DRAFT.race || !DRAFT.cls){ toast('Escolha raça e classe primeiro.'); return; }
    const lbl = ai.textContent; ai.disabled = true; ai.textContent = '⏳ gerando…';
    prev.classList.add('gen'); prev.textContent = '✨'; prev.style.backgroundImage = '';
    generatePortraitAI(
      (result) => { DRAFT.portrait = result; prev.classList.remove('gen'); refresh(); ai.disabled = false; ai.textContent = lbl; },
      () => { toast('A IA não respondeu — tente de novo.'); prev.classList.remove('gen'); refresh(); ai.disabled = false; ai.textContent = lbl; }
    );
  };
}
// desenha uma <img> num quadrado de 220px (cover) e devolve data URL JPEG
function drawPortrait(img){
  const S = 220, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  const scale = Math.max(S / img.width, S / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
  return cv.toDataURL('image/jpeg', 0.72);
}
function shrinkPortrait(file, cb){
  if (!file.type || !file.type.startsWith('image/')){ toast('Escolha um arquivo de imagem.'); return; }
  const reader = new FileReader();
  reader.onload = e => { const img = new Image();
    img.onload = () => { try { cb(drawPortrait(img)); } catch(err){ toast('Não consegui processar a imagem.'); } };
    img.onerror = () => toast('Imagem inválida.'); img.src = e.target.result; };
  reader.readAsDataURL(file);
}
// traduções visuais p/ o modelo (que entende inglês) — fidelidade às raças/classes
const RACE_EN = {
  'Anão':      'dwarf, short and stocky with a long thick braided beard, rugged broad face',
  'Elfo':      'elf with long pointed ears, slender and graceful, angular ethereal beautiful features',
  'Halfling':  'halfling, small and short with a youthful round face and curly hair, hobbit-like',
  'Humano':    'human',
  'Draconato': 'dragonborn, a draconic humanoid with a scaled reptilian dragon-like face and snout, no hair, lizard eyes',
  'Gnomo':     'gnome, very small and short with a large nose, big curious eyes, whimsical',
  'Meio-Elfo': 'half-elf, handsome human-like face with subtly pointed ears',
  'Meio-Orc':  'half-orc, greenish-grey skin with protruding lower tusks, heavy muscular build, fierce',
  'Tiefling':  'tiefling, with large curved horns on the head and unusual red or purple skin, infernal demonic heritage, sometimes a tail',
};
const CLASS_EN = {
  'Bárbaro':'barbarian in furs and leather, wild and muscular', 'Bardo':'bard in fine colorful clothes holding a lute, charismatic',
  'Bruxo':'warlock in dark mysterious robes with eldritch energy', 'Clérigo':'cleric in armor bearing a holy religious symbol',
  'Druida':'druid in natural leathers with leaves and antlers', 'Feiticeiro':'sorcerer crackling with innate arcane magic',
  'Guerreiro':'fighter in plate armor with a sword and shield', 'Ladino':'rogue in a hood and dark leather with daggers',
  'Mago':'wizard in robes holding a staff, scholarly', 'Monge':'monk in simple martial-arts robes, disciplined',
  'Paladino':'paladin in shining holy plate armor, righteous', 'Patrulheiro':'ranger in a hooded cloak with a bow, wilderness scout',
};
// monta o prompt do retrato a partir da ficha (raça PRIMEIRO, depois classe e aparência)
function portraitPrompt(){
  const d = DRAFT, p = d.profile || {};
  let race = RACE_EN[d.race] || (d.race || 'human');
  if (d.race === 'Elfo' && d.subrace && /drow/i.test(d.subrace))
    race = 'drow dark elf with dark obsidian grey skin, long white hair, long pointed ears and glowing red eyes';
  const cls = CLASS_EN[d.cls] || (d.cls || 'adventurer');
  const bits = [`portrait of a ${race}, a ${cls}`];
  if (p.appearance && p.appearance.trim()) bits.push(p.appearance.trim());
  bits.push('fantasy character portrait, head and shoulders, dungeons and dragons, painterly digital art, dramatic lighting, detailed face, dark fantasy');
  return bits.join(', ');
}
// gera o retrato pela Pollinations (grátis) e embute como data URL; fallback = URL externa
function generatePortraitAI(onOk, onErr){
  const seed = Math.floor(Math.random() * 100000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(portraitPrompt())}?width=512&height=512&seed=${seed}&nologo=true&model=flux`;
  const img = new Image(); img.crossOrigin = 'anonymous';
  let done = false;
  const timer = setTimeout(() => { if (!done){ done = true; if (onErr) onErr(); } }, 45000);
  img.onload = () => { if (done) return; done = true; clearTimeout(timer);
    try { onOk(drawPortrait(img)); } catch(e){ onOk(url); } };          // CORS ok → embute; senão guarda a URL
  img.onerror = () => { if (done) return; done = true; clearTimeout(timer); onOk(url); };  // CORS bloqueou o canvas → usa a URL (exibe igual)
  img.src = url;
}

// ====================================================================
//  Criação por conversa com o Mestre (IA) — usa a Edge Function da sala
// ====================================================================
function fmtNarr(t){ return (t||'').replace(/\*([^*]+)\*/g, '<em>$1</em>'); }

function openChatCreation(){
  CC = { history:[], spec:null };
  show('screen-cchat');
  $('#ccChat').innerHTML = '';
  $('#ccFinishBtn').classList.add('hide');
  $('#ccSendBtn').onclick = ccSend;
  $('#ccBackBtn').onclick = () => show('screen-cmode');
  $('#ccFinishBtn').onclick = ccFinish;
  $('#ccInput').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ccSend(); } };
  ccAddMsg('dm', 'Olá! Vou te ajudar a criar seu aventureiro para *Stormwreck Isle*. Me conta: que herói você imagina? Pode ser um conceito ("um anão durão"), uma raça/classe, ou só uma vibe.');
}
function ccAddMsg(role, text){
  const n = $('#ccChat');
  const d = document.createElement('div');
  d.className = 'cc-msg ' + role;
  if (role === 'dm') d.innerHTML = fmtNarr(text); else d.textContent = text;
  n.appendChild(d); n.scrollTop = n.scrollHeight;
}
function creationChatSystemPrompt(){
  const races = Object.keys(RULES.races).join(', ');
  const classes = Object.keys(RULES.classes).join(', ');
  const skills = Object.keys(RULES.skills).join(', ');
  return `Você é o Mestre de D&D 5e ajudando a criar UM personagem de NÍVEL 1 para a campanha Dragons of Stormwreck Isle. Fale em português do Brasil, de forma acolhedora e concisa (2-4 frases por vez): faça perguntas, sugira e explique. Conduza por: conceito → raça (e sub-raça se houver) → classe → atributos → perícias → equipamento → opções de classe (estilo de luta/subclasse) → magias (se conjurador) → perfil (aparência, contexto, motivações, defeitos, qualidades).

Opções válidas (use os nomes EXATOS):
- Raças: ${races}. (algumas têm sub-raças)
- Classes: ${classes}.
- Atributos: point-buy de 27 pontos, cada um entre 8 e 15.
- Perícias: ${skills}.

Quando — e SOMENTE quando — tudo estiver definido e o jogador confirmar, inclua na MESMA mensagem, na última linha, um bloco JSON exatamente neste formato (nomes exatos do sistema; campos não aplicáveis como null ou lista vazia):
[CHARACTER]{"name":"","race":"","subrace":null,"cls":"","base":{"FOR":10,"DES":10,"CON":10,"INT":10,"SAB":10,"CAR":10},"asiChoices":[],"skills":[],"armor":"Nenhuma","shield":false,"weapon":"","fightingStyle":null,"archetype":null,"cantrips":[],"spells":[],"expertise":[],"profile":{"appearance":"","context":"","motivation":"","flaw":"","quality":""}}[/CHARACTER]
NÃO emita o bloco antes de tudo estar pronto e confirmado.`;
}
async function ccSend(){
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
    const reply = await callClaudeMp(CC.history.slice(-16), creationChatSystemPrompt(), 700);
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
function ccFinish(){
  if (!CC.spec) { $('#ccInput').value = 'Pode finalizar minha ficha agora?'; ccSend(); return; }
  const char = buildFromSpec(CC.spec);
  if (ON_DONE) ON_DONE(char);
}
// monta o personagem a partir do JSON do Mestre, validando contra as regras
function buildFromSpec(s){
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
  return buildCharacter({ name, player: PLAYER_NAME, slot: 0, race, subrace, cls, scores: base, asiChoices,
    skills: allSkills, armor, shield, weapons: [weapon], fightingStyle, archetype, cantrips, spells, expertise, profile });
}
async function callClaudeMp(messages, system, maxTokens){
  const { data: { session } } = await supa.auth.getSession();
  if (!session) throw new Error('Sessão expirada. Entre novamente.');
  const res = await fetch(`${SUPA_URL}/functions/v1/dm`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`, 'apikey':SUPA_KEY },
    body: JSON.stringify({ model: (ROOM && ROOM.model) || 'claude-haiku-4-5', max_tokens: maxTokens, system, messages })
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
  const data = await res.json();
  return data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n');
}
