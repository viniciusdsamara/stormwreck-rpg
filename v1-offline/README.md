# Tormenta de Stormwreck — V1 (offline / single-file)

**Versão congelada.** Não editar. Esta pasta guarda a V1 estável e jogável da campanha
"Dragons of Stormwreck Isle" como um único arquivo HTML autossuficiente.

- `stormwreck-v1.html` — jogo completo num arquivo só (rules + campanha + engine + UI inline).
  Basta abrir no navegador. Usa o backend Supabase (login + Edge Function `dm`) para
  autenticação e proxy da IA.

## O que a V1 já entrega
- Fidelidade mecânica ao Livro do Jogador (nv 1–3): raças/sub-raças, point-buy,
  classes, perícias, equipamento, estilos de luta, magias/truques, especialização.
- Criação guiada (com aviso do que falta) e criação dinâmica (chat com o Mestre).
- Combate com iniciativa e condições (Apêndice A).
- Mapa interativo da ilha com névoa de guerra (locais desconhecidos até revelar/alcançar).
- Fichas somente leitura com automação do Mestre (slots, recursos de classe, condições)
  e "Modo Mestre" para correção manual.
- Descanso automático em refúgios do roteiro.
- Menu de opções (salvar/carregar, modelo da IA, reiniciar, sair).

Marcada no git pela tag `v1-offline`. O desenvolvimento do multiplayer (V2) acontece
nos arquivos da raiz do projeto, sem tocar nesta pasta.
