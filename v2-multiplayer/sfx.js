// ====================================================================
//  SFX — efeitos sonoros SINTETIZADOS (Web Audio), sem nenhum arquivo.
//  TESTE de áudio: liga/desliga no botão 🔊 (preferência por dispositivo).
//  Tudo é gerado em código → custo zero, funciona offline. Em produção,
//  trocaríamos por áudio curado/gerado por IA (ver análise V3).
// ====================================================================
const SFX = (() => {
  let ctx = null;
  let enabled = (localStorage.getItem('sfxOn') === '1');
  function ac(){ if (!ctx){ try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} } return ctx; }
  function unlock(){ const c = ac(); if (c && c.state === 'suspended') { try { c.resume(); } catch(e){} } }
  function setEnabled(v){ enabled = !!v; try { localStorage.setItem('sfxOn', v ? '1' : '0'); } catch(e){} if (v) unlock(); }
  function isEnabled(){ return enabled; }

  // tom com envelope simples (ataque rápido + decaimento exponencial)
  function tone({ freq=440, type='sine', dur=0.18, vol=0.2, attack=0.005, slideTo=null, delay=0 }){
    const c = ac(); if (!c || !enabled) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  // ruído curto (impacto/dado)
  function noise({ dur=0.18, vol=0.25, delay=0, hp=300 }){
    const c = ac(); if (!c || !enabled) return;
    const t0 = c.currentTime + delay;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<n;i++) d[i] = (Math.random()*2 - 1) * (1 - i/n);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0 + dur);
  }

  return {
    setEnabled, isEnabled, unlock,
    // rolagem de dado: "chacoalhada" + acorde conforme o resultado
    dice(outcome){
      noise({ dur:0.09, vol:0.16, hp:1400 });
      if (outcome === 'crit')        { [660,990,1320].forEach((f,i)=>tone({freq:f,dur:0.22,vol:0.2,delay:0.12+i*0.1})); }
      else if (outcome === 'fumble') { tone({freq:220,type:'sawtooth',dur:0.32,vol:0.18,slideTo:70,delay:0.12}); }
      else if (outcome === 'success'){ tone({freq:520,dur:0.12,vol:0.16,delay:0.12}); tone({freq:784,dur:0.2,vol:0.18,delay:0.22}); }
      else if (outcome === 'fail')   { tone({freq:300,type:'triangle',dur:0.24,vol:0.16,slideTo:170,delay:0.12}); }
      else                           { tone({freq:440,dur:0.12,vol:0.13,delay:0.12}); }
    },
    hit()    { noise({dur:0.16,vol:0.3,hp:180}); tone({freq:150,type:'square',dur:0.12,vol:0.12}); },
    hurt()   { tone({freq:320,type:'sawtooth',dur:0.26,vol:0.2,slideTo:110}); noise({dur:0.1,vol:0.14,hp:400,delay:0.03}); },
    combat() { tone({freq:110,type:'sawtooth',dur:0.5,vol:0.2,slideTo:230}); tone({freq:233,type:'square',dur:0.3,vol:0.12,delay:0.12}); },
    levelup(){ [523,659,784,1047].forEach((f,i)=>tone({freq:f,dur:0.24,vol:0.18,delay:i*0.09})); },
    turn()   { tone({freq:880,dur:0.1,vol:0.14}); tone({freq:1175,dur:0.14,vol:0.14,delay:0.08}); },
    scene()  { tone({freq:330,type:'triangle',dur:0.45,vol:0.14,slideTo:440}); },
  };
})();

// ====================================================================
//  MUSIC — trilha procedural (pad atmosférico + melodia esparsa), sem
//  arquivos. Muda de clima conforme o jogo (exploração/combate/refúgio).
//  Em produção, trocaríamos por faixas curadas/IA (Suno/Udio) em loop.
// ====================================================================
const MUSIC = (() => {
  let ctx = null, master = null, nodes = [], melodyTimer = null, on = false, vol = 0.14, mood = 'exploration';
  const MOODS = {
    exploration: { chord:[220, 277.18, 329.63],          cutoff:900,  trem:0.10, scale:[440,493.88,587.33,659.25,739.99] }, // A maj7 calmo
    combat:      { chord:[146.83, 174.61, 220, 233.08],  cutoff:620,  trem:5.0,  scale:[293.66,349.23,415.30,440] },        // Dm + tensão pulsante
    tension:     { chord:[110, 164.81],                  cutoff:520,  trem:0.18, scale:[440,466.16,523.25] },                // quinta vazia
    haven:       { chord:[261.63, 329.63, 392.0],        cutoff:1100, trem:0.08, scale:[523.25,587.33,659.25,783.99] },      // C maj quente
  };
  function ac(){ if (!ctx){ try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} } return ctx; }
  function teardown(){
    if (melodyTimer){ clearInterval(melodyTimer); melodyTimer = null; }
    nodes.forEach(n => { try { n.stop(); } catch(e){} try { n.disconnect(); } catch(e){} });
    nodes = [];
    if (master){ try { master.disconnect(); } catch(e){} master = null; }
  }
  function build(){
    const c = ac(); if (!c) return;
    teardown();
    const M = MOODS[mood] || MOODS.exploration;
    master = c.createGain(); master.gain.value = 0.0001; master.connect(c.destination);
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = M.cutoff; filt.connect(master);
    // tremolo (movimento do pad)
    const trem = c.createGain(); trem.gain.value = 0.8; trem.connect(filt);
    const lfo = c.createOscillator(); const lfoGain = c.createGain();
    lfo.frequency.value = M.trem; lfoGain.gain.value = 0.18; lfo.connect(lfoGain); lfoGain.connect(trem.gain); lfo.start(); nodes.push(lfo);
    // acorde sustentado
    M.chord.forEach((f, i) => {
      const o = c.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = 0.16 / (i + 1); o.connect(g); g.connect(trem); o.start(); nodes.push(o);
    });
    master.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), c.currentTime + 2.0);   // fade-in
    // melodia esparsa (caixinha de música)
    melodyTimer = setInterval(() => {
      if (!on || Math.random() < 0.45) return;
      const sc = M.scale, f = sc[Math.floor(Math.random() * sc.length)];
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); const t = c.currentTime;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * 0.5, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(g); g.connect(filt); o.start(t); o.stop(t + 1.4);
    }, 2600);
  }
  return {
    isOn: () => on,
    getVolume: () => vol,
    unlock(){ const c = ac(); if (c && c.state === 'suspended'){ try { c.resume(); } catch(e){} } },
    setVolume(v){ vol = Math.max(0, Math.min(1, v)); const c = ac(); if (master && c){ master.gain.cancelScheduledValues(c.currentTime); master.gain.linearRampToValueAtTime(Math.max(0.0002, vol), c.currentTime + 0.3); } try { localStorage.setItem('musicVol', String(vol)); } catch(e){} },
    start(){ on = true; this.unlock(); build(); try { localStorage.setItem('musicOn','1'); } catch(e){} },
    stop(){ on = false; const c = ac(); if (master && c){ master.gain.cancelScheduledValues(c.currentTime); master.gain.linearRampToValueAtTime(0.0001, c.currentTime + 1.0); setTimeout(teardown, 1100); } else teardown(); try { localStorage.setItem('musicOn','0'); } catch(e){} },
    setMood(m){
      if (!MOODS[m] || m === mood) return;
      mood = m; if (!on) return;
      const c = ac();
      if (master && c){ master.gain.cancelScheduledValues(c.currentTime); master.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.7); }
      setTimeout(() => { if (on) build(); }, 760);   // recomeça no novo clima (dip curto)
    },
  };
  // volume salvo
})();
try { const v = parseFloat(localStorage.getItem('musicVol')); if (!isNaN(v)) MUSIC.setVolume(v); } catch(e){}
