// ============================================================
// i18n.js — Camada de EXIBIÇÃO de idioma (3 modos de jogo)
//
// Modos (ROOM.state.gameLang):
//   'pt'    → tudo em português (PADRÃO, comportamento antigo).
//   'en'    → tudo em inglês (interface + narração + termos de regra).
//   'pt-en' → interface e narração em PT-BR, mas skills/efeitos/
//             condições/magias/classes/raças/perícias em INGLÊS.
//
// REGRA DE ARQUITETURA (não violar):
//   O motor (mp.js) chaveia internamente em STRINGS PT canônicas
//   (ex.: 'Atordoado', 'Bênção', 'Guerreiro'). Esta camada NUNCA
//   renomeia essas chaves; só traduz na hora de EXIBIR (term/tr).
//
// Carregado DEPOIS de rules.js (precisa de RULES) e ANTES de mp.js.
// Expõe globais: gameLang(), term(name), tr(key), TERMS, UI_STRINGS.
// ============================================================

// ---- TABELAS DE TRADUÇÃO PT → EN (termos de CONTEÚDO de jogo) ----
// Cada bloco cobre as chaves reais de RULES (rules.js) + nomes de
// habilidades de classe usadas no combate (FEATURE_FX em mp.js).
const TERMS = {
  // Condições — todas as chaves de RULES.conditions
  'Agarrado':'Grappled', 'Amedrontado':'Frightened', 'Atordoado':'Stunned',
  'Caído':'Prone', 'Cego':'Blinded', 'Enfeitiçado':'Charmed',
  'Envenenado':'Poisoned', 'Impedido':'Restrained', 'Incapacitado':'Incapacitated',
  'Inconsciente':'Unconscious', 'Invisível':'Invisible', 'Paralisado':'Paralyzed',
  'Petrificado':'Petrified', 'Surdo':'Deafened',

  // Atributos (nomes longos PT → EN)
  'Força':'Strength', 'Destreza':'Dexterity', 'Constituição':'Constitution',
  'Inteligência':'Intelligence', 'Sabedoria':'Wisdom', 'Carisma':'Charisma',

  // Perícias — chaves de RULES.skills
  'Acrobacia':'Acrobatics', 'Adestrar Animais':'Animal Handling', 'Arcanismo':'Arcana',
  'Atletismo':'Athletics', 'Atuação':'Performance', 'Enganação':'Deception',
  'Furtividade':'Stealth', 'História':'History', 'Intimidação':'Intimidation',
  'Intuição':'Insight', 'Investigação':'Investigation', 'Medicina':'Medicine',
  'Natureza':'Nature', 'Percepção':'Perception', 'Persuasão':'Persuasion',
  'Prestidigitação':'Sleight of Hand', 'Religião':'Religion', 'Sobrevivência':'Survival',

  // Classes — chaves de RULES.classes
  'Bárbaro':'Barbarian', 'Bardo':'Bard', 'Bruxo':'Warlock', 'Clérigo':'Cleric',
  'Druida':'Druid', 'Feiticeiro':'Sorcerer', 'Guerreiro':'Fighter', 'Ladino':'Rogue',
  'Mago':'Wizard', 'Monge':'Monk', 'Paladino':'Paladin', 'Patrulheiro':'Ranger',

  // Raças — chaves de RULES.races
  'Anão':'Dwarf', 'Elfo':'Elf', 'Halfling':'Halfling', 'Humano':'Human',
  'Draconato':'Dragonborn', 'Gnomo':'Gnome', 'Meio-Elfo':'Half-Elf',
  'Meio-Orc':'Half-Orc', 'Tiefling':'Tiefling',

  // Sub-raças — chaves de RULES.races[*].subraces
  'Anão da Colina':'Hill Dwarf', 'Anão da Montanha':'Mountain Dwarf',
  'Alto Elfo':'High Elf', 'Elfo da Floresta':'Wood Elf', 'Drow (Elfo Negro)':'Drow (Dark Elf)',
  'Pés Leves':'Lightfoot', 'Robusto':'Stout',
  'Gnomo da Floresta':'Forest Gnome', 'Gnomo da Rocha':'Rock Gnome',

  // Tipos de dano
  'perfurante':'piercing', 'concussão':'bludgeoning', 'cortante':'slashing',
  'fogo':'fire', 'frio':'cold', 'veneno':'poison', 'ácido':'acid',
  'elétrico':'lightning', 'trovão':'thunder', 'necrótico':'necrotic',
  'radiante':'radiant', 'psíquico':'psychic', 'força':'force',

  // Estilos de Luta — chaves de RULES.fightingStyles
  'Arquearia':'Archery', 'Defesa':'Defense', 'Duelo':'Dueling',
  'Armas Grandes':'Great Weapon Fighting',

  // Habilidades/features de classe usadas no combate (FEATURE_FX em mp.js)
  'Retomar Fôlego':'Second Wind', 'Surto de Ação':'Action Surge', 'Fúria':'Rage',
  'Imposição das Mãos':'Lay on Hands', 'Inspiração de Bardo':'Bardic Inspiration',
  'Expulsar Mortos-Vivos':'Turn Undead',

  // Magias e truques — chaves de RULES.spells
  'Rajada de Fogo':'Fire Bolt', 'Raio de Gelo':'Ray of Frost', 'Toque Gélido':'Chill Touch',
  'Mãos Mágicas':'Mage Hand', 'Ilusão Menor':'Minor Illusion', 'Truque':'Prestidigitation',
  'Luz':'Light', 'Estalo Sobrenatural':'Eldritch Blast', 'Chama Sagrada':'Sacred Flame',
  'Orientação':'Guidance', 'Resistência':'Resistance', 'Estabilizar':'Spare the Dying',
  'Produzir Chama':'Produce Flame', 'Shillelagh':'Shillelagh', 'Zombaria Cruel':'Vicious Mockery',
  'Mísseis Mágicos':'Magic Missile', 'Escudo Arcano':'Shield', 'Mãos Flamejantes':'Burning Hands',
  'Sono':'Sleep', 'Enfeitiçar Pessoa':'Charm Person', 'Detectar Magia':'Detect Magic',
  'Disfarçar-se':'Disguise Self', 'Curar Ferimentos':'Cure Wounds', 'Palavra Curativa':'Healing Word',
  'Bênção':'Bless', 'Perdição':'Bane', 'Escudo da Fé':'Shield of Faith', 'Santuário':'Sanctuary',
  'Fada de Fogo':'Faerie Fire', 'Enredar':'Entangle', 'Marca do Caçador':"Hunter's Mark",
  'Heroísmo':'Heroism', 'Repreensão Infernal':'Hellish Rebuke'
};

// ---- STRINGS DE INTERFACE (chrome): só inglês quando lang === 'en' ----
const UI_STRINGS = {
  // Painel do Mestre
  'Controles do Mestre':'Game Master Controls',
  'Modelo da IA (Mestre)':'AI Model (Master)',
  'Vez atual':'Current turn',
  'Idioma do jogo':'Game language',
  'Modo de idioma':'Language mode',
  'Português':'Portuguese',
  'Português + termos EN':'Portuguese + EN terms',
  'Inglês':'English',
  'Vale para narração e termos de regra do jogo.':'Applies to narration and in-game rule terms.',
  // Cartões/fichas
  'Condições ativas':'Active conditions',
  'Atributos & Saves':'Abilities & Saves',
  'Atributos &amp; Saves':'Abilities &amp; Saves',
  'Perícias':'Skills',
  'Traços raciais':'Racial traits',
  'Características de classe':'Class features',
  'Magias conhecidas':'Known spells',
  'Idiomas':'Languages',
  'Bolsa':'Bag',
  'História do personagem':'Character backstory',
  'truque':'cantrip',
  'truques':'cantrips',
  'Nível':'Level',
  // Combate / menu de habilidades
  'truques ilimitados':'unlimited cantrips',
  'habilidade':'ability',
  // Genéricos
  'Mestre':'Master', 'Jogador':'Player'
};

// ---- HELPERS GLOBAIS (mp.js / creation-mp.js chamam diretamente) ----

// Lê o modo de idioma do estado compartilhado da sala.
function gameLang(){
  try { return (typeof ROOM !== 'undefined' && ROOM && ROOM.state && ROOM.state.gameLang) || 'pt'; }
  catch(e){ return 'pt'; }
}

// term(name): traduz um termo de CONTEÚDO (condição, magia, classe, perícia...).
// Inglês quando o modo é 'en' OU 'pt-en'. Sem tradução → devolve o original.
function term(name){
  if (name == null) return name;
  const L = gameLang();
  if (L === 'en' || L === 'pt-en'){
    const t = TERMS[name];
    if (t) return t;
    // tolera caixa/acento divergente: tenta casar ignorando diferenças triviais
    const norm = s => String(s).toLowerCase();
    const key = Object.keys(TERMS).find(k => norm(k) === norm(name));
    return key ? TERMS[key] : name;
  }
  return name;
}

// tr(key): traduz uma string de UI (chrome). Inglês SÓ no modo 'en'.
function tr(key){
  if (key == null) return key;
  if (gameLang() === 'en'){ const t = UI_STRINGS[key]; if (t) return t; }
  return key;
}

// Expõe no escopo global (igual aos demais módulos sem build).
if (typeof window !== 'undefined'){
  window.TERMS = TERMS; window.UI_STRINGS = UI_STRINGS;
  window.gameLang = gameLang; window.term = term; window.tr = tr;
}
