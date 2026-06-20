# CLAUDE.md — Mestre de RPG com IA (projeto existente)

> **Leia este arquivo inteiro antes de tocar em qualquer código.**
> Este projeto **já está construído e funcional**. Seu trabalho é entender,
> validar e evoluir — **nunca reconstruir do zero**.

---

## O QUE É ESTE PROJETO

App local (HTML + JS vanilla, sem build, sem framework) onde **duas pessoas no
mesmo computador** jogam uma campanha de **D&D 5e** com a **IA atuando como
Mestre (DM)**. Campanha inicial: **Dragons of Stormwreck Isle** (set oficial
introdutório do D&D 5e).

Princípio que define toda a arquitetura:

> **A história, as regras e os encontros ficam em arquivos de dados locais.
> A IA NÃO inventa a campanha — ela só narra a cena atual dentro de trilhos
> pré-definidos.** Isso permite usar um modelo barato (Claude Haiku 4.5) sem
> perder consistência, e mantém o custo em centavos por sessão.

---

## ARQUIVOS DO PROJETO (já existem nesta pasta)

```
stormwreck.html   → estrutura + CSS (3 telas: setup, criação, jogo)
rules.js          → regras D&D: raças, classes, cálculos (mod, HP, AC)
campaign.js       → A CAMPANHA em cenas + encontros (o "roteiro")
game.js           → motor: estado, dados, telas, chamada à API
```

Carregados nesta ordem dentro do HTML: `rules.js` → `campaign.js` → `game.js`.

Há também uma versão `stormwreck-standalone.html` (3 scripts embutidos inline)
que é a usada pra rodar em casa com duplo clique — abrir `file://` às vezes
bloqueia scripts externos por CORS. **Ela é GERADA a partir dos 4 arquivos
acima; regenere quando mudar algo (ver seção no fim).**

---

## DECISÕES JÁ TOMADAS (não reabrir)

| Tema | Valor |
|---|---|
| Plataforma | HTML único + JS vanilla, sem build |
| Modelo de IA | `claude-haiku-4-5` (opção: `claude-sonnet-4-6`) |
| API | Anthropic Messages API, direto do browser (`anthropic-dangerous-direct-browser-access: true`) |
| Jogadores | 2 personagens, mesmo dispositivo, turnos alternados |
| Criação | Guiada: raça → classe → atributos (4d6 drop lowest) |
| Idioma | PT-BR, termos de regra em inglês (HP, AC, save, DC) |
| Campanha | Stormwreck Isle, em cenas |
| Dados | **Rolados pelo código, NUNCA pela IA** |

---

## REGRA DE OURO (não violar)

**A IA nunca rola dados e nunca decide resultados incertos.**

Fluxo de uma ação que exige teste:

```
jogador descreve ação
  → IA pede rolagem com marcador [ROLL:tipo:ATRIBUTO:CD] e PARA
  → o CÓDIGO rola o d20 + modificadores corretos (justo)
  → o CÓDIGO mostra a carta de resultado (com CD e sucesso/falha)
  → o CÓDIGO devolve o número à IA
  → a IA narra a CONSEQUÊNCIA
```

Marcadores que o código intercepta (e remove do texto antes de exibir):

- `[ROLL:Atletismo:FOR:12]` — teste (tipo : atributo : CD; CD 0 = sem alvo)
- `[ROLL:save:DES:14]` — saving throw
- `[ROLL:ataque:DES:0]` — ataque (compara com AC do alvo)
- `[COMBAT_START:id_encontro]` — inicia combate definido em `campaign.js`
- `[SCENE_COMPLETE]` — cena cumprida; o código faz a transição

---

## COMO OS MÓDULOS SE CONECTAM

**rules.js expõe:** `RULES` (abilities, races, classes, xpTable),
`abilityMod()`, `fmtMod()`, `computeCA()`, `buildCharacter()`.
Objeto personagem: `{name, player, slot, race, cls, level, xp, prof,
abilities, maxHp, hp, ca, speed, darkvision, saves, traits, features,
spellSlots, conditions, inventory}`.

**campaign.js expõe:** `CAMPAIGN` com `title`, `premise`, `dmRules[]`,
`scenes{}` (cada cena: chapter, location, level, summary, readAloud,
objectives, npcs, combat?, possibleRolls, next, levelUp?, ending?),
`encounters{}` (cada encontro: name, enemies[{id,name,hp,ca,mod,dmg,xp,traits}],
tactics, xpTotal, negotiable?).

Fluxo de cenas (validado — preservar):
```
chegada → praia[⚔zumbis] → claustro → cavernas[⚔polvo-fungo] →
sharruth[⚔fume-drakes] → claustro_volta(→nv2) →
naufragio[⚔undead](→nv3) → observatorio[⚔dragão] → epilogo
```

**game.js faz:** estado global `STATE`; dados (`d20`, `rollExpr`,
`rollAbility`); telas (setup→criação→jogo); `buildSystemPrompt()` (monta
prompt enxuto = dmRules + cena atual + fichas; **só a cena atual entra**);
`askDM()` (envia ~12 últimas msgs); `processDMReply()` (intercepta marcadores,
rola, devolve à IA); `callClaude()` (fetch à API); salvar/carregar via
localStorage.

---

## SUA PRIMEIRA TAREFA NESTA SESSÃO

1. **Leia** os 4 arquivos (`rules.js`, `campaign.js`, `game.js`,
   `stormwreck.html`) e me confirme em 3-4 frases que entendeu a arquitetura,
   citando especificamente como funciona o ciclo de marcadores `[ROLL]`.

2. **Valide a lógica no Node** (sem tocar em nada ainda):
   - `buildCharacter` de um **Elfo Mago** (DES base 15) deve dar **HP 8,
     AC 13, DES 17, 2 spell slots**.
   - `buildCharacter` de um **Anão Guerreiro** (CON base 14) deve dar
     **HP 13, AC 16, CON 16**.
   - Toda cena com `next` aponta para cena existente; todo `combat` aponta
     para encontro existente.
   - 10000 rolagens de d20 dão distribuição ~uniforme.
   Me mostre os resultados.

3. **Pare e espere.** Só depois disso eu te passo o que quero mudar.

Não refatore, não "melhore" e não reescreva nada antes do passo 3. Se algo
parecer melhorável, **anote e me pergunte** em vez de mudar.

---

## COMO REGERAR O STANDALONE (quando eu pedir)

Crie `stormwreck-standalone.html` a partir de `stormwreck.html`, substituindo
as 3 tags `<script src="...">` pelos conteúdos inline de `rules.js`,
`campaign.js` e `game.js`, nesta ordem. Valide depois: DOCTYPE presente,
`</html>` no fim, número de `<script>` igual a `</script>`, e que
`const RULES`, `const CAMPAIGN` e `initSetup();` aparecem no arquivo.

---

## TESTES SÃO NO NODE; A API É NO BROWSER

Você (Claude Code) testa toda a **lógica** no Node — personagem, dados, fluxo
de cenas. Mas a **chamada real ao Haiku** só roda no navegador com a chave do
usuário. Então o ciclo é: você ajusta e valida lógica no terminal; o usuário
abre o `stormwreck-standalone.html` no browser e testa a narração de verdade.

---

## ROADMAP DE MELHORIAS (só quando eu pedir)

- Tracker de iniciativa visual em combate.
- Prompt caching da Anthropic no system prompt (corta ~90% do input repetido).
- Migrar para **Lost Mine of Phandelver**: escrever novo `campaign.js` no mesmo
  formato — a engine não muda.
- Modo 1 personagem e modo 3+ personagens.
- Inventário e magias clicáveis na ficha.

---

## ANTES DE COMEÇAR (recomendação ao usuário)

Rode uma vez no terminal, pra ter um ponto de retorno seguro:
```bash
git init && git add -A && git commit -m "versão inicial funcional do chat"
```
Assim, se um ajuste quebrar algo, dá pra voltar com um comando.
