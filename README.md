# Tormenta de Stormwreck — Mestre de RPG com IA

App local (HTML + JavaScript puro, **sem build, sem framework**) onde **duas
pessoas no mesmo computador** jogam uma campanha de **D&D 5e** com a **IA atuando
como Mestre (DM)**. Campanha inicial: *Dragons of Stormwreck Isle*.

> A história, as regras e os encontros ficam em arquivos de dados locais.
> A IA **não inventa** a campanha — ela narra a cena atual dentro de trilhos
> pré-definidos. Isso mantém a consistência mesmo usando um modelo barato e
> deixa o custo em centavos por sessão.

## Como jogar

1. Abra **`stormwreck-standalone.html`** (basta dar dois cliques — é um arquivo
   único, funciona offline).
2. Cole sua **chave da API da Anthropic** (`console.anthropic.com` → API Keys).
   Ela fica salva só no seu navegador, nunca sai do seu computador.
3. Crie dois aventureiros e comece a aventura.

> O modo recomendado é o **Haiku 4.5** (rápido e barato). A chave e o save ficam
> no `localStorage` do navegador.

## Arquitetura

| Arquivo | Papel |
|---|---|
| `stormwreck.html` | Estrutura + CSS (3 telas: setup, criação, jogo) |
| `rules.js` | Regras de D&D 5e — raças/sub-raças, classes, perícias, armaduras/armas, cálculos (fiel ao Livro do Jogador) |
| `campaign.js` | A campanha em cenas + encontros (o "roteiro") |
| `game.js` | Motor: estado, dados, telas, chamada à API |
| `stormwreck-standalone.html` | Versão de arquivo único (os 3 scripts embutidos) — **gerada** a partir dos arquivos acima |

Carregamento no HTML: `rules.js` → `campaign.js` → `game.js`.

### Regra de ouro

**A IA nunca rola dados e nunca decide resultados incertos.** Quando uma ação
exige teste, a IA emite um marcador (`[ROLL:tipo:ATRIBUTO:CD]`) e para; o
**código** rola o d20 com os modificadores corretos, mostra o resultado e devolve
o número para a IA narrar a consequência.

## Testes

A lógica (criação de personagem, dados, fluxo de cenas) é validada em Node:

```bash
node validate.js
```

## Status

Em evolução para **fidelidade mecânica total ao Livro do Jogador** (sub-raças,
CA real, perícias, features de classe e combate). Veja o progresso por fases.

---

*Conteúdo de regras de D&D usado apenas como referência de desenvolvimento; este
repositório não redistribui o texto do Livro do Jogador.*
