// ============================================================
// tactical-maps.js — grids de combate por cena (mapa tático).
// Origem [0,0] = canto superior-esquerdo. x→direita, y→baixo.
// `cells`: array de h strings; cada string tem w chars (1 char = 1 tile).
// Marcadores de spawn ('S' e letras de inimigo) são visuais; as listas
// pcSpawn/enemySpawn é que valem. `fogR` = raio de visão (Chebyshev).
// ============================================================
const TACTICAL_MAPS = {

  // 1) PRAIA — praia_zumbis: enseada de areia preta, ressaca, o Próspero encalhado.
  'praia': {
    w: 12, h: 9, fogR: 6,
    bg: { seed: 71, prompt: 'top-down overhead tabletop RPG battle map, black volcanic sand beach cove, wrecked sailing ship hull half-buried in sand, scattered wooden debris and crates, crashing grey surf meeting dark stormy sea, jagged rocky cliffs, fantasy dnd battlemap, gloomy overcast, no grid lines, no text, no labels' },
    cells: [
      '~~~~~~~~~~~~',
      '~~~~PP~~~~~~',
      '≈≈≈≈PP≈≈≈≈≈≈',
      '....z....z..',
      '...d........',
      '.S........d.',
      '.S....d.....',
      'SS..........',
      '############',
    ],
    legend: {
      '~': { type:'sea',       impassable:true  },
      '≈': { type:'surf',      impassable:false, difficult:true },
      '.': { type:'sand',      impassable:false },
      'd': { type:'debris',    impassable:false, cover:true },
      'P': { type:'ship_hull', impassable:true  },
      'z': { type:'sand',      impassable:false },
      'S': { type:'sand',      impassable:false },
      '#': { type:'cliff',     impassable:true  },
    },
    pcSpawn: [ [1,5],[1,6],[0,7],[1,7] ],
    enemySpawn: { 'z1':[4,3], 'z2':[9,3] },
  },

  // 2) CAVERNAS — polvo_fungo: boca da caverna, fungos brilhantes, poça escura.
  'cavernas': {
    w: 12, h: 9, fogR: 3,
    bg: { seed: 24, prompt: 'top-down overhead tabletop RPG battle map, dark sea cave interior, rocky cavern floor, glowing bioluminescent fungus clusters in teal and green, still black water pool in the center, wet stone, fantasy dnd battlemap, moody dim light, no grid lines, no text, no labels' },
    cells: [
      '############',
      '#FF..~~~~.F#',
      '#F...~~~~..#',
      '#...~~oo~..#',
      'S....~~~~..#',
      'S..........#',
      'S....~~~..F#',
      '#FF.F....FF#',
      '############',
    ],
    legend: {
      '#': { type:'rock_wall',  impassable:true  },
      '.': { type:'cave_floor', impassable:false },
      '~': { type:'pool',       impassable:false, difficult:true },
      'F': { type:'fungus',     impassable:false, cover:true },
      'o': { type:'pool',       impassable:false },
      'S': { type:'cave_floor', impassable:false },
    },
    pcSpawn: [ [0,4],[0,5],[0,6] ],
    enemySpawn: { 'po':[5,3] },
  },

  // 3) SHARRUTH — fume_drakes: câmara da tumba cortada por fendas de lava; drakes voam.
  'sharruth': {
    w: 12, h: 9, fogR: 6,
    bg: { seed: 53, prompt: 'top-down overhead tabletop RPG battle map, ancient ruined tomb chamber, cracked dark stone floor, glowing molten lava fissures cutting across, mounds of grey ash, scorched obsidian, fantasy dnd battlemap, ominous red glow, no grid lines, no text, no labels' },
    cells: [
      '############',
      '#..LL....f.#',
      '#...LL.....#',
      '#a...LLL..a#',
      '#.....LL...#',
      '#..a....f..#',
      '#....LLL..a#',
      'SS.........#',
      '############',
    ],
    legend: {
      '#': { type:'rock_wall',    impassable:true  },
      '.': { type:'tomb_floor',   impassable:false },
      'L': { type:'lava_fissure', impassable:true,  hazard:true },
      'a': { type:'ash_mound',    impassable:false, cover:true },
      'f': { type:'tomb_floor',   impassable:false },
      'S': { type:'tomb_floor',   impassable:false },
    },
    pcSpawn: [ [0,7],[1,7] ],
    enemySpawn: { 'f1':[9,1], 'f2':[8,5] },
  },

  // 4) NAUFRAGIO — naufragio_undead: porão do navio amaldiçoado, fenda do porão, sigilo de Orcus.
  'naufragio': {
    w: 12, h: 9, fogR: 3,
    bg: { seed: 38, prompt: 'top-down overhead tabletop RPG battle map, interior of a cursed shipwreck cargo hold, broken weathered wooden deck planks, dark gaping holes into the bilge, scattered debris and barrels, a glowing red demonic Orcus sigil burned into the floor, fantasy dnd battlemap, eerie dark, no grid lines, no text, no labels' },
    cells: [
      '############',
      '#DDDDDDDDDO#',
      '#DD.g.....D#',
      '#D..CC...DD#',
      '#D.zCCz..DD#',
      '#DDx...x.DD#',
      '#DDDDDDDDDD#',
      'SS.......DD#',
      '############',
    ],
    legend: {
      '#': { type:'hull_wall',  impassable:true  },
      '.': { type:'ship_deck',  impassable:false },
      'D': { type:'ship_deck',  impassable:false },
      'C': { type:'hold_gap',   impassable:true,  hazard:true },
      'x': { type:'debris',     impassable:false, cover:true },
      'O': { type:'orcus_sigil',impassable:true,  hazard:true },
      'g': { type:'ship_deck',  impassable:false },
      'z': { type:'ship_deck',  impassable:false },
      'S': { type:'ship_deck',  impassable:false },
    },
    pcSpawn: [ [0,7],[1,7] ],
    enemySpawn: { 'g1':[4,2], 'zu1':[3,4], 'zu2':[6,4] },
  },

  // 5) OBSERVATORIO — final_dragon: cúpula rachada aberta ao céu; a dragã coila no centro.
  'observatorio': {
    w: 13, h: 10, fogR: 6,
    bg: { seed: 96, prompt: 'top-down overhead tabletop RPG battle map, ruined circular domed observatory open to the night sky, cracked marble stone floor, scattered rubble and broken columns, a raised stone altar in the center, starlight, fantasy dnd battlemap, cold blue moonlight, no grid lines, no text, no labels' },
    cells: [
      '####,,,,,####',
      '##.r.....r.##',
      '#...........#',
      '#..r.....r..#',
      ',....DDDD...,',
      ',....DDDD...,',
      '#..r..A..r..#',
      '#...........#',
      '#S.r.....r.S#',
      '#####SSS#####',
    ],
    legend: {
      '#': { type:'stone_wall', impassable:true  },
      ',': { type:'sky_edge',   impassable:true,  hazard:true },
      '.': { type:'dome_floor', impassable:false },
      'r': { type:'rubble',     impassable:false, cover:true },
      'A': { type:'altar',      impassable:true,  cover:true },
      'D': { type:'dome_floor', impassable:false },
      'S': { type:'dome_floor', impassable:false },
    },
    pcSpawn: [ [1,8],[11,8],[5,9],[6,9],[7,9] ],
    enemySpawn: { 'dragon':[5,4] },
  },

};

if (typeof module !== 'undefined' && module.exports) module.exports = { TACTICAL_MAPS };
