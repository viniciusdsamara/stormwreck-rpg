// ============================================================
// rules.js — Regras de D&D 5e (Basic Rules, nível 1-3)
// Subconjunto adequado a Stormwreck Isle.
// ============================================================

const RULES = {
  abilities: ['FOR', 'DES', 'CON', 'INT', 'SAB', 'CAR'],
  abilityNames: {
    FOR: 'Força', DES: 'Destreza', CON: 'Constituição',
    INT: 'Inteligência', SAB: 'Sabedoria', CAR: 'Carisma'
  },
  abilityEng: { FOR:'STR', DES:'DEX', CON:'CON', INT:'INT', SAB:'WIS', CAR:'CHA' },

  // Raças do Basic Rules + ASI
  races: {
    'Humano':      { asi: { FOR:1, DES:1, CON:1, INT:1, SAB:1, CAR:1 }, speed:9, traits:['Versátil'], darkvision:false },
    'Anão':        { asi: { CON:2 }, speed:7.5, traits:['Visão no escuro','Resistência a veneno','Treino com machados'], darkvision:true },
    'Elfo':        { asi: { DES:2 }, speed:9, traits:['Visão no escuro','Sentidos aguçados','Ancestral feérico','Transe'], darkvision:true },
    'Halfling':    { asi: { DES:2 }, speed:7.5, traits:['Sortudo','Bravura','Agilidade halfling'], darkvision:false },
    'Draconato':   { asi: { FOR:2, CAR:1 }, speed:9, traits:['Sopro elemental','Resistência a dano'], darkvision:false },
    'Gnomo':       { asi: { INT:2 }, speed:7.5, traits:['Visão no escuro','Astúcia gnômica'], darkvision:true },
    'Meio-Elfo':   { asi: { CAR:2 }, speed:9, traits:['Visão no escuro','Ancestral feérico','Versatilidade'], darkvision:true, choice2:true },
    'Meio-Orc':    { asi: { FOR:2, CON:1 }, speed:9, traits:['Visão no escuro','Resistência implacável','Ataques selvagens'], darkvision:true },
    'Tiefling':    { asi: { INT:1, CAR:2 }, speed:9, traits:['Visão no escuro','Resistência infernal','Legado infernal'], darkvision:true }
  },

  // Classes do Basic Rules
  classes: {
    'Guerreiro': { hitDie:10, primary:['FOR','DES'], saves:['FOR','CON'], armor:'pesada+escudo', baseCA:16,
                   features:['Estilo de luta','Retomar fôlego'],
                   desc:'Mestre de armas e armaduras. Resistente e versátil.' },
    'Mago':      { hitDie:6, primary:['INT'], saves:['INT','SAB'], armor:'nenhuma', baseCA:null,
                   features:['Conjuração arcana','Recuperação arcana'],
                   cantrips:3, spellsKnown:6, slots1:2,
                   desc:'Conjurador erudito. Frágil, mas com magia versátil.' },
    'Clérigo':   { hitDie:8, primary:['SAB'], saves:['SAB','CAR'], armor:'média+escudo', baseCA:14,
                   features:['Conjuração divina','Domínio divino'],
                   cantrips:3, slots1:2,
                   desc:'Canaliza poder divino. Cura e protege aliados.' },
    'Ladino':    { hitDie:8, primary:['DES'], saves:['DES','INT'], armor:'leve', baseCA:13,
                   features:['Ataque furtivo','Especialização','Gíria de ladrão'],
                   desc:'Ágil e astuto. Dano preciso e perícia incomparável.' },
    'Patrulheiro':{ hitDie:10, primary:['DES','SAB'], saves:['FOR','DES'], armor:'média', baseCA:14,
                   features:['Inimigo favorito','Explorador nato'],
                   desc:'Caçador das terras selvagens. Combina arco e natureza.' },
    'Bárbaro':   { hitDie:12, primary:['FOR'], saves:['FOR','CON'], armor:'leve', baseCA:13,
                   features:['Fúria','Defesa sem armadura'],
                   desc:'Guerreiro feroz movido a fúria. O mais resistente.' },
    'Bardo':     { hitDie:8, primary:['CAR'], saves:['DES','CAR'], armor:'leve', baseCA:13,
                   features:['Inspiração de bardo','Conjuração'],
                   cantrips:2, slots1:2,
                   desc:'Mestre da inspiração e da palavra. Versátil e social.' },
    'Paladino':  { hitDie:10, primary:['FOR','CAR'], saves:['SAB','CAR'], armor:'pesada+escudo', baseCA:16,
                   features:['Sentido divino','Imposição das mãos'],
                   desc:'Guerreiro sagrado ligado a um juramento. Robusto.' },
    'Feiticeiro':{ hitDie:6, primary:['CAR'], saves:['CON','CAR'], armor:'nenhuma', baseCA:null,
                   features:['Magia inata','Origem mágica'],
                   cantrips:4, slots1:2,
                   desc:'Magia no sangue. Poder bruto e imprevisível.' },
    'Bruxo':     { hitDie:8, primary:['CAR'], saves:['SAB','CAR'], armor:'leve', baseCA:13,
                   features:['Pacto arcano','Patrono'],
                   cantrips:2, slots1:1,
                   desc:'Poder vindo de um pacto com uma entidade.' },
    'Druida':    { hitDie:8, primary:['SAB'], saves:['INT','SAB'], armor:'leve', baseCA:13,
                   features:['Conjuração','Druídico'],
                   cantrips:2, slots1:2,
                   desc:'Guardião da natureza. Conjura e mais tarde se transforma.' },
    'Monge':     { hitDie:8, primary:['DES','SAB'], saves:['FOR','DES'], armor:'nenhuma', baseCA:null,
                   features:['Defesa sem armadura','Artes marciais'],
                   desc:'Disciplina corporal. Rápido e ágil sem armadura.' }
  },

  // XP por nível (só precisamos de 1-3 para Stormwreck)
  xpTable: { 1:0, 2:300, 3:900, 4:2700 },

  profByLevel: { 1:2, 2:2, 3:2, 4:2 }
};

function abilityMod(score) { return Math.floor((score - 10) / 2); }
function fmtMod(m) { return (m >= 0 ? '+' : '') + m; }

// Calcula CA conforme classe + DES
function computeCA(cls, abilities) {
  const c = RULES.classes[cls];
  const dexMod = abilityMod(abilities.DES);
  if (c.baseCA) {
    // armaduras pesadas ignoram DES; médias limitam +2; aqui simplificamos
    if (c.armor.startsWith('pesada')) return c.baseCA;
    if (c.armor.startsWith('média')) return c.baseCA + Math.min(dexMod, 2);
    if (c.armor.startsWith('leve')) return c.baseCA + dexMod;
    return c.baseCA + dexMod;
  }
  // sem armadura: classes mágicas = 10 + DES; monge/bárbaro têm cálculos próprios
  if (cls === 'Monge') return 10 + dexMod + abilityMod(abilities.SAB);
  if (cls === 'Bárbaro') return 10 + dexMod + abilityMod(abilities.CON);
  return 10 + dexMod;
}

// Cria um personagem completo a partir das escolhas
function buildCharacter({ name, player, slot, race, cls, scores }) {
  const r = RULES.races[race];
  const c = RULES.classes[cls];
  // aplica ASI racial
  const abilities = {};
  RULES.abilities.forEach(a => { abilities[a] = scores[a] + (r.asi[a] || 0); });

  const conMod = abilityMod(abilities.CON);
  const maxHp = c.hitDie + conMod;
  const ca = computeCA(cls, abilities);

  return {
    name, player, slot, race, cls,
    level: 1, xp: 0, prof: 2,
    abilities,
    maxHp, hp: maxHp,
    ca,
    speed: r.speed,
    darkvision: r.darkvision,
    saves: c.saves,
    traits: r.traits,
    features: c.features,
    spellSlots: c.slots1 ? { max: c.slots1, used: 0 } : null,
    conditions: [],
    inventory: ['Equipamento inicial de ' + cls]
  };
}
