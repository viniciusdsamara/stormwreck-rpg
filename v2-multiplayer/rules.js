// ============================================================
// rules.js — Regras de D&D 5e fiéis ao Livro do Jogador (PHB)
// Escopo: criação de personagem nível 1-3 (Stormwreck Isle).
//
// FONTE: livro-jogador-referencia.md (subido pelo usuário).
//   - Raças/sub-raças, perícias por classe, dados de vida, saves,
//     proficiências e tabela de armaduras: extraídos do livro.
//   - A TABELA DE ARMAS se perdeu na extração do PDF (colunas
//     mescladas). Os valores aqui são os canônicos de D&D 5e,
//     idênticos ao PHB; pontos confirmados no texto do livro
//     (ex.: machado de batalha 1d8, linha 254).
// ============================================================

const RULES = {
  abilities: ['FOR', 'DES', 'CON', 'INT', 'SAB', 'CAR'],
  abilityNames: {
    FOR: 'Força', DES: 'Destreza', CON: 'Constituição',
    INT: 'Inteligência', SAB: 'Sabedoria', CAR: 'Carisma'
  },
  abilityEng: { FOR:'STR', DES:'DEX', CON:'CON', INT:'INT', SAB:'WIS', CAR:'CHA' },

  // ----- PERÍCIAS (perícia → habilidade associada) -----
  skills: {
    'Acrobacia':'DES', 'Adestrar Animais':'SAB', 'Arcanismo':'INT',
    'Atletismo':'FOR', 'Atuação':'CAR', 'Enganação':'CAR',
    'Furtividade':'DES', 'História':'INT', 'Intimidação':'CAR',
    'Intuição':'SAB', 'Investigação':'INT', 'Medicina':'SAB',
    'Natureza':'INT', 'Percepção':'SAB', 'Persuasão':'CAR',
    'Prestidigitação':'DES', 'Religião':'INT', 'Sobrevivência':'SAB'
  },

  // =========================================================
  // RAÇAS (com sub-raças, ASI e traços) — PHB cap. 2
  // Cada traço tem um 'ef' opcional = gancho mecânico que o
  // motor de jogo lê (Fases 3-4). 'desc' é o texto narrado.
  // =========================================================
  races: {
    'Anão': {
      asi: { CON:2 }, speed: 7.5, darkvision: true, size: 'Médio',
      languages: ['Comum', 'Anão'],
      weaponProf: ['machado de batalha','machadinha','martelo leve','martelo de guerra'],
      traits: [
        { name:'Visão no Escuro', desc:'Enxerga na penumbra a 18m como luz plena e no escuro como penumbra (tons de cinza).', ef:{ darkvision:18 } },
        { name:'Resiliência Anã', desc:'Vantagem em saves contra veneno e resistência a dano de veneno.', ef:{ saveAdv:['veneno'], resist:['veneno'] } },
        { name:'Treinamento Anão em Combate', desc:'Proficiência com machados de batalha, machadinhas, martelos leves e de guerra.' },
        { name:'Conhecimento em Pedras', desc:'Soma o dobro da proficiência em testes de História ligados a trabalhos em pedra.' }
      ],
      subraces: {
        'Anão da Colina': {
          asi: { SAB:1 }, hpPerLevel: 1,
          traits: [ { name:'Tenacidade Anã', desc:'+1 ponto de vida máximo por nível.', ef:{ hpPerLevel:1 } } ]
        },
        'Anão da Montanha': {
          asi: { FOR:2 }, armorProf: ['leve','média'],
          traits: [ { name:'Treinamento Anão com Armaduras', desc:'Proficiência com armaduras leves e médias.' } ]
        }
      }
    },

    'Elfo': {
      asi: { DES:2 }, speed: 9, darkvision: true, size: 'Médio',
      languages: ['Comum', 'Élfico'],
      skillProf: ['Percepção'],
      traits: [
        { name:'Visão no Escuro', desc:'Enxerga na penumbra a 18m como luz plena e no escuro como penumbra.', ef:{ darkvision:18 } },
        { name:'Sentidos Aguçados', desc:'Proficiência na perícia Percepção.', ef:{ skillProf:['Percepção'] } },
        { name:'Ancestral Feérico', desc:'Vantagem em saves contra ser enfeitiçado; magia não pode colocá-lo para dormir.', ef:{ saveAdv:['enfeitiçar'], immune:['sono mágico'] } },
        { name:'Transe', desc:'Não dorme; medita 4h e ganha o benefício de 8h de sono.' }
      ],
      subraces: {
        'Alto Elfo': {
          asi: { INT:1 },
          weaponProf: ['espada longa','espada curta','arco longo','arco curto'],
          cantripFrom: 'Mago', extraLanguage: 1,
          traits: [
            { name:'Treinamento Élfico com Armas', desc:'Proficiência com espadas longas/curtas e arcos longos/curtos.' },
            { name:'Truque', desc:'Conhece um truque da lista de Mago (conjurado por INT).', ef:{ cantrips:1, cantripAbility:'INT' } },
            { name:'Idioma Adicional', desc:'Você fala, lê e escreve um idioma adicional à sua escolha.' }
          ]
        },
        'Elfo da Floresta': {
          asi: { SAB:1 }, speed: 10.5,
          weaponProf: ['espada longa','espada curta','arco longo','arco curto'],
          traits: [
            { name:'Treinamento Élfico com Armas', desc:'Proficiência com espadas longas/curtas e arcos longos/curtos.' },
            { name:'Pés Ligeiros', desc:'Deslocamento base aumenta para 10,5m.', ef:{ speed:10.5 } },
            { name:'Máscara da Natureza', desc:'Pode se esconder mesmo apenas levemente obscurecido por fenômeno natural.' }
          ]
        },
        'Drow (Elfo Negro)': {
          asi: { CAR:1 },
          weaponProf: ['rapieira','espada curta','besta de mão'],
          traits: [
            { name:'Visão no Escuro Superior', desc:'Visão no escuro com alcance de 36m.', ef:{ darkvision:36 } },
            { name:'Sensibilidade à Luz Solar', desc:'Desvantagem em ataques e Percepção (visão) sob luz solar direta.', ef:{ sunlightSensitivity:true } },
            { name:'Magia Drow', desc:'Conhece o truque globos de luz; ao subir de nível ganha fogo das fadas e escuridão (CAR).', ef:{ cantrips:1, cantripAbility:'CAR' } },
            { name:'Treinamento Drow com Armas', desc:'Proficiência com rapieiras, espadas curtas e bestas de mão.' }
          ]
        }
      }
    },

    'Halfling': {
      asi: { DES:2 }, speed: 7.5, darkvision: false, size: 'Pequeno',
      languages: ['Comum', 'Halfling'],
      traits: [
        { name:'Sortudo', desc:'Ao tirar 1 natural em ataque, teste de habilidade ou save, rerole e use o novo resultado.', ef:{ rerollNat1:true } },
        { name:'Bravura', desc:'Vantagem em saves contra ficar amedrontado.', ef:{ saveAdv:['amedrontar'] } },
        { name:'Agilidade Halfling', desc:'Pode mover-se pelo espaço de criaturas de tamanho maior.' }
      ],
      subraces: {
        'Pés Leves': {
          asi: { CAR:1 },
          traits: [ { name:'Furtividade Natural', desc:'Pode se esconder atrás de criatura ao menos um tamanho maior.' } ]
        },
        'Robusto': {
          asi: { CON:1 },
          traits: [ { name:'Resiliência dos Robustos', desc:'Vantagem em saves contra veneno e resistência a dano de veneno.', ef:{ saveAdv:['veneno'], resist:['veneno'] } } ]
        }
      }
    },

    'Humano': {
      asi: { FOR:1, DES:1, CON:1, INT:1, SAB:1, CAR:1 }, speed: 9, darkvision: false, size: 'Médio',
      languages: ['Comum'], extraLanguage: 1,
      traits: [
        { name:'Versatilidade', desc:'+1 em todos os atributos; um idioma adicional à escolha.' }
      ],
      subraces: {}
    },

    'Draconato': {
      asi: { FOR:2, CAR:1 }, speed: 9, darkvision: false, size: 'Médio',
      languages: ['Comum', 'Dracônico'],
      traits: [
        { name:'Ancestral Dracônico', desc:'Escolha um tipo de dragão; define dano e formato da arma de sopro.', ef:{ choose:'ancestralDraconico' } },
        { name:'Arma de Sopro', desc:'Ação: exala energia (2d6, CD 8+CON+prof; 3d6 no 6º, 4d6 no 11º, 5d6 no 16º). Recarrega em descanso.', ef:{ breathWeapon:'2d6' } },
        { name:'Resistência a Dano', desc:'Resistência ao tipo de dano do seu ancestral dracônico.', ef:{ resist:['ancestral'] } }
      ],
      subraces: {}
    },

    'Gnomo': {
      asi: { INT:2 }, speed: 7.5, darkvision: true, size: 'Pequeno',
      languages: ['Comum', 'Gnômico'],
      traits: [
        { name:'Visão no Escuro', desc:'Enxerga na penumbra a 18m como luz plena e no escuro como penumbra.', ef:{ darkvision:18 } },
        { name:'Astúcia Gnômica', desc:'Vantagem em saves de INT, SAB e CAR contra magia.', ef:{ saveAdvVsMagic:['INT','SAB','CAR'] } }
      ],
      subraces: {
        'Gnomo da Floresta': {
          asi: { DES:1 },
          traits: [
            { name:'Ilusão Menor', desc:'Conhece o truque ilusão menor (INT).', ef:{ cantrips:1, cantripAbility:'INT' } },
            { name:'Falar com Bestas Pequenas', desc:'Comunica ideias simples a bestas Pequenas ou menores.' }
          ]
        },
        'Gnomo da Rocha': {
          asi: { CON:1 },
          traits: [
            { name:'Conhecimento de Artífice', desc:'Soma o dobro da proficiência em História sobre itens mágicos, alquímicos ou tecnológicos.' },
            { name:'Engenhoqueiro', desc:'Proficiência com ferramentas de engenhoqueiro; pode construir engenhocas.' }
          ]
        }
      }
    },

    'Meio-Elfo': {
      asi: { CAR:2 }, speed: 9, darkvision: true, size: 'Médio',
      languages: ['Comum', 'Élfico'], extraLanguage: 1,
      asiChoice: { count: 2, amount: 1, exclude: ['CAR'] }, // +1 em dois atributos à escolha
      skillChoiceExtra: 2, // Versatilidade em Perícia: 2 perícias quaisquer
      traits: [
        { name:'Visão no Escuro', desc:'Enxerga na penumbra a 18m como luz plena e no escuro como penumbra.', ef:{ darkvision:18 } },
        { name:'Ancestral Feérico', desc:'Vantagem em saves contra ser enfeitiçado; magia não pode colocá-lo para dormir.', ef:{ saveAdv:['enfeitiçar'], immune:['sono mágico'] } },
        { name:'Versatilidade em Perícia', desc:'Proficiência em duas perícias à sua escolha.', ef:{ skillChoice:2 } }
      ],
      subraces: {}
    },

    'Meio-Orc': {
      asi: { FOR:2, CON:1 }, speed: 9, darkvision: true, size: 'Médio',
      languages: ['Comum', 'Orc'],
      skillProf: ['Intimidação'],
      traits: [
        { name:'Visão no Escuro', desc:'Enxerga na penumbra a 18m como luz plena e no escuro como penumbra.', ef:{ darkvision:18 } },
        { name:'Ameaça', desc:'Proficiência na perícia Intimidação.', ef:{ skillProf:['Intimidação'] } },
        { name:'Resistência Implacável', desc:'1×/descanso longo, ao cair a 0 HP fica com 1 HP em vez disso.', ef:{ relentless:true } },
        { name:'Ataques Selvagens', desc:'Em acerto crítico corpo-a-corpo, rola um dado de dano da arma adicional.', ef:{ savageCrit:true } }
      ],
      subraces: {}
    },

    'Tiefling': {
      asi: { INT:1, CAR:2 }, speed: 9, darkvision: true, size: 'Médio',
      languages: ['Comum', 'Infernal'],
      traits: [
        { name:'Visão no Escuro', desc:'Enxerga na penumbra a 18m como luz plena e no escuro como penumbra.', ef:{ darkvision:18 } },
        { name:'Resistência Infernal', desc:'Resistência a dano de fogo.', ef:{ resist:['fogo'] } },
        { name:'Legado Infernal', desc:'Conhece o truque taumaturgia; ganha repreensão infernal e escuridão em níveis superiores (CAR).', ef:{ cantrips:1, cantripAbility:'CAR' } }
      ],
      subraces: {}
    }
  },

  // =========================================================
  // ARMADURAS — PHB cap. 5 (linhas 7951-7969 do livro)
  // base = CA base; dexCap = limite do mod de DES (null = sem limite,
  // 0 = não soma DES). type = leve/média/pesada.
  // =========================================================
  armor: {
    'Nenhuma':          { type:null,     base:null, dexCap:null },
    'Acolchoada':       { type:'leve',   base:11,   dexCap:null },
    'Couro':            { type:'leve',   base:11,   dexCap:null },
    'Couro Batido':     { type:'leve',   base:12,   dexCap:null },
    'Gibão de Peles':   { type:'média',  base:12,   dexCap:2 },
    'Camisão de Malha': { type:'média',  base:13,   dexCap:2 },
    'Brunea':           { type:'média',  base:14,   dexCap:2 },
    'Peitoral':         { type:'média',  base:14,   dexCap:2 },
    'Meia-Armadura':    { type:'média',  base:15,   dexCap:2 },
    'Cota de Anéis':    { type:'pesada', base:14,   dexCap:0 },
    'Cota de Malha':    { type:'pesada', base:16,   dexCap:0 },
    'Cota de Talas':    { type:'pesada', base:17,   dexCap:0 },
    'Placas':           { type:'pesada', base:18,   dexCap:0 }
  },
  shieldBonus: 2,

  // =========================================================
  // ARMAS — valores canônicos de 5e (tabela perdida na extração).
  // cat = simples/marcial. dmg = dado de dano. type = dano.
  // props: acuidade, leve, pesada, arremesso, duas-mãos, versátil(dado), distância, munição, recarga.
  // =========================================================
  weapons: {
    // --- Simples corpo-a-corpo ---
    'Adaga':            { cat:'simples', dmg:'1d4', type:'perfurante', props:['acuidade','leve','arremesso'], melee:true },
    'Clava':            { cat:'simples', dmg:'1d4', type:'concussão',  props:['leve'], melee:true },
    'Bordão':           { cat:'simples', dmg:'1d6', type:'concussão',  props:['versátil:1d8'], melee:true },
    'Lança':            { cat:'simples', dmg:'1d6', type:'perfurante', props:['arremesso','versátil:1d8'], melee:true },
    'Maça':             { cat:'simples', dmg:'1d6', type:'concussão',  props:[], melee:true },
    'Machadinha':       { cat:'simples', dmg:'1d6', type:'cortante',   props:['leve','arremesso'], melee:true },
    'Azagaia':          { cat:'simples', dmg:'1d6', type:'perfurante', props:['arremesso'], melee:true },
    'Martelo Leve':     { cat:'simples', dmg:'1d4', type:'concussão',  props:['leve','arremesso'], melee:true },
    // --- Simples à distância ---
    'Besta Leve':       { cat:'simples', dmg:'1d8', type:'perfurante', props:['munição','duas-mãos','recarga'], melee:false },
    'Dardo':            { cat:'simples', dmg:'1d4', type:'perfurante', props:['acuidade','arremesso'], melee:false },
    'Funda':            { cat:'simples', dmg:'1d4', type:'concussão',  props:['munição'], melee:false },
    // --- Marciais corpo-a-corpo ---
    'Espada Curta':     { cat:'marcial', dmg:'1d6', type:'perfurante', props:['acuidade','leve'], melee:true },
    'Espada Longa':     { cat:'marcial', dmg:'1d8', type:'cortante',   props:['versátil:1d10'], melee:true },
    'Rapieira':         { cat:'marcial', dmg:'1d8', type:'perfurante', props:['acuidade'], melee:true },
    'Cimitarra':        { cat:'marcial', dmg:'1d6', type:'cortante',   props:['acuidade','leve'], melee:true },
    'Machado de Batalha':{cat:'marcial', dmg:'1d8', type:'cortante',   props:['versátil:1d10'], melee:true },
    'Martelo de Guerra':{ cat:'marcial', dmg:'1d8', type:'concussão',  props:['versátil:1d10'], melee:true },
    'Maça Estrela':     { cat:'marcial', dmg:'1d8', type:'perfurante', props:[], melee:true },
    'Machado Grande':   { cat:'marcial', dmg:'1d12',type:'cortante',   props:['pesada','duas-mãos'], melee:true },
    'Espada Grande':    { cat:'marcial', dmg:'2d6', type:'cortante',   props:['pesada','duas-mãos'], melee:true },
    'Glaive':           { cat:'marcial', dmg:'1d10',type:'cortante',   props:['pesada','alcance','duas-mãos'], melee:true },
    // --- Marciais à distância ---
    'Arco Curto':       { cat:'marcial', dmg:'1d6', type:'perfurante', props:['munição','duas-mãos'], melee:false },
    'Arco Longo':       { cat:'marcial', dmg:'1d8', type:'perfurante', props:['munição','pesada','duas-mãos'], melee:false },
    'Besta de Mão':     { cat:'marcial', dmg:'1d6', type:'perfurante', props:['munição','leve','recarga'], melee:false }
  },

  // =========================================================
  // CLASSES — PHB cap. 3 (dados de vida e saves conferidos no livro).
  // armorProf: leve/média/pesada/escudo. weaponProf: 'simples' | 'marciais' | lista.
  // skillCount + skillList: perícias do livro. spell: dados de conjuração nível 1.
  // subclassLevel: nível em que se escolhe a subclasse.
  // features: nomes por nível (mecânica detalhada na Fase 4).
  // =========================================================
  classes: {
    'Bárbaro': {
      hitDie:12, primary:['FOR'], saves:['FOR','CON'],
      armorProf:['leve','média','escudo'], weaponProf:'marciais',
      skillCount:2, skillList:['Adestrar Animais','Atletismo','Intimidação','Natureza','Percepção','Sobrevivência'],
      spell:null, unarmoredDefense:'CON',
      startingEquipment:[
        { choose:[['Machado Grande'],['qualquer arma marcial']] },
        { choose:[['duas Machadinhas'],['qualquer arma simples']] },
        { fixed:['Pacote de Aventureiro','quatro Azagaias'] }
      ],
      subclassLevel:3, subclasses:['Caminho do Berserker','Caminho do Guerreiro Totêmico'],
      features:{ 1:['Fúria','Defesa sem Armadura'], 2:['Ataque Descuidado','Sentido de Perigo'], 3:['Caminho Primal'] },
      desc:'Guerreiro feroz movido a fúria. O mais resistente.'
    },
    'Bardo': {
      hitDie:8, primary:['CAR'], saves:['DES','CAR'],
      armorProf:['leve'], weaponProf:['simples','besta de mão','espada longa','rapieira','espada curta'],
      skillCount:3, skillList:'any',
      spell:{ ability:'CAR', cantrips:2, slots1:2, spellsKnown:4 },
      startingEquipment:[
        { choose:[['Rapieira'],['Espada Longa'],['qualquer arma simples']] },
        { fixed:['Armadura de Couro','Adaga'] }
      ],
      subclassLevel:3, subclasses:['Colégio do Conhecimento','Colégio da Bravura'],
      features:{ 1:['Conjuração','Inspiração de Bardo (d6)'], 2:['Pau pra Toda Obra','Canção de Descanso'], 3:['Colégio de Bardo','Especialização'] },
      desc:'Mestre da inspiração e da palavra. Versátil e social.'
    },
    'Bruxo': {
      hitDie:8, primary:['CAR'], saves:['SAB','CAR'],
      armorProf:['leve'], weaponProf:'simples',
      skillCount:2, skillList:['Arcanismo','Enganação','História','Intimidação','Investigação','Natureza','Religião'],
      spell:{ ability:'CAR', cantrips:2, slots1:1, spellsKnown:2, pact:true },
      startingEquipment:[
        { choose:[['Besta Leve','20 virotes'],['qualquer arma simples']] },
        { fixed:['Armadura de Couro','qualquer arma simples','duas Adagas'] }
      ],
      subclassLevel:1, subclasses:['O Grande Antigo','O Corruptor','O Arquifada'],
      features:{ 1:['Patrono Sobrenatural','Magia de Pacto'], 2:['Invocações Sobrenaturais'], 3:['Dádiva do Pacto'] },
      desc:'Poder vindo de um pacto com uma entidade.'
    },
    'Clérigo': {
      hitDie:8, primary:['SAB'], saves:['SAB','CAR'],
      armorProf:['leve','média','escudo'], weaponProf:'simples',
      skillCount:2, skillList:['História','Intuição','Medicina','Persuasão','Religião'],
      spell:{ ability:'SAB', cantrips:3, slots1:2, prepares:true },
      startingEquipment:[
        { choose:[['Maça Estrela'],['Martelo de Guerra (se proficiente)']] },
        { choose:[['Brunea'],['Armadura de Couro'],['Cota de Malha (se proficiente)']] },
        { fixed:['Escudo','Símbolo Sagrado'] }
      ],
      subclassLevel:1, subclasses:['Domínio da Vida','Domínio da Luz','Domínio da Guerra'],
      features:{ 1:['Conjuração','Domínio Divino'], 2:['Canalizar Divindade (1/descanso)'], 3:['—'] },
      desc:'Canaliza poder divino. Cura e protege aliados.'
    },
    'Druida': {
      hitDie:8, primary:['SAB'], saves:['INT','SAB'],
      armorProf:['leve','média','escudo'], weaponProf:['clava','adaga','dardo','azagaia','maça','bordão','cimitarra','foice','funda','lança'],
      noMetalArmor:true,
      skillCount:2, skillList:['Arcanismo','Adestrar Animais','Intuição','Medicina','Natureza','Percepção','Religião','Sobrevivência'],
      spell:{ ability:'SAB', cantrips:2, slots1:2, prepares:true },
      startingEquipment:[
        { choose:[['Escudo de Madeira'],['qualquer arma simples']] },
        { choose:[['Cimitarra'],['qualquer arma simples corpo-a-corpo']] },
        { fixed:['Armadura de Couro','Foco Druídico'] }
      ],
      subclassLevel:2, subclasses:['Círculo da Terra','Círculo da Lua'],
      features:{ 1:['Druídico','Conjuração'], 2:['Forma Selvagem','Círculo Druídico'], 3:['—'] },
      desc:'Guardião da natureza. Conjura e mais tarde se transforma.'
    },
    'Feiticeiro': {
      hitDie:6, primary:['CAR'], saves:['CON','CAR'],
      armorProf:[], weaponProf:['adaga','dardo','funda','bordão','besta leve'],
      skillCount:2, skillList:['Arcanismo','Enganação','Intuição','Intimidação','Persuasão','Religião'],
      spell:{ ability:'CAR', cantrips:4, slots1:2, spellsKnown:2 },
      startingEquipment:[
        { choose:[['Besta Leve','20 virotes'],['qualquer arma simples']] },
        { choose:[['Bolsa de Componentes'],['Foco Arcano']] },
        { fixed:['duas Adagas'] }
      ],
      subclassLevel:1, subclasses:['Linhagem Dracônica','Magia Selvagem'],
      features:{ 1:['Conjuração','Origem de Feitiçaria'], 2:['Fonte de Magia'], 3:['Metamagia'] },
      desc:'Magia no sangue. Poder bruto e imprevisível.'
    },
    'Guerreiro': {
      hitDie:10, primary:['FOR','DES'], saves:['FOR','CON'],
      armorProf:['leve','média','pesada','escudo'], weaponProf:'marciais',
      skillCount:2, skillList:['Acrobacia','Adestrar Animais','Atletismo','História','Intuição','Intimidação','Percepção','Sobrevivência'],
      spell:null,
      startingEquipment:[
        { choose:[['Cota de Malha'],['Armadura de Couro','Arco Longo','20 flechas']] },
        { choose:[['arma marcial','Escudo'],['duas armas marciais']] },
        { choose:[['Besta Leve','20 virotes'],['duas Machadinhas']] }
      ],
      subclassLevel:3, subclasses:['Campeão','Mestre de Batalha','Cavaleiro Arcano'],
      features:{ 1:['Estilo de Luta','Retomar Fôlego'], 2:['Surto de Ação'], 3:['Arquétipo Marcial'] },
      desc:'Mestre de armas e armaduras. Resistente e versátil.'
    },
    'Ladino': {
      hitDie:8, primary:['DES'], saves:['DES','INT'],
      armorProf:['leve'], weaponProf:['simples','besta de mão','espada longa','rapieira','espada curta'],
      skillCount:4, skillList:['Acrobacia','Atletismo','Atuação','Enganação','Furtividade','Intimidação','Intuição','Investigação','Percepção','Persuasão','Prestidigitação'],
      spell:null, expertise:2,
      startingEquipment:[
        { choose:[['Rapieira'],['Espada Curta']] },
        { choose:[['Arco Curto','aljava com 20 flechas'],['Espada Curta']] },
        { fixed:['Armadura de Couro','duas Adagas','Ferramentas de Ladrão'] }
      ],
      subclassLevel:3, subclasses:['Ladrão','Assassino','Trapaceiro Arcano'],
      features:{ 1:['Especialização','Ataque Furtivo (1d6)','Gíria de Ladrão'], 2:['Ação Ardilosa'], 3:['Arquétipo Ladino','Ataque Furtivo (2d6)'] },
      desc:'Ágil e astuto. Dano preciso e perícia incomparável.'
    },
    'Mago': {
      hitDie:6, primary:['INT'], saves:['INT','SAB'],
      armorProf:[], weaponProf:['adaga','dardo','funda','bordão','besta leve'],
      skillCount:2, skillList:['Arcanismo','História','Intuição','Investigação','Medicina','Religião'],
      spell:{ ability:'INT', cantrips:3, slots1:2, prepares:true, spellbook:6 },
      startingEquipment:[
        { choose:[['Bordão'],['Adaga']] },
        { choose:[['Bolsa de Componentes'],['Foco Arcano']] },
        { fixed:['Grimório'] }
      ],
      subclassLevel:2, subclasses:['Escola de Evocação','Escola de Abjuração','Escola de Adivinhação'],
      features:{ 1:['Conjuração','Recuperação Arcana'], 2:['Tradição Arcana'], 3:['—'] },
      desc:'Conjurador erudito. Frágil, mas com magia versátil.'
    },
    'Monge': {
      hitDie:8, primary:['DES','SAB'], saves:['FOR','DES'],
      armorProf:[], weaponProf:['simples','espada curta'],
      skillCount:2, skillList:['Acrobacia','Atletismo','Furtividade','História','Intuição','Religião'],
      spell:null, unarmoredDefense:'SAB',
      startingEquipment:[
        { choose:[['Espada Curta'],['qualquer arma simples']] },
        { fixed:['Pacote de Aventureiro','10 Dardos'] }
      ],
      subclassLevel:3, subclasses:['Caminho da Mão Aberta','Caminho da Sombra','Caminho dos Quatro Elementos'],
      features:{ 1:['Defesa sem Armadura','Artes Marciais'], 2:['Chi','Movimento sem Armadura'], 3:['Tradição Monástica','Defletir Projéteis'] },
      desc:'Disciplina corporal. Rápido e ágil sem armadura.'
    },
    'Paladino': {
      hitDie:10, primary:['FOR','CAR'], saves:['SAB','CAR'],
      armorProf:['leve','média','pesada','escudo'], weaponProf:'marciais',
      skillCount:2, skillList:['Atletismo','Intuição','Intimidação','Medicina','Persuasão','Religião'],
      spell:null, // conjuração começa no nível 2
      startingEquipment:[
        { choose:[['arma marcial','Escudo'],['duas armas marciais']] },
        { choose:[['cinco Azagaias'],['qualquer arma simples corpo-a-corpo']] },
        { fixed:['Cota de Malha','Símbolo Sagrado'] }
      ],
      subclassLevel:3, subclasses:['Juramento de Devoção','Juramento dos Anciões','Juramento de Vingança'],
      features:{ 1:['Sentido Divino','Imposição das Mãos'], 2:['Estilo de Luta','Conjuração','Golpe Divino'], 3:['Saúde Divina','Juramento Sagrado'] },
      desc:'Guerreiro sagrado ligado a um juramento. Robusto.'
    },
    'Patrulheiro': {
      hitDie:10, primary:['DES','SAB'], saves:['FOR','DES'],
      armorProf:['leve','média','escudo'], weaponProf:'marciais',
      skillCount:3, skillList:['Adestrar Animais','Atletismo','Furtividade','Intuição','Investigação','Natureza','Percepção','Sobrevivência'],
      spell:null, // conjuração começa no nível 2
      startingEquipment:[
        { choose:[['Cota de Malha'],['Armadura de Couro']] },
        { choose:[['duas Espadas Curtas'],['duas armas simples corpo-a-corpo']] },
        { fixed:['Arco Longo','aljava com 20 flechas'] }
      ],
      subclassLevel:3, subclasses:['Caçador','Senhor das Feras'],
      features:{ 1:['Inimigo Favorito','Explorador Nato'], 2:['Estilo de Luta','Conjuração'], 3:['Arquétipo de Patrulheiro','Consciência Primeva'] },
      desc:'Caçador das terras selvagens. Combina arco e natureza.'
    }
  },

  // Condições — Apêndice A (efeitos resumidos; 'ef' = ganchos mecânicos)
  conditions: {
    'Agarrado':     { desc:'Deslocamento 0; acaba se o agarrador for incapacitado.', ef:{} },
    'Amedrontado':  { desc:'Desvantagem em testes e ataques enquanto vê a fonte.', ef:{ disAttack:true, disChecks:true } },
    'Atordoado':    { desc:'Incapacitado; falha automática em saves de FOR e DES; ataques contra têm vantagem.', ef:{ incapacitated:true, autoFailStrDex:true, attackedAdv:true } },
    'Caído':        { desc:'Desvantagem nos próprios ataques; corpo-a-corpo contra tem vantagem, à distância desvantagem.', ef:{ disAttack:true } },
    'Cego':         { desc:'Falha em testes que exigem visão; desvantagem nos ataques; ataques contra têm vantagem.', ef:{ disAttack:true, attackedAdv:true } },
    'Enfeitiçado':  { desc:'Não pode atacar quem o enfeitiçou.', ef:{} },
    'Envenenado':   { desc:'Desvantagem em ataques e testes de habilidade.', ef:{ disAttack:true, disChecks:true } },
    'Impedido':     { desc:'Deslocamento 0; desvantagem em ataques e saves de DES; ataques contra têm vantagem.', ef:{ disAttack:true, disDexSaves:true, attackedAdv:true } },
    'Incapacitado': { desc:'Não realiza ações nem reações.', ef:{ incapacitated:true } },
    'Inconsciente': { desc:'Incapacitado e caído; falha auto em saves de FOR/DES; ataques contra têm vantagem.', ef:{ incapacitated:true, autoFailStrDex:true, attackedAdv:true } },
    'Invisível':    { desc:'Vantagem nos ataques; desvantagem para quem o ataca.', ef:{ advAttack:true } },
    'Paralisado':   { desc:'Incapacitado; falha auto em saves de FOR/DES; ataques contra têm vantagem; crit a ≤1,5m.', ef:{ incapacitated:true, autoFailStrDex:true, attackedAdv:true } },
    'Petrificado':  { desc:'Incapacitado; resistência a todo dano; imune a veneno e doença.', ef:{ incapacitated:true } },
    'Surdo':        { desc:'Falha em testes que exigem audição.', ef:{} }
  },

  // Magias (truques lvl 0 e magias de nível 1). Descrições mecânicas próprias,
  // não o texto do livro. classes = quem pode aprender.
  spells: {
    // ---- Truques (nível 0) ----
    'Rajada de Fogo':   { lvl:0, desc:'Ataque à distância de magia; 1d10 de fogo.', classes:['Mago','Feiticeiro'] },
    'Raio de Gelo':     { lvl:0, desc:'Ataque à distância; 1d8 de frio e reduz o deslocamento do alvo.', classes:['Mago','Feiticeiro'] },
    'Toque Gélido':     { lvl:0, desc:'Mão espectral; ataque, 1d8 necrótico e o alvo não pode se curar até seu próximo turno.', classes:['Mago','Feiticeiro','Bruxo'] },
    'Mãos Mágicas':     { lvl:0, desc:'Mão espectral que manipula objetos leves a distância.', classes:['Mago','Feiticeiro','Bruxo','Bardo'] },
    'Ilusão Menor':     { lvl:0, desc:'Cria um som OU uma imagem ilusória pequena.', classes:['Mago','Feiticeiro','Bruxo','Bardo'] },
    'Truque':           { lvl:0, desc:'Pequenos efeitos sensoriais mágicos.', classes:['Mago','Feiticeiro','Bruxo','Bardo'] },
    'Luz':              { lvl:0, desc:'Faz um objeto brilhar como tocha (save DES p/ alvo relutante).', classes:['Mago','Feiticeiro','Bardo','Clérigo'] },
    'Estalo Sobrenatural': { lvl:0, desc:'Ataque à distância de magia; 1d10 de força (sobe com o nível).', classes:['Bruxo'] },
    'Chama Sagrada':    { lvl:0, desc:'1d8 radiante num alvo visível; save de DES nega.', classes:['Clérigo'] },
    'Orientação':       { lvl:0, desc:'+1d4 em um teste de habilidade (toque, concentração).', classes:['Clérigo','Druida'] },
    'Resistência':      { lvl:0, desc:'+1d4 em um teste de resistência (toque, concentração).', classes:['Clérigo','Druida'] },
    'Estabilizar':      { lvl:0, desc:'Estabiliza uma criatura caída a 0 HP (toque).', classes:['Clérigo'] },
    'Produzir Chama':   { lvl:0, desc:'Chama na mão: ilumina ou arremessa (ataque) por 1d8 de fogo.', classes:['Druida'] },
    'Shillelagh':       { lvl:0, desc:'Bordão/clava passa a usar SAB e causa 1d8.', classes:['Druida'] },
    'Zombaria Cruel':   { lvl:0, desc:'Insulto mágico: 1d4 psíquico e desvantagem no próximo ataque do alvo (save SAB).', classes:['Bardo'] },
    // ---- Magias de nível 1 ----
    'Mísseis Mágicos':  { lvl:1, desc:'3 dardos de força, 1d4+1 cada, acerto automático.', classes:['Mago','Feiticeiro'] },
    'Escudo Arcano':    { lvl:1, desc:'Reação: +5 de CA até o início do seu próximo turno.', classes:['Mago','Feiticeiro'] },
    'Mãos Flamejantes': { lvl:1, desc:'Cone de 4,5m; 3d6 de fogo, save de DES pela metade.', classes:['Mago','Feiticeiro'] },
    'Sono':             { lvl:1, desc:'Faz dormir criaturas somando 5d8 de HP, do menor HP ao maior.', classes:['Mago','Feiticeiro','Bardo'] },
    'Enfeitiçar Pessoa':{ lvl:1, desc:'Enfeitiça um humanoide visível (save SAB nega).', classes:['Mago','Feiticeiro','Bruxo','Bardo','Druida'] },
    'Detectar Magia':   { lvl:1, desc:'Sente a presença de magia a 9m (concentração).', classes:['Mago','Feiticeiro','Bruxo','Bardo','Clérigo','Druida','Paladino','Patrulheiro'] },
    'Disfarçar-se':     { lvl:1, desc:'Muda sua aparência (ilusão) por 1h.', classes:['Mago','Feiticeiro','Bruxo','Bardo'] },
    'Curar Ferimentos': { lvl:1, desc:'Toque: cura 1d8 + mod de conjuração.', classes:['Clérigo','Druida','Bardo','Paladino','Patrulheiro'] },
    'Palavra Curativa': { lvl:1, desc:'Ação bônus à distância: cura 1d4 + mod.', classes:['Clérigo','Druida','Bardo'] },
    'Bênção':           { lvl:1, desc:'Até 3 aliados somam 1d4 em ataques e saves (concentração).', classes:['Clérigo','Paladino'] },
    'Perdição':         { lvl:1, desc:'Até 3 inimigos subtraem 1d4 de ataques e saves (save CAR).', classes:['Clérigo','Bardo'] },
    'Escudo da Fé':     { lvl:1, desc:'+2 de CA num alvo (concentração).', classes:['Clérigo','Paladino'] },
    'Santuário':        { lvl:1, desc:'Protege um alvo: atacantes fazem save SAB ou desistem.', classes:['Clérigo'] },
    'Fada de Fogo':     { lvl:1, desc:'Ilumina os alvos numa área; ataques contra eles têm vantagem (save DES).', classes:['Bardo','Druida'] },
    'Enredar':          { lvl:1, desc:'Plantas prendem criaturas numa área (save FOR).', classes:['Druida','Patrulheiro'] },
    'Marca do Caçador': { lvl:1, desc:'+1d6 de dano nos seus ataques contra um alvo marcado.', classes:['Patrulheiro','Bruxo'] },
    'Heroísmo':         { lvl:1, desc:'Imune a medo e ganha HP temporário a cada turno (concentração).', classes:['Bardo','Paladino'] },
    'Repreensão Infernal': { lvl:1, desc:'Reação ao sofrer dano: 2d10 de fogo no agressor (save DES).', classes:['Bruxo','Feiticeiro'] }
  },

  // Estilos de Luta (Guerreiro nv1; Paladino/Patrulheiro nv2)
  fightingStyles: {
    'Arquearia':     '+2 nas jogadas de ataque com armas à distância.',
    'Defesa':        '+1 na CA enquanto usar armadura.',
    'Duelo':         '+2 no dano com arma de uma mão corpo-a-corpo.',
    'Armas Grandes': 'Re-rola 1 e 2 nos dados de dano de armas de duas mãos.'
  },

  // XP por nível (Stormwreck cobre 1-3; incluímos até 4 para folga)
  xpTable: { 1:0, 2:300, 3:900, 4:2700 },
  profByLevel: { 1:2, 2:2, 3:2, 4:2 }
};

// ============================================================
//  FUNÇÕES AUXILIARES
// ============================================================
function abilityMod(score) { return Math.floor((score - 10) / 2); }
function fmtMod(m) { return (m >= 0 ? '+' : '') + m; }
function profBonus(level) { return RULES.profByLevel[level] || 2; }

// Junta os bônus de ASI de raça + sub-raça + escolhas livres
function applyASI(scores, race, subraceName, asiChoices) {
  const r = RULES.races[race];
  const abilities = {};
  RULES.abilities.forEach(a => { abilities[a] = scores[a]; });
  // raça base
  for (const a in r.asi) abilities[a] += r.asi[a];
  // sub-raça
  if (subraceName && r.subraces && r.subraces[subraceName]) {
    const sr = r.subraces[subraceName];
    for (const a in (sr.asi || {})) abilities[a] += sr.asi[a];
  }
  // escolhas livres (Meio-Elfo: +1 em dois atributos; Humano não usa isto)
  if (r.asiChoice && asiChoices) {
    asiChoices.forEach(a => { if (abilities[a] !== undefined) abilities[a] += r.asiChoice.amount; });
  }
  return abilities;
}

// Coleta os ganchos mecânicos ('ef') de todos os traços de raça + sub-raça
function collectRacialEffects(race, subraceName) {
  const r = RULES.races[race];
  const out = { darkvision: r.darkvision ? 18 : 0, speed: r.speed, resist:[], saveAdv:[], saveAdvVsMagic:[], skillProf:[], cantrips:0, flags:{} };
  const absorb = (traits=[]) => traits.forEach(t => {
    if (!t.ef) return;
    if (t.ef.darkvision) out.darkvision = Math.max(out.darkvision, t.ef.darkvision);
    if (t.ef.speed) out.speed = t.ef.speed;
    if (t.ef.resist) out.resist.push(...t.ef.resist);
    if (t.ef.saveAdv) out.saveAdv.push(...t.ef.saveAdv);
    if (t.ef.saveAdvVsMagic) out.saveAdvVsMagic.push(...t.ef.saveAdvVsMagic);
    if (t.ef.skillProf) out.skillProf.push(...t.ef.skillProf);
    if (t.ef.cantrips) out.cantrips += t.ef.cantrips;
    ['rerollNat1','relentless','savageCrit','sunlightSensitivity','hpPerLevel'].forEach(f => {
      if (t.ef[f]) out.flags[f] = t.ef[f];
    });
  });
  absorb(r.traits);
  if (subraceName && r.subraces && r.subraces[subraceName]) absorb(r.subraces[subraceName].traits);
  return out;
}

// Calcula a CA a partir da armadura/escudo escolhidos (PHB cap. 5)
// Sem armadura: usa defesa sem armadura da classe (Bárbaro CON, Monge SAB) ou 10+DES.
function computeAC(cls, abilities, armorName, hasShield) {
  const c = RULES.classes[cls];
  const dex = abilityMod(abilities.DES);
  const armor = RULES.armor[armorName] || RULES.armor['Nenhuma'];
  let ac;
  if (!armor.base) {
    if (c.unarmoredDefense) ac = 10 + dex + abilityMod(abilities[c.unarmoredDefense]);
    else ac = 10 + dex;
  } else {
    const cap = armor.dexCap === null ? dex : Math.min(dex, armor.dexCap);
    ac = armor.base + cap;
  }
  if (hasShield) ac += RULES.shieldBonus;
  return ac;
}

// Compat: assinatura antiga usada por código legado. Sem armadura.
function computeCA(cls, abilities) { return computeAC(cls, abilities, 'Nenhuma', false); }

// ----- OPÇÕES DISPONÍVEIS (proficiências) — usado pela tela de criação -----

// Junta as proficiências de armadura de classe + sub-raça (ex.: Anão da Montanha)
function armorProfFor(cls, race, subrace) {
  const set = new Set(RULES.classes[cls].armorProf || []);
  const sr = race && subrace && RULES.races[race].subraces[subrace];
  if (sr && sr.armorProf) sr.armorProf.forEach(p => set.add(p));
  return set;
}

// Armaduras que o personagem pode vestir (inclui 'Nenhuma'); exclui metálicas p/ Druida
function availableArmors(cls, race, subrace) {
  const prof = armorProfFor(cls, race, subrace);
  const noMetal = !!RULES.classes[cls].noMetalArmor;
  const metalArmors = new Set(['Camisão de Malha','Cota de Anéis','Cota de Malha','Cota de Talas','Placas','Meia-Armadura']);
  const out = ['Nenhuma'];
  for (const name in RULES.armor) {
    const a = RULES.armor[name];
    if (!a.type) continue;                       // 'Nenhuma' já incluída
    if (!prof.has(a.type)) continue;             // sem proficiência no tipo
    if (noMetal && metalArmors.has(name)) continue;
    out.push(name);
  }
  return out;
}

function canUseShield(cls, race, subrace) {
  return armorProfFor(cls, race, subrace).has('escudo');
}

// Armas com as quais o personagem é proficiente (classe + raça + sub-raça)
function availableWeapons(cls, race, subrace) {
  const tokens = [];
  const add = p => { if (typeof p === 'string') tokens.push(p.toLowerCase()); else if (Array.isArray(p)) p.forEach(x => tokens.push(String(x).toLowerCase())); };
  add(RULES.classes[cls].weaponProf);
  if (race && RULES.races[race].weaponProf) add(RULES.races[race].weaponProf);
  const sr = race && subrace && RULES.races[race].subraces[subrace];
  if (sr && sr.weaponProf) add(sr.weaponProf);

  const allow = new Set();
  for (const name in RULES.weapons) {
    const cat = RULES.weapons[name].cat;         // 'simples' | 'marcial'
    const lname = name.toLowerCase();
    for (const t of tokens) {
      if (t === 'marciais' || t === 'marcial') { allow.add(name); break; }   // simples + marciais
      if ((t === 'simples' || t === 'simple') && cat === 'simples') { allow.add(name); break; }
      if (t === lname) { allow.add(name); break; }                            // arma específica
    }
  }
  return Array.from(allow);
}

// Pool de perícias da classe ('any' => todas as 18)
function skillOptionsFor(cls) {
  const list = RULES.classes[cls].skillList;
  return list === 'any' ? Object.keys(RULES.skills) : list.slice();
}

// Perícias concedidas de graça pela raça/sub-raça (ex.: Elfo Percepção, Meio-Orc Intimidação)
function fixedRacialSkills(race, subrace) {
  const out = [];
  const r = RULES.races[race];
  if (r.skillProf) out.push(...r.skillProf);
  (r.traits || []).forEach(t => { if (t.ef && t.ef.skillProf) out.push(...t.ef.skillProf); });
  return Array.from(new Set(out));
}

// ============================================================
//  RESOLUÇÃO DE ROLAGENS (lógica pura, testável) — Fase 3
//  A RNG (d20, dados de dano) fica no motor (game.js); aqui só a decisão.
// ============================================================

// O personagem é proficiente nesta perícia? (compara sem diferenciar caixa)
function skillProficient(c, skillName) {
  if (!skillName || !c.skills) return false;
  const key = Object.keys(RULES.skills).find(s => s.toLowerCase() === String(skillName).toLowerCase());
  return !!key && c.skills.includes(key);
}

// Decide modificador, proficiência e vantagem/desvantagem de uma rolagem.
// tipo: 'save' | 'ataque' | <nome de perícia> | <atributo livre>
// abr: 'FOR'..'CAR'.  tag: ameaça/situação opcional (veneno, enfeitiçar, magia, sol...).
function rollModifiers(c, tipo, abr, tag) {
  const t = String(tipo || '').toLowerCase();
  const tg = String(tag || '').toLowerCase();
  const fx = c.racialEffects || {};
  let mod = abilityMod(c.abilities[abr] || 10);
  let prof = false, adv = false, dis = false;

  if (t === 'save') {
    if (c.saves.includes(abr)) { mod += c.prof; prof = true; }
    // vantagem por traço racial: a ameaça casa com saveAdv (veneno, enfeitiçar, amedrontar...)
    if (tg && (fx.saveAdv || []).some(s => tg.includes(s.toLowerCase()) || s.toLowerCase().includes(tg))) adv = true;
    // Astúcia Gnômica: vantagem em saves de INT/SAB/CAR contra magia
    if ((fx.saveAdvVsMagic || []).includes(abr) && (tg.includes('magia') || tg.includes('magic'))) adv = true;
    // Fúria: vantagem em saves de Força
    if (c.raging && abr === 'FOR') adv = true;
  } else if (t === 'ataque' || t === 'attack') {
    mod += c.prof; prof = true;
    // Estilo de Luta — Arquearia: +2 em ataques à distância
    const w0 = RULES.weapons[(c.weapons && c.weapons[0])];
    if (c.fightingStyle === 'Arquearia' && w0 && !w0.melee) mod += 2;
  } else {
    // teste de perícia: proficiência só se o personagem realmente a tem
    if (skillProficient(c, tipo)) {
      mod += c.prof; prof = true;
      const key = Object.keys(RULES.skills).find(s => s.toLowerCase() === String(tipo).toLowerCase());
      if (key && (c.expertise || []).includes(key)) mod += c.prof;   // Especialização: proficiência dobrada
    }
    // Fúria: vantagem em testes de Força (ex.: Atletismo)
    if (c.raging && abr === 'FOR') adv = true;
  }

  // Sensibilidade à Luz Solar (Drow): desvantagem em ataques e Percepção sob sol direto
  if (fx.flags && fx.flags.sunlightSensitivity && (tg.includes('sol') || tg.includes('luz solar'))) {
    if (t === 'ataque' || t.includes('percep')) dis = true;
  }

  // Condições (Apêndice A) que afetam quem rola
  const ce = conditionEffects(c);
  let autoFail = false;
  if (t === 'ataque' || t === 'attack') {
    if (ce.disAttack) dis = true;
    if (ce.advAttack) adv = true;
  } else if (t === 'save') {
    if ((abr === 'FOR' || abr === 'DES') && ce.autoFailStrDex) autoFail = true;
    if (abr === 'DES' && ce.disDexSaves) dis = true;
  } else {
    if (ce.disChecks) dis = true;
  }

  // Vantagem e desvantagem se anulam (uma de cada = rolagem normal)
  if (adv && dis) { adv = false; dis = false; }
  return { mod, prof, adv, dis, autoFail };
}

// Especificação do dano da arma equipada (sem rolar). 'savage' = Ataques Selvagens (Meio-Orc).
function weaponDamageSpec(c, abr) {
  const wname = (c.weapons && c.weapons[0]) || null;
  const w = wname && RULES.weapons[wname];
  const savage = !!(c.racialEffects && c.racialEffects.flags && c.racialEffects.flags.savageCrit);
  if (!w) return { name: 'desarmado', dmg: null, flat: 1, bonus: 0, type: 'concussão', savage };
  return { name: wname, dmg: w.dmg, bonus: abilityMod(c.abilities[abr] || 10), type: w.type, savage };
}

// ----- FEATURES DE CLASSE (Fase 4) -----
function sneakAttackDice(level) { return Math.ceil(level / 2); }   // 1d6 nv1-2, 2d6 nv3-4
function ragesByLevel(level)    { return level >= 3 ? 3 : 2; }     // 2 usos nv1-2, 3 nv3-5
function rageDamage(level)      { return 2; }                      // +2 de dano até nv8
function fightingStyleLevel(cls){ return cls === 'Guerreiro' ? 1 : (cls === 'Paladino' || cls === 'Patrulheiro') ? 2 : null; }

// Perfil de dano de um ATAQUE, com features (Duelo, Fúria, Ataque Furtivo, Armas Grandes).
// hadAdvantage = se a jogada de ataque teve vantagem (gatilho do Ataque Furtivo).
function attackProfile(c, abr, hadAdvantage) {
  const wname = (c.weapons && c.weapons[0]) || null;
  const w = wname && RULES.weapons[wname];
  const fs = c.fightingStyle;
  const props = (w && w.props) || [];
  const twoH = props.includes('duas-mãos');
  const oneHandMelee = w && w.melee && !twoH;
  const finesseOrRanged = w && (!w.melee || props.includes('acuidade'));
  const savage = !!(c.racialEffects && c.racialEffects.flags && c.racialEffects.flags.savageCrit);

  let bonus = abilityMod(c.abilities[abr] || 10);
  if (fs === 'Duelo' && oneHandMelee) bonus += 2;                        // Estilo: Duelo
  if (c.raging && w && w.melee && abr === 'FOR') bonus += rageDamage(c.level); // Fúria

  let sneak = 0;                                                          // Ataque Furtivo
  if (c.cls === 'Ladino' && hadAdvantage && finesseOrRanged) sneak = sneakAttackDice(c.level);

  const gwf = fs === 'Armas Grandes' && twoH;                            // Estilo: Armas Grandes
  return { name: wname || 'desarmado', dmg: w ? w.dmg : null, flat: w ? 0 : 1,
           bonus, type: w ? w.type : 'concussão', savage, sneak, gwf };
}

// Recursos rastreáveis da classe no nível atual (slots, Fúria, etc.).
// kind: 'slots' | 'toggle' (Fúria) | 'counter' | 'pool'. recharge: 'short' | 'long'.
function classResources(c) {
  const out = [], L = c.level;
  if (c.spellSlots) out.push({ key:'slot1', label: (c.spellSlots.pact ? 'Slots de Pacto' : 'Slots de magia') + ` (nv${c.spellSlots.level||1})`, kind:'slots', pool:'spellSlots', max: c.spellSlots.max, recharge: c.spellSlots.pact ? 'short' : 'long' });
  if (c.spellSlots2 && c.spellSlots2.max) out.push({ key:'slot2', label:'Slots de magia (nv2)', kind:'slots', pool:'spellSlots2', max: c.spellSlots2.max, recharge:'long' });
  switch (c.cls) {
    case 'Bárbaro':    out.push({ key:'rage', label:'Fúria', kind:'toggle', max: ragesByLevel(L), recharge:'long' }); break;
    case 'Guerreiro':  out.push({ key:'secondwind', label:'Retomar Fôlego', kind:'counter', max:1, recharge:'short' });
                       if (L >= 2) out.push({ key:'actionsurge', label:'Surto de Ação', kind:'counter', max:1, recharge:'short' }); break;
    case 'Clérigo':    if (L >= 2) out.push({ key:'channel', label:'Canalizar Divindade', kind:'counter', max:1, recharge:'short' }); break;
    case 'Monge':      if (L >= 2) out.push({ key:'ki', label:'Pontos de Ki', kind:'counter', max:L, recharge:'short' }); break;
    case 'Bardo':      out.push({ key:'bardic', label:'Inspiração de Bardo', kind:'counter', max: Math.max(1, abilityMod(c.abilities.CAR)), recharge:'long' }); break;
    case 'Paladino':   out.push({ key:'layon', label:'Imposição das Mãos (HP)', kind:'pool', max: L*5, recharge:'long' }); break;
    case 'Mago':       out.push({ key:'arcrec', label:'Recuperação Arcana', kind:'counter', max:1, recharge:'long' }); break;
  }
  return out;
}

// ----- SELEÇÃO DE MAGIAS -----
function cantripsFor(cls) { return Object.keys(RULES.spells).filter(n => RULES.spells[n].lvl === 0 && RULES.spells[n].classes.includes(cls)); }
function spellsL1For(cls) { return Object.keys(RULES.spells).filter(n => RULES.spells[n].lvl === 1 && RULES.spells[n].classes.includes(cls)); }

// Quantos truques e magias o personagem escolhe no nível dado (null = não conjura).
function spellPicks(cls, abilities, level) {
  const sp = RULES.classes[cls].spell;
  if (!sp) {                                            // meio-conjuradores começam no nível 2
    if ((cls === 'Paladino' || cls === 'Patrulheiro') && level >= 2) {
      if (cls === 'Patrulheiro') return { cantrips:0, spells:2, prepared:false, cantripList:[], spellList: spellsL1For(cls) };
      const spells = Math.max(1, abilityMod(abilities.CAR) + Math.floor(level/2));   // Paladino prepara
      return { cantrips:0, spells, prepared:true, cantripList:[], spellList: spellsL1For(cls) };
    }
    return null;
  }
  let spells, prepared = false;
  if (sp.spellbook) spells = sp.spellbook;              // Mago: grimório (6 no nv1)
  else if (sp.spellsKnown) spells = sp.spellsKnown;     // Bardo/Feiticeiro/Bruxo: conhecidas
  else { prepared = true; spells = Math.max(1, abilityMod(abilities[sp.ability]) + level); } // Clérigo/Druida: prepara
  return { cantrips: sp.cantrips || 0, spells, prepared, cantripList: cantripsFor(cls), spellList: spellsL1For(cls) };
}

// ----- LEVEL-UP (nível 2-3) -----
function hitDieAverage(hd) { return Math.floor(hd / 2) + 1; }   // ganho médio de HP por nível

// Recalcula os slots de magia conforme classe + nível (nv1 em c.spellSlots, nv2 em c.spellSlots2).
function recomputeSpellSlots(c) {
  const L = c.level;
  if (c.cls === 'Paladino' || c.cls === 'Patrulheiro') {       // meio-conjuradores: começam no nível 2
    if (L < 2) { c.spellSlots = null; c.spellSlots2 = null; return; }
    const ability = c.cls === 'Paladino' ? 'CAR' : 'SAB';
    const max = L >= 3 ? 3 : 2;
    c.spellSlots = { max, used: Math.min((c.spellSlots && c.spellSlots.used) || 0, max), ability, pact:false, level:1 };
    c.spellSlots2 = null;
    c.spellAbility = ability;
    c.spellDC = 8 + c.prof + abilityMod(c.abilities[ability]);
    return;
  }
  const sp = RULES.classes[c.cls].spell;
  if (!sp || !c.spellSlots) return;
  if (sp.pact) {                                                // Bruxo (Magia de Pacto)
    c.spellSlots.max = L >= 2 ? 2 : 1;
    c.spellSlots.level = L >= 3 ? 2 : 1;
    c.spellSlots.used = Math.min(c.spellSlots.used || 0, c.spellSlots.max);
    return;
  }
  c.spellSlots.max = L >= 3 ? 4 : L === 2 ? 3 : 2;             // conjurador pleno: nv1 = 2/3/4
  c.spellSlots.level = 1;
  c.spellSlots.used = Math.min(c.spellSlots.used || 0, c.spellSlots.max);
  c.spellSlots2 = L >= 3 ? { max: 2, used: Math.min((c.spellSlots2 && c.spellSlots2.used) || 0, 2) } : null;
}

// O que o personagem precisa ESCOLHER ao chegar a newLevel.
function levelUpNeeds(c, newLevel) {
  const cd = RULES.classes[c.cls];
  return {
    subclass: cd.subclassLevel === newLevel && !c.archetype && (cd.subclasses || []).length > 0,
    fightingStyle: (c.cls === 'Paladino' || c.cls === 'Patrulheiro') && newLevel >= 2 && !c.fightingStyle
  };
}

// Agrega os efeitos das condições ativas que afetam quem rola (Fase 5).
function conditionEffects(c) {
  const out = { disAttack:false, advAttack:false, disChecks:false, disDexSaves:false, autoFailStrDex:false, incapacitated:false };
  (c.conditions || []).forEach(name => {
    const cd = RULES.conditions[name];
    if (cd && cd.ef) for (const k in cd.ef) if (out[k] !== undefined) out[k] = out[k] || cd.ef[k];
  });
  return out;
}

// ============================================================
//  buildCharacter — monta a ficha fiel ao PHB
//  opts: { name, player, slot, race, subrace, cls, scores,
//          asiChoices?, skills?, armor?, shield?, weapons? }
//  Campos opcionais ausentes => ficha parcial (preenchida na Fase 2).
// ============================================================
// Itens iniciais por classe — achata startingEquipment para exibição na criação.
function startingKitDisplay(cls) {
  const c = RULES.classes[cls];
  if (!c || !c.startingEquipment) return [];
  const out = [];
  c.startingEquipment.forEach(g => {
    if (g.fixed) g.fixed.forEach(x => out.push(x));
    else if (g.choose) out.push(g.choose.map(opt => opt.join(' + ')).join(' ou '));
  });
  out.push('Pacote de Aventureiro');
  return out;
}
// Itens fixos (sempre recebidos) que entram no inventário real.
function startingFixedItems(cls) {
  const c = RULES.classes[cls];
  if (!c || !c.startingEquipment) return [];
  const out = [];
  c.startingEquipment.forEach(g => { if (g.fixed) g.fixed.forEach(x => out.push(x)); });
  return out;
}

function buildCharacter(opts) {
  const { name, player, slot, race, cls, scores } = opts;
  const subrace   = opts.subrace || null;
  const asiChoices= opts.asiChoices || null;
  const r = RULES.races[race];
  const c = RULES.classes[cls];

  const abilities = applyASI(scores, race, subrace, asiChoices);
  const fx = collectRacialEffects(race, subrace);

  const level = 1, prof = profBonus(level);
  const conMod = abilityMod(abilities.CON);
  const hpPerLevelBonus = fx.flags.hpPerLevel || 0;     // Anão da Colina
  const maxHp = c.hitDie + conMod + hpPerLevelBonus;

  // perícias proficientes: raciais fixas + escolhidas
  const racialSkills = (r.skillProf || []).concat(fx.skillProf);
  const chosenSkills = opts.skills || [];
  const skills = Array.from(new Set(racialSkills.concat(chosenSkills)));

  // equipamento/CA
  const armorName = opts.armor || 'Nenhuma';
  const hasShield = !!opts.shield;
  const fightingStyle = opts.fightingStyle || null;
  let ca = computeAC(cls, abilities, armorName, hasShield);
  if (fightingStyle === 'Defesa' && armorName !== 'Nenhuma') ca += 1;   // Estilo de Luta: Defesa
  const weapons = opts.weapons || [];

  // proficiências de armadura/arma (raça pode adicionar — Anão da Montanha)
  let armorProf = (c.armorProf || []).slice();
  if (subrace && r.subraces[subrace] && r.subraces[subrace].armorProf) {
    armorProf = Array.from(new Set(armorProf.concat(r.subraces[subrace].armorProf)));
  }

  // conjuração nível 1
  let spellSlots = null, cantripsKnown = c.spell ? c.spell.cantrips : 0;
  if (c.spell && c.spell.slots1) spellSlots = { max: c.spell.slots1, used: 0, ability: c.spell.ability, pact: !!c.spell.pact };
  cantripsKnown += fx.cantrips; // truques raciais (Alto Elfo, Tiefling, etc.)
  const spellDC = c.spell ? 8 + prof + abilityMod(abilities[c.spell.ability]) : null;

  // idiomas
  let languages = (r.languages || []).slice();

  // traços narráveis (raça + sub-raça)
  const traits = (r.traits || []).map(t => t.name)
    .concat(subrace && r.subraces[subrace] ? (r.subraces[subrace].traits || []).map(t => t.name) : []);
  const features = (c.features && c.features[1]) ? c.features[1].slice() : [];

  // inventário inicial: armadura/arma escolhidas + kit fixo da classe (achatado)
  const armorKeys = new Set(Object.keys(RULES.armor || {}));
  const raw = [];
  if (armorName !== 'Nenhuma') raw.push(armorName);
  if (hasShield) raw.push('Escudo');
  weapons.forEach(w => raw.push(w));
  // itens fixos do kit da classe (pacotes, munição, ferramentas, focos, etc.)
  startingFixedItems(cls).forEach(it => { if (!armorKeys.has(it)) raw.push(it); });
  raw.push('Pacote de Aventureiro');
  if (c.spell && !raw.some(x => /foco|bolsa de componentes/i.test(x)))
    raw.push(c.spell.ability === 'INT' ? 'Foco arcano' : 'Foco de conjuração');
  // remove duplicatas (sem diferenciar maiúsculas)
  const seenInv = new Set();
  const inventory = raw.filter(x => { const k = x.toLowerCase().trim(); if (seenInv.has(k)) return false; seenInv.add(k); return true; });

  return {
    name, player, slot, race, subrace, cls,
    level, xp: 0, prof,
    abilities,
    maxHp, hp: maxHp,
    ca, armor: armorName, shield: hasShield,
    speed: fx.speed,
    darkvision: fx.darkvision > 0,
    darkvisionRange: fx.darkvision,
    size: r.size,
    saves: c.saves.slice(),
    skills,
    weapons,
    armorProf,
    weaponProf: c.weaponProf,
    languages,
    traits,
    features,
    racialEffects: fx,                // ganchos mecânicos p/ Fases 3-4
    spellSlots,
    cantripsKnown,
    spellAbility: c.spell ? c.spell.ability : null,
    spellDC,
    subclassPending: c.subclassLevel === 1 ? c.subclasses : null,
    fightingStyle,
    archetype: opts.archetype || null,
    raging: false,
    resUsed: {},                       // contagem de usos por recurso (Fase 4)
    conditions: [],
    cantripsChosen: opts.cantrips || [],
    spellsChosen: opts.spells || [],
    expertise: opts.expertise || [],   // Ladino: perícias com proficiência dobrada
    gold: opts.gold != null ? opts.gold : 15,
    inventory,
    profile: opts.profile || { appearance:'', context:'', motivation:'', flaw:'', quality:'' }
  };
}
