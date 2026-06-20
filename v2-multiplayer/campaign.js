// ============================================================
// campaign.js — DRAGONS OF STORMWRECK ISLE
// Estrutura em CENAS. Cada cena é um "trilho" que a IA segue.
// A IA recebe só a cena atual + estado. Não improvisa a trama.
// ============================================================

const CAMPAIGN = {
  title: "Dragões da Ilha Tormenta",
  premise: `Stormwreck Isle é uma ilha pequena e rochosa no Mar das Espadas, 25 milhas ao sul de Águasfundas (Neverwinter). Diz a lenda que a fúria aprisionada da dragão vermelha Sharruth formou a ilha — seus fogos ergueram a terra dos vulcões submarinos onde seus inimigos a prenderam. A terra carrega cicatrizes mágicas de eras de batalhas entre dragões cromáticos (malignos) e metálicos (benignos). O claustro de Dragon's Rest tenta deixar o conflito no passado e servir de refúgio de paz, liderado pela dragão de bronze Runara em forma humana. Mas algo perturba a ilha de novo.`,

  // Regras globais que a IA SEMPRE respeita
  dmRules: [
    "Você é o Mestre (DM). Narre em português do Brasil, com termos de regra em inglês (HP, AC, saving throw, DC).",
    "NUNCA role dados você mesmo. Quando uma ação exige rolagem, peça a rolagem usando o marcador [ROLL:tipo:atributo:CD] e PARE. O sistema rola e devolve o resultado.",
    "NUNCA decida o resultado de uma ação incerta sem dado. Combate, persuasão, furtividade, arcanismo: tudo exige rolagem.",
    "NUNCA controle os personagens dos jogadores nem decida o que eles sentem ou falam.",
    "Mantenha a narração concisa: 2 a 4 parágrafos curtos por turno. Termine sempre devolvendo o controle ao jogador.",
    "Permaneça DENTRO da cena atual fornecida. Não invente locais ou NPCs fora do roteiro. Se os jogadores tentarem ir além, gentilmente reconduza ou use a transição apropriada.",
    "Quando os objetivos da cena forem cumpridos, sinalize com [SCENE_COMPLETE] ao final.",
    "Para iniciar combate, use [COMBAT_START:id_do_encontro].",
    "Dois personagens jogam. Dê espaço para ambos agirem; pergunte de quem é a vez quando fizer sentido.",
    "Tom: aventura heroica acessível, leve assombração nas masmorras. Sem crueldade gráfica."
  ],

  // ===================================================
  // CENAS — o coração do sistema
  // ===================================================
  scenes: {

    // ---------- CAPÍTULO 1: DRAGON'S REST ----------
    'chegada': {
      chapter: "Capítulo 1 — Dragon's Rest",
      location: "Mar das Espadas, a bordo do Próspero",
      level: 1,
      summary: "Os heróis chegam de barco à ilha. Uma tempestade súbita e antinatural ameaça o navio perto da costa.",
      readAloud: `O barco mercante *Próspero* corta as ondas cinzentas rumo a Stormwreck Isle. Vocês foram contratados — ou pediram carona — para entregar suprimentos ao claustro de Dragon's Rest. O capitão, um meio-orc taciturno chamado Sabpast, aponta para os penhascos de basalto negro à frente. "Lá está. Ilha esquisita. Dizem que é feita de osso de dragão." Então o céu escurece rápido demais. Um vento que não devia existir uiva entre as velas. Nuvens cor de brasa se enrolam sobre o mastro.`,
      objectives: ["Sobreviver à tempestade mágica", "Chegar à praia de Dragon's Rest"],
      npcs: {
        'Sabast': "Capitão meio-orc do Próspero. Prático, supersticioso, quer largar a carga e ir embora."
      },
      possibleRolls: ["DEX (Acrobacia) para se segurar no convés", "STR (Atletismo) para amarrar carga solta", "WIS (Percepção) para notar rochas"],
      transitions: { 'praia': "Quando chegam à praia em segurança" },
      next: 'praia'
    },

    'praia': {
      chapter: "Capítulo 1 — Dragon's Rest",
      location: "Praia de Dragon's Rest",
      level: 1,
      summary: "Na praia, marinheiros afogados de OUTRO naufrágio se erguem como zumbis. Primeiro combate.",
      readAloud: `A tempestade passa tão rápido quanto veio. O *Próspero* encalha numa enseada de areia preta. Vocês pisam em terra firme — e veem corpos na praia. Marinheiros afogados, inchados pela água. Então, um deles se mexe. Depois outro. Olhos vazios se abrem. Eles se levantam com movimentos quebrados e começam a arrastar-se na sua direção.`,
      objectives: ["Derrotar os mortos-vivos", "Alcançar o claustro acima dos penhascos"],
      combat: 'praia_zumbis',
      transitions: { 'claustro': "Depois do combate, ao subir ao claustro" },
      next: 'claustro'
    },

    'claustro': {
      chapter: "Capítulo 1 — Dragon's Rest",
      location: "Claustro de Dragon's Rest",
      level: 1,
      rest: 'long',   // refúgio seguro: descanso longo automático ao chegar
      summary: "Refúgio no topo dos penhascos. Conhecer Runara e moradores. Hub de missões.",
      readAloud: `Uma escadaria esculpida na rocha leva ao claustro de Dragon's Rest — um conjunto de prédios de pedra clara abraçados pela face do penhasco, com jardins de flores brancas balançando ao vento salgado. Uma mulher de cabelos cor de bronze e olhos dourados vem ao seu encontro, túnica simples, postura serena mas que carrega algo antigo. "Bem-vindos. Sou Runara. Vocês chegaram num momento difícil." Ela observa o sangue de zumbi nas suas roupas e não parece surpresa.`,
      objectives: ["Conhecer Runara e os moradores", "Descobrir os problemas da ilha", "Aceitar investigar as Cavernas Seagrow"],
      npcs: {
        'Runara': "Dragão de bronze milenar em forma humana. Líder do claustro. Sábia, calma, busca a paz entre dragões. Cabelos de bronze, olhos dourados.",
        'Irmão Clavel': "Acólito humano nervoso, cuida da biblioteca e das ervas.",
        'Tibor': "Velho marinheiro tagarela que sobreviveu a um naufrágio; conhece fofocas da ilha."
      },
      hooks: [
        "Os myconids (povo-cogumelo) das Cavernas Seagrow ficaram em silêncio — paravam de comerciar ervas com o claustro. Algo os atacou.",
        "Um naufrágio amaldiçoado apareceu na costa norte, exalando uma aura de morte.",
        "Há um wyrmling (filhote de dragão) perdido na ilha."
      ],
      possibleRolls: ["CHA (Persuasão) com Runara", "INT (História/Religião) sobre dragões", "WIS (Intuição) para ler Runara"],
      transitions: { 'cavernas': "Quando decidem ir às Cavernas Seagrow" },
      next: 'cavernas'
    },

    // ---------- CAPÍTULO 2: SEAGROW CAVES ----------
    'cavernas': {
      chapter: "Capítulo 2 — Cavernas Seagrow",
      location: "Entrada das Cavernas Seagrow",
      level: 1,
      summary: "Caverna dos myconids. Um polvo-fungo morto-vivo guarda a entrada. A tumba da dragão Sharruth vaza magia do Plano do Fogo.",
      readAloud: `Do lado sudoeste da ilha, fumaça tóxica sobe de fendas no chão — vapores que dizem vir da tumba vulcânica da dragão vermelha Sharruth. As Cavernas Seagrow se abrem na encosta, úmidas e fosforescentes. Lá dentro vivia uma colônia de myconids, gente-cogumelo pacífica que troca ervas raras com o claustro. Mas faz semanas que se calaram. Na entrada da caverna, algo se move na poça escura — tentáculos pálidos, cobertos de fungo apodrecido.`,
      objectives: ["Entrar nas cavernas", "Descobrir o que silenciou os myconids", "Encontrar Sinensa, líder dos myconids"],
      combat: 'polvo_fungo',
      npcs: {
        'Sinensa': "Líder myconid. Comunica-se por esporos (telepatia limitada). Pacífica, assustada. Sabe da tumba de Sharruth.",
      },
      possibleRolls: ["INT (Natureza) sobre os fungos", "DEX (Furtividade) na caverna", "CON (save) contra esporos tóxicos"],
      transitions: { 'sharruth': "Ao investigar a fonte de magia de fogo", 'claustro_volta': "Se voltarem ao claustro" },
      next: 'sharruth'
    },

    'sharruth': {
      chapter: "Capítulo 2 — Cavernas Seagrow",
      location: "Câmara da Tumba de Sharruth",
      level: 2,
      summary: "Fendas para o Plano do Fogo. Pequenos dragões de fumaça (fume drakes) emergem. Sub-chefe do capítulo.",
      readAloud: `No fundo das cavernas, o calor aumenta. Uma câmara se abre, cortada por fendas brilhantes de luz alaranjada — rachaduras na própria realidade que conectam ao Plano Elemental do Fogo. Esta é a borda da tumba de Sharruth, a dragão vermelha cuja raiva, dizem, criou a ilha. Dela escapam criaturas pequenas e malignas: fume drakes, draconetes feitos de fumaça e cinza, que sibilam ao vê-los.`,
      objectives: ["Derrotar ou afugentar os fume drakes", "Selar ou entender as fendas", "Aprender o segredo da tumba de Sharruth"],
      combat: 'fume_drakes',
      lore: "Nos fume drakes derrotados, deixe que revelem que a tumba/prisão de Sharruth fica sob a ilha. Os jogadores podem ponderar se Sharruth está viva ou morta e que poder ela teria — mas deixe claro que responder isso é assunto para outro dia, longe daqui.",
      possibleRolls: ["INT (Arcana) sobre as fendas planares", "DEX (save) contra explosões de fogo"],
      transitions: { 'claustro_volta': "Após resolver as cavernas, voltam ao claustro (sobem para nível 2)" },
      next: 'claustro_volta'
    },

    'claustro_volta': {
      chapter: "Capítulo 2 — Interlúdio",
      location: "Claustro de Dragon's Rest",
      level: 2,
      rest: 'long',   // interlúdio seguro: descanso longo automático
      summary: "Retorno ao claustro. Descanso, recompensa, gancho para o naufrágio amaldiçoado. SOBE PARA NÍVEL 2.",
      readAloud: `Vocês retornam ao claustro com notícias das cavernas. Runara escuta em silêncio, o rosto dourado tenso ao ouvir sobre as fendas de Sharruth. "Então a velha ferida ainda sangra", murmura ela. Ela cuida dos seus ferimentos e oferece descanso. Mas há mais. "Um navio surgiu na costa norte. Não devia estar ali — afundou há anos. E carrega uma escuridão que sinto daqui."`,
      objectives: ["Descansar e subir para o nível 2", "Receber recompensa de Runara", "Aceitar investigar o Naufrágio Amaldiçoado"],
      levelUp: 2,
      npcs: { 'Runara': "Mais aberta agora, confia nos heróis. Revela preocupação com a tumba de Sharruth." },
      transitions: { 'naufragio': "Quando partem para o naufrágio" },
      next: 'naufragio'
    },

    // ---------- CAPÍTULO 3: CURSED SHIPWRECK ----------
    'naufragio': {
      chapter: "Capítulo 3 — Naufrágio Amaldiçoado",
      location: "Casco do navio naufragado, costa norte",
      level: 2,
      summary: "Navio fantasma encalhado. Zumbis e ghouls. Um efígie de Orcus, Príncipe Demônio dos Mortos-Vivos.",
      readAloud: `A costa norte é um cemitério de navios — mas um deles se destaca, encalhado nas rochas, o casco coberto de cracas e algo pior: uma película negra que suga a luz. O ar cheira a sal e podridão. Pegadas molhadas levam ao convés rachado. Lá dentro, na escuridão do porão, formas se arrastam. E numa parede, alguém esculpiu um símbolo: a cabeça de um carneiro com uma maça — o emblema de Orcus.`,
      objectives: ["Explorar o navio amaldiçoado", "Enfrentar os mortos-vivos", "Descobrir a origem da maldição (culto a Orcus)"],
      combat: 'naufragio_undead',
      npcs: {},
      lore: "Em testes de Religião, deixe os jogadores aprenderem sobre Orcus e seu reino terrível de Thanatos. A maldição vem de um efígie deixada por um cultista.",
      possibleRolls: ["INT (Religião) sobre Orcus", "WIS (save) contra medo", "DEX (Furtividade) no porão"],
      transitions: { 'observatorio': "Após limpar o navio, sobem para nível 3 e seguem ao Observatório" },
      next: 'observatorio'
    },

    // ---------- CAPÍTULO 4: CLIFFTOP OBSERVATORY ----------
    'observatorio': {
      chapter: "Capítulo 4 — Observatório do Penhasco",
      location: "Observatório no alto do penhasco",
      level: 3,
      summary: "Clímax. A dragão cromática jovem que arma as ameaças da ilha está aqui. Possível paz ou batalha final.",
      levelUp: 3,
      readAloud: `No ponto mais alto de Stormwreck Isle ergue-se um antigo observatório de pedra, cúpula rachada aberta para o céu. Daqui se vê a ilha inteira — as cavernas fumegantes, o naufrágio negro, o claustro distante. E aqui está a fonte de tudo: uma jovem dragão cromática, escamas reluzentes, que tem usado a ilha como tabuleiro. Ela vira a cabeça serpentina na sua direção. "Então os ratos do claustro mandaram campeões. Que adorável."`,
      objectives: ["Confrontar a dragão jovem", "Escolher: negociar a paz entre dragões OU batalha final", "Resolver o destino da ilha"],
      combat: 'final_dragon',
      climax: true,
      lore: "Este é o clímax. A dragão pode ser combatida OU os jogadores podem buscar a paz entre as famílias de dragões (com Runara). Honre a escolha deles. Se negociarem bem (testes de CHA difíceis), a paz é possível e Runara intervém como aliada.",
      possibleRolls: ["CHA (Persuasão) DC alta para paz", "todos os tipos em combate"],
      transitions: { 'epilogo': "Quando a dragão é derrotada ou a paz é selada" },
      next: 'epilogo'
    },

    'epilogo': {
      chapter: "Epílogo",
      location: "Dragon's Rest",
      level: 3,
      summary: "Desfecho. Runara honra os heróis. Gancho para futuras aventuras (Costa da Espada).",
      readAloud: `Stormwreck Isle respira de novo. No claustro, Runara — que vocês agora sabem ser uma dragão de bronze milenar — assume sua verdadeira forma por um instante, asas de metal vivo refletindo o pôr do sol, antes de voltar ao rosto humano. "Vocês trouxeram paz a uma terra que conheceu só guerra por eras. Os dragões lembrarão disso." Um navio espera na enseada para levá-los de volta à Costa da Espada — e às próximas aventuras.`,
      objectives: ["Receber o reconhecimento", "Encerrar a campanha"],
      ending: true,
      transitions: {}
    }
  },

  // ===================================================
  // ENCONTROS DE COMBATE — stats prontos
  // ===================================================
  encounters: {
    'praia_zumbis': {
      name: "Marinheiros Afogados",
      enemies: [
        { id:'z1', name:'Zumbi Afogado', hp:22, ca:8, mod:3, dmg:'1d6+1', xp:50, traits:'Fortitude Morta-Viva: se reduzido a 0, rola CON save DC 5+dano para ficar com 1 HP' },
        { id:'z2', name:'Zumbi Afogado', hp:22, ca:8, mod:3, dmg:'1d6+1', xp:50 }
      ],
      tactics: "Lentos mas implacáveis. Avançam em linha reta. Bom primeiro combate — assustador mas vencível.",
      xpTotal: 100
    },
    'polvo_fungo': {
      name: "Polvo-Fungo Morto-Vivo",
      enemies: [
        { id:'po', name:'Polvo de Fungo', hp:26, ca:11, mod:4, dmg:'1d6+2', xp:100, traits:'Multiataque: 2 tentáculos. Pode agarrar (grapple).' }
      ],
      tactics: "Guarda a poça da entrada. Agarra com tentáculos e puxa para a água. Foge se muito ferido.",
      xpTotal: 100
    },
    'fume_drakes': {
      name: "Fume Drakes da Tumba",
      enemies: [
        { id:'f1', name:'Fume Drake', hp:13, ca:13, mod:4, dmg:'1d4+2 +1d4 fogo', xp:100 },
        { id:'f2', name:'Fume Drake', hp:13, ca:13, mod:4, dmg:'1d4+2 +1d4 fogo', xp:100 }
      ],
      tactics: "Voam e cospem fumaça quente. Sibilam segredos sobre Sharruth ao morrer. Cobardes em grupo pequeno.",
      xpTotal: 200
    },
    'naufragio_undead': {
      name: "Tripulação Amaldiçoada",
      enemies: [
        { id:'g1', name:'Ghoul', hp:22, ca:12, mod:4, dmg:'1d6+2', xp:200, traits:'Garras podem paralisar: alvo faz CON save DC 10 ou fica paralisado 1 min' },
        { id:'zu1', name:'Zumbi', hp:22, ca:8, mod:3, dmg:'1d6+1', xp:50 },
        { id:'zu2', name:'Zumbi', hp:22, ca:8, mod:3, dmg:'1d6+1', xp:50 }
      ],
      tactics: "Ghoul lidera, tenta paralisar o mais forte. Zumbis cercam. Ambiente escuro favorece emboscada.",
      xpTotal: 300
    },
    'final_dragon': {
      name: "Dragão Cromático Jovem",
      enemies: [
        { id:'dragon', name:'Dragão Jovem', hp:75, ca:17, mod:6, dmg:'2d6+4', xp:1800, traits:'Sopro elemental (recarrega): área, DEX save DC 14 metade do dano. Multiataque: mordida + 2 garras. Pode VOAR.' }
      ],
      tactics: "Clímax. Usa o sopro cedo, depois mordida+garras. Voa para reposicionar. PODE ser convencida a parar se os heróis negociarem a paz (CHA DC 16) — nesse caso vira aliada relutante com ajuda de Runara.",
      xpTotal: 1800,
      negotiable: true
    }
  }
};
