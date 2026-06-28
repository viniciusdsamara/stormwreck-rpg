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
      readAloud: `O barco mercante *Próspero* corta as ondas cinzentas rumo a Stormwreck Isle. Vocês foram contratados — ou pediram carona — para entregar suprimentos ao claustro de Dragon's Rest. O capitão, um meio-orc taciturno chamado Sabast, aponta para os penhascos de basalto negro à frente. "Lá está. Ilha esquisita. Dizem que é feita de osso de dragão." Então o céu escurece rápido demais. Um vento que não devia existir uiva entre as velas. Nuvens cor de brasa se enrolam sobre o mastro.`,
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
        'Tibor': "Velho marinheiro tagarela que sobreviveu a um naufrágio; conhece fofocas da ilha.",
        'Tarak': "Jovem kobold tímido, ex-morador das Cavernas Seagrow — viveu entre os myconids até o silêncio cair. Aflito, implora aos heróis que descubram se seus amigos-cogumelo estão vivos. Dá o gancho das cavernas.",
        'Varnoth': "Pescador rabugento e desconfiado. Viu o navio negro encalhar sozinho na costa norte, 'como se a maré o cuspisse'. Tem pavor de voltar lá. Dá o gancho do naufrágio.",
        'Rix': "Acólita ansiosa e insone. Jura ter visto uma jovem dragão de escamas faiscantes rodear o velho observatório à noite, entre relâmpagos. Ninguém acreditou nela. Dá o gancho do observatório."
      },
      hooks: [
        "Os myconids (povo-cogumelo) das Cavernas Seagrow ficaram em silêncio — pararam de comerciar ervas com o claustro. Algo os atacou. (Tarak está desesperado por notícias deles.)",
        "Um naufrágio amaldiçoado apareceu na costa norte, exalando uma aura de morte. (Varnoth o viu encalhar.)",
        "Uma jovem dragão das tempestades — Sparkrender — foi avistada sobre o observatório em ruínas. (O relato de Rix.)"
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
      readAloud: `Do lado sudoeste da ilha, fumaça tóxica sobe de fendas no chão — vapores que dizem vir da tumba vulcânica da dragão vermelha Sharruth. As Cavernas Seagrow se abrem na encosta, úmidas e fosforescentes. Lá dentro vivia uma colônia de myconids, gente-cogumelo pacífica que troca ervas raras com o claustro. Mas faz semanas que se calaram. Lá no teto, stirges — parasitas alados sedentos de sangue — guincham e batem asas, inquietos. E na entrada da caverna, algo maior se move na poça escura: tentáculos pálidos, cobertos de fungo apodrecido.`,
      objectives: ["Entrar nas cavernas", "Descobrir o que silenciou os myconids", "Encontrar Sinensa, líder dos myconids"],
      combat: 'polvo_fungo',
      npcs: {
        'Sinensa': "Líder myconid. Comunica-se por esporos (telepatia limitada). Pacífica, assustada. Sabe da tumba de Sharruth. Reconhece o nome de Tarak com carinho — ele foi da colônia.",
      },
      lore: "Se os heróis mencionarem Tarak (o kobold do claustro), Sinensa se acalma: ele era um dos seus. Os stirges no teto podem ser um perigo ambiental — descreva-os atacando se o grupo fizer barulho ou demorar, mas o combate principal é o polvo-fungo.",
      possibleRolls: ["INT (Natureza) sobre os fungos", "DEX (Furtividade) para não despertar os stirges", "CON (save) contra esporos tóxicos"],
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
      readAloud: `A costa norte é um cemitério de navios — mas um deles se destaca, encalhado nas rochas, o nome ainda legível na proa apodrecida: *Compass Rose*. O casco está coberto de cracas e de algo pior: uma película negra que suga a luz. O ar cheira a sal e podridão. Pegadas molhadas levam ao convés rachado. Lá dentro, na escuridão do porão, formas se arrastam. E numa parede, traçado em ferrugem e maré, um símbolo: a cabeça de um carneiro com uma maça — o emblema de Orcus.`,
      objectives: ["Explorar o Compass Rose amaldiçoado", "Enfrentar os mortos-vivos", "Descobrir a origem da maldição (Aletha e o pacto com Orcus)"],
      combat: 'naufragio_undead',
      npcs: {
        'Aletha (espectro)': "Passageira do Compass Rose. Morrendo no naufrágio, rezou a Orcus para reencontrar o marido perdido no mar — e o Príncipe Demônio respondeu. A prece virou maldição: todos que morrem afogados na ilha se erguem como mortos-vivos. Seu espírito triste ainda perambura o porão; pode ser acalmado (não só destruído) se os heróis entenderem sua dor."
      },
      lore: "A origem da maldição é Aletha: em testes de Religião/Intuição, revele aos poucos que uma passageira moribunda barganhou com Orcus por amor e condenou a costa. Pôr fim ao símbolo de Orcus (ou dar paz a Aletha) quebra o ciclo. Sobre Orcus: Príncipe Demônio dos Mortos-Vivos, do reino podre de Thanatos.",
      possibleRolls: ["INT (Religião) sobre Orcus", "WIS (Intuição) para entender Aletha", "WIS (save) contra medo", "DEX (Furtividade) no porão"],
      transitions: { 'observatorio': "Após limpar o navio, sobem para nível 3 e seguem ao Observatório" },
      next: 'observatorio'
    },

    // ---------- CAPÍTULO 4: CLIFFTOP OBSERVATORY ----------
    'observatorio': {
      chapter: "Capítulo 4 — Observatório do Penhasco",
      location: "Observatório no alto do penhasco",
      level: 3,
      summary: "Clímax. Sparkrender, a jovem dragão das tempestades, quer um ritual para despertar os espíritos dos dragões mortos da ilha e se tornar uma deusa. Possível paz ou batalha final.",
      levelUp: 3,
      readAloud: `No ponto mais alto de Stormwreck Isle ergue-se um antigo observatório de pedra, cúpula rachada aberta para o céu tempestuoso. Daqui se vê a ilha inteira — as cavernas fumegantes, o naufrágio negro, o claustro distante. E aqui está a fonte de tudo: Sparkrender, uma jovem dragão das tempestades, escamas azul-elétricas faiscando, enroscada sobre um círculo ritual de runas que pulsa com raios presos. Foi ela quem mexeu nas velhas feridas da ilha — para alimentar este feitiço. Ela ergue a cabeça serpentina na sua direção, relâmpagos lambendo as presas. "Então os ratos do claustro mandaram campeões. Que adorável. Cheguem mais perto — vão ver dragões de verdade ressuscitarem, e a mim me tornar deusa."`,
      objectives: ["Confrontar Sparkrender e interromper o ritual", "Escolher: negociar a paz entre dragões OU batalha final", "Resolver o destino da ilha"],
      combat: 'final_dragon',
      climax: true,
      lore: "Este é o clímax. Sparkrender é jovem, arrogante e insegura por baixo da bravata — quer despertar os espíritos dos dragões mortos de Stormwreck para roubar o poder deles e virar deusa; foi ela quem soltou as ameaças menores (a tumba de Sharruth, a maldição) ao remexer na ilha. Ela pode ser COMBATIDA ou DEMOVIDA: se os heróis a confrontarem com a verdade (ela está sozinha, com medo, e o ritual a destruiria também) e Runara intervier, a paz é possível (testes de CHA difíceis). Interromper o círculo ritual (INT Arcana) a enfraquece.",
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
      name: "Sparkrender, a Tempestade Jovem",
      enemies: [
        { id:'dragon', name:'Sparkrender', hp:75, ca:17, mod:6, dmg:'2d6+4', xp:1800, traits:'Sopro de raio (recarrega): linha, DEX save DC 14, metade do dano. Multiataque: mordida + 2 garras. Pode VOAR. Imune a dano elétrico.' }
      ],
      tactics: "Clímax. Sparkrender abre com o sopro de raio, depois mordida+garras; voa para reposicionar e fugir do corpo-a-corpo. Arrogante mas insegura. PODE ser demovida se os heróis negociarem a paz (CHA DC 16) ou mostrarem que o ritual a mataria também — nesse caso recua e, com a ajuda de Runara, vira aliada relutante.",
      xpTotal: 1800,
      negotiable: true
    }
  },

  // ===================================================
  // GUIA DO MESTRE — "tela do DM" só de referência.
  // NÃO vai para o prompt da IA (custo de token zero).
  // Cruzeia com scenes/encounters; acrescenta resumo,
  // pontos-chave, segredos e os ITENS MÁGICOS da campanha.
  // ===================================================
  guide: {
    // catálogo de itens/tesouro (fiéis ao módulo, mecânica padrão)
    items: {
      'pocao_cura':       { name:'Poção de Cura',              rarity:'Comum',   type:'Poção',                  effect:'Recupera 2d4+2 PV ao beber (uma ação).' },
      'pocao_cura_maior': { name:'Poção de Cura Maior',        rarity:'Incomum', type:'Poção',                  effect:'Recupera 4d4+4 PV ao beber (uma ação).' },
      'bencao_runara':    { name:'Escama de Bronze de Runara', rarity:'Comum',   type:'Maravilha (amuleto)',    effect:'Presente de Runara. Vantagem em saves para não ficar Amedrontado. Aquece de leve perto de magia dracônica.' },
      'lamina_mare':      { name:'Lâmina da Maré +1',          rarity:'Incomum', type:'Arma (espada)',          effect:'+1 em ataque e dano. Achada no naufrágio; pinga água salgada que nunca seca.' },
      'talisma_morte':    { name:'Talismã contra os Mortos',   rarity:'Incomum', type:'Maravilha',              effect:'Vantagem em saves contra Paralisia e contra efeitos de mortos-vivos enquanto carregado.' },
      'lagrima_sharruth': { name:'Lágrima de Sharruth',        rarity:'Incomum', type:'Gema mágica',            effect:'Cristal de fogo da tumba. 1×/dia: rajada de calor (1d8 fogo, 9m) ou ilumina/aquece por horas. Vale ~250 po.' },
      'covil_dragao':     { name:'Tesouro do Covil',           rarity:'—',       type:'Tesouro',                effect:'No clímax: ~300 po em moedas e gemas espalhadas pelo observatório, além do item mágico do ato.' }
    },
    // a campanha em ATOS (cada ato cruza com as cenas indicadas)
    acts: [
      {
        n:1, chapter:"Capítulo 1", title:"Dragon's Rest",
        scenes:['chegada','praia','claustro'],
        summary:"Os heróis chegam à ilha numa tempestade antinatural, enfrentam mortos-vivos na praia e sobem ao claustro de Dragon's Rest — refúgio da dragã de bronze Runara, que aponta os três problemas da ilha.",
        keyPoints:[
          "A tempestade é eco da magia de Sharruth. O capitão Sabast (meio-orc) quer largar a carga e fugir.",
          "Na praia, marinheiros afogados de OUTRO naufrágio se erguem como zumbis (1º combate — assustador mas vencível).",
          "No claustro: Runara, Irmão Clavel, Tibor — e três moradores que dão os ganchos: Tarak (kobold, ex-myconid, gancho das cavernas), Varnoth (pescador, viu o navio negro encalhar, gancho do naufrágio) e Rix (acólita, viu Sparkrender sobre o observatório, gancho do clímax).",
          "O claustro é porto seguro: descanso longo automático ao chegar."
        ],
        secrets:[
          "Runara é uma dragã de bronze milenar em forma humana — revela isso aos poucos.",
          "Diz a lenda que a ilha foi formada pela fúria de Sharruth, dragã vermelha aprisionada sob a terra."
        ],
        items:['pocao_cura','bencao_runara']
      },
      {
        n:2, chapter:"Capítulo 2", title:"Cavernas Seagrow",
        scenes:['cavernas','sharruth','claustro_volta'],
        summary:"Investigação das Cavernas Seagrow: um polvo-fungo morto-vivo guarda a entrada, os myconids estão aterrorizados, e fendas para o Plano do Fogo vazam da tumba de Sharruth, soltando fume drakes. O grupo volta ao claustro e sobe ao nível 2.",
        keyPoints:[
          "Na poça da entrada, um polvo-fungo morto-vivo agarra e puxa para a água (combate). Foge se muito ferido.",
          "Sinensa, líder myconid, fala por esporos (telepatia limitada): algo despertou na tumba.",
          "No fundo, fendas planares de fogo e fume drakes (sub-chefe do capítulo). O calor cresce.",
          "De volta ao claustro: recompensa de Runara + subida para o nível 2 + gancho do naufrágio."
        ],
        secrets:[
          "As fendas conectam ao Plano Elemental do Fogo; a tumba/prisão de Sharruth fica sob a ilha.",
          "Deixe ambíguo se Sharruth está viva ou morta — é assunto para outra aventura, longe daqui."
        ],
        items:['pocao_cura']
      },
      {
        n:3, chapter:"Capítulo 3", title:"Naufrágio Amaldiçoado",
        scenes:['naufragio'],
        summary:"O Compass Rose, navio fantasma encalhado na costa norte: uma película negra que suga a luz, zumbis e um ghoul paralisante. A origem da maldição é Aletha e seu pacto com Orcus.",
        keyPoints:[
          "Pegadas molhadas levam ao porão escuro; o ar cheira a sal e podridão. O nome na proa: Compass Rose.",
          "Combate: 1 Ghoul (garras paralisam — CON save DC 10) + 2 zumbis. O escuro favorece emboscada.",
          "Na parede, um símbolo: cabeça de carneiro com maça — o emblema de Orcus.",
          "O espectro de Aletha pode ser acalmado (não só destruído) se entenderem sua dor — isso quebra a maldição.",
          "Limpar o navio sobe o grupo para o nível 3."
        ],
        secrets:[
          "A maldição nasceu de Aletha, passageira moribunda do Compass Rose que rezou a Orcus para reencontrar o marido perdido no mar; o Príncipe Demônio dos Mortos-Vivos (reino de Thanatos) respondeu e a costa passou a erguer afogados como mortos-vivos."
        ],
        items:['lamina_mare','talisma_morte']
      },
      {
        n:4, chapter:"Capítulo 4 + Epílogo", title:"Observatório do Penhasco",
        scenes:['observatorio','epilogo'],
        summary:"Clímax no observatório do penhasco: Sparkrender, a jovem dragã das tempestades, conduz um ritual para despertar os espíritos dos dragões mortos da ilha e virar deusa. Pode haver batalha final OU paz negociada (com Runara). Depois, o epílogo em Dragon's Rest.",
        keyPoints:[
          "Sparkrender é o clímax (HP 75 · CA 17 · sopro de RAIO DEX save DC 14 · voa · multiataque · imune a elétrico).",
          "Ela é a MENTE por trás das ameaças menores: remexeu a ilha (tumba de Sharruth, maldição) para alimentar o ritual.",
          "Interromper o círculo ritual (INT Arcana) a enfraquece no combate.",
          "ELA É NEGOCIÁVEL: Persuasão DC 16 + ajuda de Runara, ou mostrar que o ritual a mataria também, pode selar a paz — honre a escolha do grupo.",
          "Subir a este ato já leva o grupo ao nível 3.",
          "Epílogo: Runara assume a verdadeira forma por um instante; gancho para a Costa da Espada."
        ],
        secrets:[
          "Sparkrender é jovem, sozinha e assustada por baixo da arrogância — o ritual roubaria o poder dos dragões mortos, mas também a consumiria. A paz é um final tão válido quanto o combate; se negociarem bem, ela vira aliada relutante com a intervenção de Runara."
        ],
        items:['pocao_cura_maior','lagrima_sharruth','covil_dragao']
      }
    ]
  }
};
