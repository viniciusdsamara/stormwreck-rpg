// build-standalone.js — gera stormwreck-standalone.html (arquivo único) a partir
// de stormwreck.html, embutindo rules.js, campaign.js e game.js inline.
//
// Rode com o Node:  node build-standalone.js
//
// IMPORTANTE: usa FUNÇÃO de substituição (() => conteúdo). Se passar o conteúdo
// como string de replace, o `String.replace` interpreta `$$` como um `$` literal —
// e o game.js usa `$$` (atalho de querySelectorAll), o que viraria `$` e quebraria
// o arquivo com "Identifier '$' has already been declared".
const fs = require('fs');

let html = fs.readFileSync('stormwreck.html', 'utf8');
const inline = f => () => '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</' + 'script>';

html = html
  .replace('<script src="rules.js"></' + 'script>',    inline('rules.js'))
  .replace('<script src="campaign.js"></' + 'script>', inline('campaign.js'))
  .replace('<script src="game.js"></' + 'script>',     inline('game.js'));

fs.writeFileSync('stormwreck-standalone.html', html);

// validação estrutural rápida
const must = ['<!DOCTYPE html>', 'const RULES', 'const CAMPAIGN', 'const $$ =', 'initAuth();'];
const missing = must.filter(s => !html.includes(s));
const balanced = (html.match(/<script/g) || []).length === (html.match(/<\/script>/g) || []).length;
if (missing.length || !balanced) {
  console.error('FALHA na geração:', missing.length ? 'faltam ' + missing.join(', ') : 'tags <script> desbalanceadas');
  process.exit(1);
}
console.log('stormwreck-standalone.html gerado (' + html.length + ' bytes). OK.');
