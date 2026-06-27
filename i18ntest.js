// i18ntest.js — testa a camada de exibição de idioma (i18n.js) no Node via vm.
// Carrega rules.js + i18n.js num contexto isolado (stub de window/document/localStorage),
// alterna ROOM.state.gameLang e verifica term()/tr().
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const path = __dirname + '/v2-multiplayer/';

const noop = () => {};
const mem = {};
const localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = '' + v; }, removeItem: k => { delete mem[k]; } };
const sb = {
  localStorage,
  window: { addEventListener: noop, localStorage },
  document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild: noop } },
  console,
  ROOM: { state: { gameLang: 'pt' } }
};
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path + 'rules.js', 'utf8'), sb);
vm.runInContext(fs.readFileSync(path + 'i18n.js', 'utf8'), sb);

const setLang = L => { sb.ROOM.state.gameLang = L; };
const term = sb.term, tr = sb.tr, gameLang = sb.gameLang;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' — ' + e.message); } };

// --- modo en: termos de conteúdo viram inglês ---
setLang('en');
t("gameLang() lê do estado", () => assert.equal(gameLang(), 'en'));
t("term('Atordoado') -> Stunned (en)", () => assert.equal(term('Atordoado'), 'Stunned'));
t("term('Bênção') -> Bless (en)", () => assert.equal(term('Bênção'), 'Bless'));
t("term('Guerreiro') -> Fighter (en)", () => assert.equal(term('Guerreiro'), 'Fighter'));
t("term('Furtividade') -> Stealth (en)", () => assert.equal(term('Furtividade'), 'Stealth'));
t("term('Marca do Caçador') -> Hunter's Mark (en)", () => assert.equal(term('Marca do Caçador'), "Hunter's Mark"));
t("tr('Perícias') -> Skills (en)", () => assert.equal(tr('Perícias'), 'Skills'));

// --- modo pt-en: conteúdo em inglês também ---
setLang('pt-en');
t("term('Atordoado') -> Stunned (pt-en)", () => assert.equal(term('Atordoado'), 'Stunned'));
t("term('Bênção') -> Bless (pt-en)", () => assert.equal(term('Bênção'), 'Bless'));
t("tr('Perícias') permanece PT em pt-en", () => assert.equal(tr('Perícias'), 'Perícias'));

// --- modo pt: tudo permanece em português ---
setLang('pt');
t("term('Atordoado') -> original PT (pt)", () => assert.equal(term('Atordoado'), 'Atordoado'));
t("term('Bênção') -> original PT (pt)", () => assert.equal(term('Bênção'), 'Bênção'));
t("tr('Perícias') -> original PT (pt)", () => assert.equal(tr('Perícias'), 'Perícias'));

// --- termo sem tradução devolve o original (qualquer modo) ---
setLang('en');
t("termo desconhecido devolve original (en)", () => assert.equal(term('Goblin do Pântano'), 'Goblin do Pântano'));
t("term(null) devolve null", () => assert.equal(term(null), null));

// --- default: sem gameLang assume 'pt' ---
delete sb.ROOM.state.gameLang;
t("default sem gameLang -> 'pt'", () => assert.equal(gameLang(), 'pt'));
t("term em default -> original", () => assert.equal(term('Atordoado'), 'Atordoado'));

console.log(`\n${pass}/${pass + fail} testes passaram.`);
process.exit(fail ? 1 : 0);
