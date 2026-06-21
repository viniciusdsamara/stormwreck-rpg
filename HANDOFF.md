# HANDOFF — Tormenta de Stormwreck (RPG D&D 5e com Mestre IA)

> **Para o assistente que pegar este projeto:** este arquivo é o contexto completo para
> continuar o trabalho usando só este repositório. Leia tudo antes de agir. Comunique-se
> em **português do Brasil**. Há duas versões: **V1 (single-player, estável e congelada)**
> e **V2 (multiplayer, em construção)**. **NÃO altere o V1** sem o usuário pedir.

---

## 1. Visão geral

App web (HTML + JS vanilla, **sem build**) onde a IA (Claude) é o **Mestre** de uma campanha
de D&D 5e — "Dragons of Stormwreck Isle" — mecanicamente fiel ao Livro do Jogador (nível 1–3).

- **Repositório (público):** https://github.com/viniciusdsamara/stormwreck-rpg
- **GitHub Pages** está ligado e serve o repositório.
- **Usuário/dono:** comunica em português; prefere salvar arquivos locais em `C:\` (nunca OneDrive).
  É o **admin** do sistema (conta de e-mail bootstrapada como admin no Supabase).

### URLs (GitHub Pages)
| O quê | URL |
|---|---|
| V1 single-player (padrão) | `https://viniciusdsamara.github.io/stormwreck-rpg/` |
| V1 congelada (1 arquivo)   | `…/stormwreck-rpg/v1-offline/stormwreck-v1.html` |
| **V2 Multiplayer**         | `…/stormwreck-rpg/v2-multiplayer/` |
| Painel de admin (acesso)   | `…/stormwreck-rpg/admin.html` |

---

## 2. Estrutura de arquivos

### Raiz (V1 — single-player, NÃO MEXER sem pedido)
- `stormwreck.html` — app V1 completo (login, setup, criação, **tela de jogo de 3 colunas**, modais) + todo o CSS.
- `game.js` — engine + UI do V1 (auth, criação, dados, combate, marcadores, salvar/carregar, menu, mapa, controle de acesso).
- `rules.js` — dados + lógica pura de D&D 5e (raças, classes, magias, `buildCharacter`, motor de rolagem). **Sem DOM.**
- `campaign.js` — cenas e encontros da campanha (`CAMPAIGN`).
- `build-standalone.js` — gera `stormwreck-standalone.html` (1 arquivo). **Cuidado:** usar função no `String.replace` (senão `$$`→`$` quebra o `$`).
- `validate.js` — 33 asserções de regra; rodar no Node. Esperado: **33/33**.
- `index.html` — entrada do Pages (redireciona para `stormwreck.html`); tem botão "Jogar em grupo" → `v2-multiplayer/`.
- `admin.html` — **painel do admin** (compartilhado V1+V2): autoriza/bloqueia contas, dá/tira admin.
- `REGRAS-5e.md` — referência mecânica original (não é o livro; pode ser pública).
- `.gitignore` — exclui `livro-jogador-referencia.md` (direitos autorais), `server.js`, etc.

### `v1-offline/` — V1 **congelada** (tag git `v1-offline`). Não editar.

### `v2-multiplayer/` — V2 multiplayer (EM CONSTRUÇÃO)
- `index.html` — lobby (hub/sala/pendente) **+ a tela de jogo copiada do V1** (3 colunas). Lobby e criação têm CSS próprio; a tela de jogo usa o CSS do V1 portado.
- `mp.js` — camada multiplayer: lobby, criar/entrar em sala, roster ao vivo (Realtime), início da partida, **sincronização do estado**, **engine no admin**, ações dos jogadores, render da tela de jogo no estilo V1.
- `creation-mp.js` — criação de personagem (guiada + conversa com a IA), portada do V1, devolve a ficha via callback.
- `rules.js`, `campaign.js`, `game.js` — **cópias** do V1 (reaproveitadas; `game.js` foi copiado mas a V2 usa principalmente rules/campaign + mp.js/creation-mp.js).
- `serve.js` — servidor estático de dev (porta 5180).
- `README.md` — decisões e plano das fases.

---

## 3. Backend (Supabase) — projeto `qyqvnokqkukhecnpykds` ("stormwreck-rpg", região sa-east-1)

- **Chave publishable** (anon) já está **hardcoded no código** (`SUPA_KEY`) — é pública, ok.
- **Chave da Anthropic** = **segredo do servidor** `ANTHROPIC_API_KEY` (nos secrets da Edge Function). NUNCA vai pro cliente. Não temos acesso a ela no chat; se precisar, o usuário gerencia no painel do Supabase.

### Edge Function `dm` (v6) — proxy seguro da Anthropic
- `verify_jwt: true`. Recebe `{model, max_tokens, system, messages}`, repassa para a Anthropic com a chave do servidor.
- **Controle de custo:** consulta `public.access` — só conta com `allowed=true` consegue chamar (senão 403). CORS libera `viniciusdsamara.github.io` e `localhost:5179/5180`.

### Tabelas (schema public, todas com RLS)
- `saves` — saves do V1 (`user_id`, `slot`, `data` jsonb).
- `access` — **controle de acesso**: `user_id`, `email`, `allowed` (bool), `is_admin` (bool). Trigger `handle_new_user` insere novo cadastro como **pendente** (`allowed=false`). Dono bootstrapado como `allowed=true, is_admin=true`.
- `rooms` — salas V2: `id`, `code` (convite), `host_id`, `admin_plays`, `model`, `gm_mode`, `status` (`lobby`/`playing`/`ended`), `scene_id`, `turn_owner`, `state` (jsonb com o jogo), `max_players`.
- `room_members` — membros: `room_id`, `user_id`, `display_name`, `role` (`admin`/`player`), `sheet` (jsonb da ficha), `ready`, `online`.
- `room_actions` — fila de ações dos jogadores (a engine do admin consome): `room_id`, `user_id`, `display_name`, `text`, `processed`.

### Funções SECURITY DEFINER (evitam recursão de RLS) + RPC
- `is_room_member(uuid)`, `is_room_admin(uuid)`, `am_i_allowed()`, `is_app_admin()`.
- `join_room(p_code, p_name)` — entra na sala pelo código (insere membership).
- Realtime habilitado em `rooms`, `room_members`, `room_actions`.

> Há um MCP do Supabase disponível neste ambiente (apply_migration, deploy_edge_function,
> execute_sql, get_advisors, etc.). Em outro dispositivo pode não haver — nesse caso, mudanças
> de banco/função precisam ser feitas pelo painel do Supabase ou CLI.

---

## 4. Arquitetura do MULTIPLAYER (V2) — decisões já tomadas com o usuário

- **Admin configurável por sala:** ao criar, escolhe entrar como **jogador-admin** (joga + controla) ou **Mestre puro** (só controla).
- **Cada jogador cria o próprio personagem** (guiada ou conversando com a IA) — salvo em `room_members.sheet`.
- **Tempo real:** todos assinam a sala via Realtime; o estado vive em `rooms.state`.
- **Admin é a engine:** SÓ o cliente do admin chama a IA / roda a lógica e grava `rooms.state`.
  Jogadores **enviam ações** para `room_actions` e **renderizam** a partir do estado compartilhado.
- **Convite por link:** a sala gera link `?sala=CODIGO`; quem abre entra direto após login. Sem o link/código não entra.
- **Controle de vez:** rodízio entre os personagens (índice `turnIndex`); só o jogador da vez digita.

### Importante sobre APARÊNCIA (pedido explícito do usuário)
- **Lobby e criação de personagem:** manter como estão (o usuário aprovou). NÃO trocar pela do V1.
- **Tela de jogo (o "chat"):** deve ser **idêntica à do V1** (layout de 3 colunas, cards de ficha
  com HP/mini-atributos, narrativa em balões DM/jogador, topbar, painel de rolagens). Já foi portada.

---

## 5. Status das fases (multiplayer)

- **M1 — Salas + lobby:** ✅ feito (tabelas, RLS, Realtime, criar/entrar, roster, papel configurável, convite por link).
- **M2 — Criação de personagem no lobby:** ✅ feito (guiada + conversa com IA; salva em `room_members.sheet`).
- **M3 — Estado compartilhado:** ✅ feito (admin inicia; `rooms.state`; todos entram via Realtime).
- **M4 — Engine do admin + ações em tempo real:** ✅ construído (fila `room_actions`; admin roda a IA; passa a vez).
- **Tela de jogo no estilo V1:** ✅ feito (layout 3 colunas portado do V1).
- **M5 — Painel de controles do admin durante a partida:** 🔜 **PRÓXIMA** (não começou de verdade). Ideia: botão só do admin na topbar da tela de jogo abrindo um painel com: trocar **modelo da IA**, alternar **Modo Mestre** (edição manual de fichas), **pular vez** (jogador AFK), **encerrar partida**. Tudo grava no estado/sala.
- **M6 — Polimento:** ⏳ pendente. Inclui: **espelhar os cards de rolagem para os jogadores** (hoje a engine roda no admin e só ele vê os roll-cards animados; jogadores veem o resultado já narrado no texto), reconexão, admin ausente (pausa), salvar/retomar sala, mobile, desativar cadastro público (opcional).

### O que AINDA NÃO foi testado ao vivo
Tudo do V2 foi verificado por sintaxe + render no preview, mas **o fluxo multiplayer com 2 contas
logadas (criar sala → entrar pelo link → criar personagens → iniciar → agir em tempo real) ainda
não foi testado de ponta a ponta pelo usuário.** Esse é o teste-chave pendente. A conta
`dorta333@hotmail.com` existe e está **pendente** (bloqueada) — autorizar no `admin.html` se quiser usá-la como 2º jogador.

---

## 6. Ferramentas de dev e fluxo de trabalho

- **Node portátil (nesta máquina):** `C:\Users\vinicius.samara\Downloads\node-v24.16.0-win-x64\node.exe`
  (em outro dispositivo, use o `node` disponível). Usado para:
  - `node validate.js` → deve dar **33/33**.
  - `node build-standalone.js` → regenera `stormwreck-standalone.html` (só após mexer no V1).
  - `node -c arquivo.js` → checagem de sintaxe.
- **Preview no chat (esta máquina):** servidor "rpg" serve a raiz em `localhost:5179`; abrir o V2 em
  `localhost:5179/v2-multiplayer/index.html`. Sem login real não dá pra testar o fluxo completo.
- **Git:** commitar e dar push a cada passo estável. Mensagens em português, terminando com a linha
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

### Convenções
1. Português do Brasil em tudo que é visível e nas conversas.
2. **NÃO modificar o V1** (`stormwreck.html`, `game.js`, `rules.js`, `campaign.js` da raiz e a pasta `v1-offline/`) a menos que o usuário peça explicitamente.
3. Não reproduzir o conteúdo do Livro do Jogador (direitos autorais) — usar regras como mecânica/`REGRAS-5e.md`.
4. Modelo de IA padrão: `claude-haiku-4-5` (barato); opção `claude-sonnet-4-6` (mais rico).

---

## 7. Como retomar num chat novo (em qualquer dispositivo)

1. Garanta acesso ao repositório (clonar ou abrir no Claude Code / claude.ai apontando para ele).
2. Diga ao assistente: **"Leia o HANDOFF.md e continue o multiplayer de onde paramos."**
3. O próximo passo planejado é a **Fase M5** (controles do admin na tela de jogo) — ou, se preferir,
   primeiro **testar o multiplayer ao vivo com 2 contas** e depois decidir entre M5 e o polimento da M6
   (espelhar rolagens para os jogadores).
4. Sempre rodar `node validate.js` (33/33) e regenerar o standalone se mexer no V1; commitar + push a cada passo.

> Observação: se o novo ambiente **não** tiver o MCP do Supabase, alterações de banco/Edge Function
> terão que ser feitas pelo painel do Supabase. Todo o resto (HTML/JS) é editável direto no repositório.
