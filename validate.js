// Validação da rules.js nova (fidelidade PHB). Roda no Node portátil.
const vm = require('vm');
const fs = require('fs');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('rules.js', 'utf8'), ctx);
const { buildCharacter, abilityMod, RULES } = ctx;

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log(`  ${ok ? 'PASS' : 'FALHA'}  ${label}: ${JSON.stringify(got)}${ok ? '' : '  (esperado ' + JSON.stringify(exp) + ')'}`);
  ok ? pass++ : fail++;
}

// ---- 1. Alto Elfo Mago ----
console.log('\n=== 1. Alto Elfo Mago (DES15 base, INT15, CON14) ===');
const m = buildCharacter({
  name:'Alurial', player:'J1', slot:0, race:'Elfo', subrace:'Alto Elfo', cls:'Mago',
  scores:{ FOR:8, DES:15, CON:14, INT:15, SAB:12, CAR:10 }
});
check('DES (15+2 raça)', m.abilities.DES, 17);
check('INT (15+1 sub-raça)', m.abilities.INT, 16);
check('HP (d6+CON2)', m.maxHp, 8);
check('AC sem armadura (10+DES3)', m.ca, 13);
check('Spell slots nv1', m.spellSlots.max, 2);
check('Truques (Mago 3 + Alto Elfo 1)', m.cantripsKnown, 4);
check('Spell DC (8+2+INT3)', m.spellDC, 13);
check('Darkvision 18m', m.darkvisionRange, 18);

// ---- 2. Anão da Colina Clérigo (Tenacidade + Brunea + escudo) ----
console.log('\n=== 2. Anão da Colina Clérigo (CON14, SAB15, Brunea+escudo) ===');
const cl = buildCharacter({
  name:'Durga', player:'J2', slot:1, race:'Anão', subrace:'Anão da Colina', cls:'Clérigo',
  scores:{ FOR:13, DES:10, CON:14, INT:8, SAB:15, CAR:12 },
  armor:'Brunea', shield:true
});
check('CON (14+2 raça)', cl.abilities.CON, 16);
check('SAB (15+1 sub-raça)', cl.abilities.SAB, 16);
check('HP (d8+CON3+1 Tenacidade)', cl.maxHp, 12);
check('AC (Brunea14+DES0+escudo2)', cl.ca, 16);
check('Resistência a veneno', cl.racialEffects.resist.includes('veneno'), true);
check('Truques (Clérigo 3)', cl.cantripsKnown, 3);

// ---- 3. Anão da Montanha Guerreiro (Cota de Malha + escudo) ----
console.log('\n=== 3. Anão da Montanha Guerreiro (FOR15, CON14, Cota de Malha+escudo) ===');
const g = buildCharacter({
  name:'Dortar', player:'J2', slot:1, race:'Anão', subrace:'Anão da Montanha', cls:'Guerreiro',
  scores:{ FOR:15, DES:12, CON:14, INT:8, SAB:10, CAR:10 },
  armor:'Cota de Malha', shield:true
});
check('FOR (15+2 sub-raça)', g.abilities.FOR, 17);
check('CON (14+2 raça)', g.abilities.CON, 16);
check('HP (d10+CON3)', g.maxHp, 13);
check('AC (Cota Malha16+escudo2, pesada ignora DES)', g.ca, 18);
check('Prof armadura inclui pesada (classe) e leve/média (sub-raça)',
  ['leve','média','pesada','escudo'].every(p => g.armorProf.includes(p)), true);

// Guerreiro sem escudo deve dar AC 16 (caso do CLAUDE.md original)
const g2 = buildCharacter({ name:'x',player:'y',slot:0, race:'Anão', subrace:'Anão da Montanha', cls:'Guerreiro',
  scores:{FOR:15,DES:12,CON:14,INT:8,SAB:10,CAR:10}, armor:'Cota de Malha', shield:false });
check('AC sem escudo = 16', g2.ca, 16);

// ---- 4. Meio-Elfo Bardo (ASI à escolha) ----
console.log('\n=== 4. Meio-Elfo Bardo (asiChoices FOR,CON) ===');
const me = buildCharacter({
  name:'Kael', player:'J1', slot:0, race:'Meio-Elfo', cls:'Bardo',
  scores:{ FOR:12, DES:13, CON:12, INT:10, SAB:10, CAR:15 },
  asiChoices:['FOR','CON']
});
check('CAR (15+2)', me.abilities.CAR, 17);
check('FOR (12+1 escolha)', me.abilities.FOR, 13);
check('CON (12+1 escolha)', me.abilities.CON, 13);
check('Darkvision (meio-elfo)', me.darkvision, true);

// ---- 5. Halfling Robusto Ladino (armadura leve = base 11) ----
console.log('\n=== 5. Halfling Robusto Ladino (DES15, Couro) ===');
const l = buildCharacter({
  name:'Pip', player:'J2', slot:1, race:'Halfling', subrace:'Robusto', cls:'Ladino',
  scores:{ FOR:8, DES:15, CON:13, INT:12, SAB:10, CAR:13 },
  armor:'Couro'
});
check('DES (15+2)', l.abilities.DES, 17);
check('CON (13+1 sub-raça)', l.abilities.CON, 14);
check('AC (Couro 11 + DES3) — antes era 13+DES', l.ca, 14);
check('Sortudo (reroll nat 1)', !!l.racialEffects.flags.rerollNat1, true);
check('Resistência a veneno (Robusto)', l.racialEffects.resist.includes('veneno'), true);

// ---- 6. Compat: chamada simples sem sub-raça não quebra ----
console.log('\n=== 6. Compat — chamada legada sem sub-raça ===');
const simple = buildCharacter({ name:'a',player:'b',slot:0, race:'Humano', cls:'Patrulheiro', scores:{FOR:14,DES:14,CON:14,INT:10,SAB:13,CAR:10} });
check('Humano +1 em tudo (FOR 14+1)', simple.abilities.FOR, 15);
check('HP Patrulheiro d10+CON2', simple.maxHp, 12);
check('Não lança erro / objeto válido', typeof simple === 'object' && !!simple.name, true);

// ---- 7. d20 uniforme (sanidade do gerador) ----
console.log('\n=== 7. d20 — 10.000 rolagens ===');
const counts = new Array(21).fill(0);
for (let i=0;i<10000;i++) counts[Math.floor(Math.random()*20)+1]++;
const mn = Math.min(...counts.slice(1)), mx = Math.max(...counts.slice(1));
console.log('  Min', mn, 'Max', mx, 'Variação', mx-mn);
check('Variação < 200', (mx-mn) < 200, true);

console.log(`\n========== RESULTADO: ${pass} PASS / ${fail} FALHA ==========`);
process.exit(fail ? 1 : 0);
