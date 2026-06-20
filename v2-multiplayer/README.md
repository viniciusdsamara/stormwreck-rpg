# Tormenta de Stormwreck — V2 (multiplayer)

Fork independente da V1, criado para o jogo **multiplayer em tempo real**.
**A V1 (arquivos da raiz e `v1-offline/`) não é tocada** — esta pasta evolui sozinha.

## Base herdada da V1 (ponto de partida)
- `rules.js` — dados + lógica pura de D&D 5e (raças, classes, magias, motor de rolagem). Reaproveitado quase intacto.
- `campaign.js` — cenas e encontros da campanha. Reaproveitado.
- `game.js` — engine/UI da V1. Será **refatorado** para separar engine (compartilhada)
  da camada de sala/sincronização (nova).
- `index.html` — cópia da tela da V1; vira a tela do multiplayer (lobby + jogo).

## Decisões do multiplayer (definidas com o usuário)
- **Admin configurável por sala:** ao criar a sala escolhe entrar como jogador ou Mestre puro.
- **Cada jogador cria o próprio personagem.**
- **Tempo real:** todos veem ao vivo (Supabase Realtime); o sistema controla a vez
  (rodízio fora de combate, iniciativa em combate).
- **Admin é a engine autoritativa:** só o cliente do admin chama a IA, rola dados e
  grava o estado; jogadores enviam ações e renderizam a partir do estado compartilhado.

## Plano em fases
- **M1** — Salas + lobby (tabelas `rooms`/`room_members`, RLS, Realtime, código de entrada, papel configurável).
- **M2** — Criação de personagem multiplayer (cada jogador cria o seu; "pronto").
- **M3** — Estado compartilhado em `rooms.state`; render via Realtime.
- **M4** — Engine autoritativa do admin + ações em tempo real + controle de vez/iniciativa.
- **M5** — Painel do admin (modelo da IA, Modo Mestre, pausar, avançar, expulsar).
- **M6** — Polimento (reconexão, admin ausente, salvar/retomar sala, mobile).

Backend: mesmo projeto Supabase do RPG (auth + Edge Function `dm`); adiciona tabelas de sala.
