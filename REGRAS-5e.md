# Referência de Regras — D&D 5e (níveis 1-3)

> **O que é este arquivo.** Uma referência **mecânica** de D&D 5e (números e
> regras de sistema) escrita para a engine deste projeto. Cobre o necessário
> para criar e rodar personagens de nível 1-3 na campanha *Stormwreck Isle*.
>
> Contém apenas **dados de jogo** (valores, fórmulas, efeitos) descritos de
> forma resumida e original — **não** reproduz o texto, a ambientação nem as
> descrições do livro. Para a redação completa das regras, consulte o seu
> exemplar do Livro do Jogador.

Termos de regra em inglês quando usuais (HP, AC, save, DC). Habilidades:
**FOR**, **DES**, **CON**, **INT**, **SAB**, **CAR**.

---

## 1. Criação de personagem

| Passo | Regra |
|---|---|
| Modificador de habilidade | `mod = floor((valor - 10) / 2)` |
| Atributos (rolados) | role **4d6, descarte o menor**, 6 vezes; distribua |
| Bônus de proficiência | **+2** nos níveis 1-4 |
| HP no 1º nível | **máximo do dado de vida + mod CON** |
| HP ao subir de nível | rolar o dado de vida (ou usar a média) **+ mod CON** |
| Idiomas | Comum + os da raça (+ extras de raça/classe) |

**Tabela de XP:** nível 2 = 300 · nível 3 = 900 · nível 4 = 2.700.

**CD de teste de resistência de magia (conjurador):**
`8 + bônus de proficiência + mod da habilidade de conjuração`.

**Bônus de ataque de magia:** `proficiência + mod da habilidade de conjuração`.

---

## 2. Raças e sub-raças (níveis 1-3)

ASI = aumento no valor de habilidade. Deslocamento em metros. Traços descritos
pelo **efeito mecânico** apenas.

### Anão — CON +2, desloc. 7,5 m, Médio, visão no escuro 18 m
- **Resiliência Anã:** vantagem em saves contra veneno; resistência a dano de veneno.
- **Treino com armas:** proficiência com machado de batalha, machadinha, martelo leve e martelo de guerra.
- **Conhecimento em Pedras:** dobro da proficiência em testes de História sobre trabalho em pedra.
- **Sub-raças:**
  - *Anão da Colina:* SAB +1; **+1 HP por nível**.
  - *Anão da Montanha:* FOR +2; proficiência com armaduras leves e médias.

### Elfo — DES +2, desloc. 9 m, Médio, visão no escuro 18 m
- **Sentidos Aguçados:** proficiência em Percepção.
- **Ancestral Feérico:** vantagem em saves contra enfeitiçar; imune a sono mágico.
- **Transe:** descanso longo em 4 h de meditação.
- **Sub-raças:**
  - *Alto Elfo:* INT +1; 1 truque de Mago (conjurado por INT); 1 idioma extra; treino com espada longa/curta e arcos.
  - *Elfo da Floresta:* SAB +1; deslocamento **10,5 m**; treino com espada longa/curta e arcos; esconde-se em obscurecimento natural leve.
  - *Drow:* CAR +1; visão no escuro **36 m**; **sensibilidade à luz solar** (desvantagem em ataques e Percepção visual sob sol direto); truque *globos de luz* (CAR); treino com rapieira, espada curta, besta de mão.

### Halfling — DES +2, desloc. 7,5 m, Pequeno
- **Sortudo:** ao tirar **1 natural** em ataque, teste ou save, rerole e use o novo valor.
- **Bravura:** vantagem em saves contra ficar amedrontado.
- **Agilidade Halfling:** move-se pelo espaço de criaturas maiores.
- **Sub-raças:**
  - *Pés Leves:* CAR +1; pode esconder-se atrás de criatura ≥ 1 tamanho maior.
  - *Robusto:* CON +1; vantagem em saves contra veneno e resistência a dano de veneno.

### Humano — todos +1, desloc. 9 m, Médio
- 1 idioma adicional. (Sem sub-raças nesta engine.)

### Draconato — FOR +2, CAR +1, desloc. 9 m, Médio
- **Ancestral Dracônico:** escolha um tipo de dragão (define o dano).
- **Arma de Sopro:** ação; **2d6** na área (CD 8 + CON + prof; metade no sucesso). Sobe para 3d6 no 6º nível. Recarrega em descanso.
- **Resistência a Dano:** ao tipo do ancestral.

### Gnomo — INT +2, desloc. 7,5 m, Pequeno, visão no escuro 18 m
- **Astúcia Gnômica:** vantagem em saves de INT, SAB e CAR contra magia.
- **Sub-raças:**
  - *Gnomo da Floresta:* DES +1; truque *ilusão menor* (INT); fala com bestas Pequenas.
  - *Gnomo da Rocha:* CON +1; dobro de proficiência em História sobre itens mágicos/tecnológicos; engenhocas.

### Meio-Elfo — CAR +2 **e +1 em dois atributos à escolha**, desloc. 9 m, Médio, visão no escuro 18 m
- **Ancestral Feérico:** vantagem em saves contra enfeitiçar; imune a sono mágico.
- **Versatilidade em Perícia:** proficiência em **2 perícias à escolha**.
- 1 idioma extra.

### Meio-Orc — FOR +2, CON +1, desloc. 9 m, Médio, visão no escuro 18 m
- **Ameaça:** proficiência em Intimidação.
- **Resistência Implacável:** 1×/descanso longo, ao cair a 0 HP fica com **1 HP**.
- **Ataques Selvagens:** em crítico corpo-a-corpo, role **1 dado de dano de arma extra**.

### Tiefling — INT +1, CAR +2, desloc. 9 m, Médio, visão no escuro 18 m
- **Resistência Infernal:** resistência a dano de fogo.
- **Legado Infernal:** truque *taumaturgia* (CAR).

---

## 3. Classes (níveis 1-3)

Para cada classe: dado de vida, saves proficientes, proficiência em armaduras/armas,
nº de perícias + lista, equipamento inicial (resumo), conjuração nível 1 (se houver),
nível em que escolhe a subclasse e features de 1-3.

### Bárbaro
- **Dado:** d12 · **Saves:** FOR, CON · **Armaduras:** leve, média, escudo · **Armas:** simples e marciais
- **Defesa sem armadura:** 10 + DES + CON
- **Perícias (2):** Adestrar Animais, Atletismo, Intimidação, Natureza, Percepção, Sobrevivência
- **Equipamento:** machado grande ou arma marcial; 2 machadinhas ou arma simples; pacote + 4 azagaias
- **Subclasse:** nível 3 (Berserker, Guerreiro Totêmico)
- **Features:** 1 Fúria, Defesa sem Armadura · 2 Ataque Descuidado, Sentido de Perigo · 3 Caminho Primal

### Bardo
- **Dado:** d8 · **Saves:** DES, CAR · **Armaduras:** leve · **Armas:** simples, besta de mão, espada longa, rapieira, espada curta
- **Perícias (3):** quaisquer
- **Conjuração (CAR):** 2 truques, 2 slots nv1, 4 magias conhecidas
- **Equipamento:** rapieira/espada longa/arma simples; armadura de couro, adaga
- **Subclasse:** nível 3 (Colégio do Conhecimento, da Bravura)
- **Features:** 1 Conjuração, Inspiração de Bardo (d6) · 2 Pau pra Toda Obra, Canção de Descanso · 3 Colégio, Especialização

### Bruxo
- **Dado:** d8 · **Saves:** SAB, CAR · **Armaduras:** leve · **Armas:** simples
- **Conjuração de Pacto (CAR):** 2 truques, **1 slot nv1** (recupera em descanso curto), 2 magias conhecidas
- **Perícias (2):** Arcanismo, Enganação, História, Intimidação, Investigação, Natureza, Religião
- **Equipamento:** besta leve + 20 virotes / arma simples; armadura de couro, arma simples, 2 adagas
- **Subclasse:** **nível 1** (Grande Antigo, Corruptor, Arquifada)
- **Features:** 1 Patrono, Magia de Pacto · 2 Invocações Sobrenaturais · 3 Dádiva do Pacto

### Clérigo
- **Dado:** d8 · **Saves:** SAB, CAR · **Armaduras:** leve, média, escudo · **Armas:** simples
- **Conjuração (SAB):** 3 truques, 2 slots nv1, **prepara** magias
- **Perícias (2):** História, Intuição, Medicina, Persuasão, Religião
- **Equipamento:** maça estrela/martelo de guerra; brunea/couro/cota de malha; escudo, símbolo sagrado
- **Subclasse:** **nível 1** (Vida, Luz, Guerra…)
- **Features:** 1 Conjuração, Domínio Divino · 2 Canalizar Divindade (1×/descanso) · 3 —

### Druida
- **Dado:** d8 · **Saves:** INT, SAB · **Armaduras:** leve, média, escudo (**não-metálicas**) · **Armas:** lista druídica
- **Conjuração (SAB):** 2 truques, 2 slots nv1, **prepara** magias
- **Perícias (2):** Arcanismo, Adestrar Animais, Intuição, Medicina, Natureza, Percepção, Religião, Sobrevivência
- **Equipamento:** escudo de madeira/arma simples; cimitarra/arma simples; armadura de couro, foco druídico
- **Subclasse:** nível 2 (Círculo da Terra, da Lua)
- **Features:** 1 Druídico, Conjuração · 2 Forma Selvagem, Círculo · 3 —

### Feiticeiro
- **Dado:** d6 · **Saves:** CON, CAR · **Armaduras:** nenhuma · **Armas:** adaga, dardo, funda, bordão, besta leve
- **Conjuração (CAR):** 4 truques, 2 slots nv1, 2 magias conhecidas
- **Perícias (2):** Arcanismo, Enganação, Intuição, Intimidação, Persuasão, Religião
- **Equipamento:** besta leve + 20 virotes / arma simples; bolsa de componentes ou foco; 2 adagas
- **Subclasse:** **nível 1** (Linhagem Dracônica, Magia Selvagem)
- **Features:** 1 Conjuração, Origem de Feitiçaria · 2 Fonte de Magia · 3 Metamagia

### Guerreiro
- **Dado:** d10 · **Saves:** FOR, CON · **Armaduras:** todas + escudo · **Armas:** simples e marciais
- **Perícias (2):** Acrobacia, Adestrar Animais, Atletismo, História, Intuição, Intimidação, Percepção, Sobrevivência
- **Equipamento:** cota de malha / (couro + arco longo + 20 flechas); arma marcial + escudo / 2 marciais; besta leve + 20 virotes / 2 machadinhas
- **Subclasse:** nível 3 (Campeão, Mestre de Batalha, Cavaleiro Arcano)
- **Features:** 1 Estilo de Luta, Retomar Fôlego · 2 Surto de Ação · 3 Arquétipo Marcial
- **Estilo de Luta (escolha):** Arquearia (+2 ataque à distância); Defesa (+1 CA com armadura); Duelo (+2 dano com 1 arma de 1 mão); Armas Grandes (re-rola 1-2 no dano de duas mãos); etc.
- **Retomar Fôlego:** ação bônus, cura **1d10 + nível**, 1×/descanso.

### Ladino
- **Dado:** d8 · **Saves:** DES, INT · **Armaduras:** leve · **Armas:** simples, besta de mão, espada longa, rapieira, espada curta
- **Perícias (4):** Acrobacia, Atletismo, Atuação, Enganação, Furtividade, Intimidação, Intuição, Investigação, Percepção, Persuasão, Prestidigitação
- **Especialização:** 2 perícias com **dobro** da proficiência
- **Equipamento:** rapieira/espada curta; arco curto + 20 flechas / espada curta; couro, 2 adagas, ferramentas de ladrão
- **Subclasse:** nível 3 (Ladrão, Assassino, Trapaceiro Arcano)
- **Features:** 1 Especialização, **Ataque Furtivo (1d6)**, Gíria de Ladrão · 2 Ação Ardilosa · 3 Arquétipo, **Ataque Furtivo (2d6)**
- **Ataque Furtivo:** 1×/turno, com vantagem **ou** aliado adjacente ao alvo, usando arma com acuidade ou à distância. Progressão de dano: nv1 **1d6**, nv3 **2d6**.

### Mago
- **Dado:** d6 · **Saves:** INT, SAB · **Armaduras:** nenhuma · **Armas:** adaga, dardo, funda, bordão, besta leve
- **Conjuração (INT):** 3 truques, 2 slots nv1, **prepara** do grimório (começa com **6 magias**)
- **Perícias (2):** Arcanismo, História, Intuição, Investigação, Medicina, Religião
- **Equipamento:** bordão/adaga; bolsa de componentes ou foco; grimório
- **Subclasse:** nível 2 (Escola de Evocação, Abjuração, Adivinhação…)
- **Features:** 1 Conjuração, Recuperação Arcana · 2 Tradição Arcana · 3 —

### Monge
- **Dado:** d8 · **Saves:** FOR, DES · **Armaduras:** nenhuma · **Armas:** simples, espada curta
- **Defesa sem armadura:** 10 + DES + SAB
- **Perícias (2):** Acrobacia, Atletismo, Furtividade, História, Intuição, Religião
- **Equipamento:** espada curta/arma simples; pacote + 10 dardos
- **Subclasse:** nível 3 (Mão Aberta, Sombra, Quatro Elementos)
- **Features:** 1 Defesa sem Armadura, Artes Marciais (dado de golpe **1d4**) · 2 Chi (nº de pontos = nível), Movimento sem Armadura (+3 m) · 3 Tradição, Defletir Projéteis

### Paladino
- **Dado:** d10 · **Saves:** SAB, CAR · **Armaduras:** todas + escudo · **Armas:** simples e marciais
- **Perícias (2):** Atletismo, Intuição, Intimidação, Medicina, Persuasão, Religião
- **Conjuração:** começa no **nível 2** (CAR, prepara)
- **Equipamento:** arma marcial + escudo / 2 marciais; 5 azagaias / arma simples; cota de malha, símbolo sagrado
- **Subclasse:** nível 3 (Devoção, Anciões, Vingança)
- **Features:** 1 Sentido Divino, Imposição das Mãos (reserva = nível×5 HP) · 2 Estilo de Luta, Conjuração, Golpe Divino · 3 Saúde Divina, Juramento

### Patrulheiro
- **Dado:** d10 · **Saves:** FOR, DES · **Armaduras:** leve, média, escudo · **Armas:** simples e marciais
- **Perícias (3):** Adestrar Animais, Atletismo, Furtividade, Intuição, Investigação, Natureza, Percepção, Sobrevivência
- **Conjuração:** começa no **nível 2** (SAB)
- **Equipamento:** cota de malha / couro; 2 espadas curtas / 2 armas simples; arco longo + 20 flechas
- **Subclasse:** nível 3 (Caçador, Senhor das Feras)
- **Features:** 1 Inimigo Favorito, Explorador Nato · 2 Estilo de Luta, Conjuração · 3 Arquétipo, Consciência Primeva

---

## 4. Armaduras, escudo e CA

**CA com armadura** = `base + mod DES (limitado pelo tipo) [+ 2 se escudo]`.
**Sem armadura** = `10 + DES` (ou defesa sem armadura da classe).

| Armadura | Tipo | CA |
|---|---|---|
| Acolchoada | leve | 11 + DES |
| Couro | leve | 11 + DES |
| Couro Batido | leve | 12 + DES |
| Gibão de Peles | média | 12 + DES (máx +2) |
| Camisão de Malha | média | 13 + DES (máx +2) |
| Brunea | média | 14 + DES (máx +2) |
| Peitoral | média | 14 + DES (máx +2) |
| Meia-Armadura | média | 15 + DES (máx +2) |
| Cota de Anéis | pesada | 14 |
| Cota de Malha | pesada | 16 |
| Cota de Talas | pesada | 17 |
| Placas | pesada | 18 |
| **Escudo** | — | **+2** |

Armadura pesada ignora DES. Armadura média limita o bônus de DES a +2.

---

## 5. Armas (dano e propriedades)

Dano = dado + mod (FOR corpo-a-corpo; DES à distância; **acuidade** = escolher FOR/DES).
`versátil (Xd)` = dano com as duas mãos.

| Arma | Cat. | Dano | Tipo | Propriedades |
|---|---|---|---|---|
| Adaga | simples | 1d4 | perfurante | acuidade, leve, arremesso |
| Clava | simples | 1d4 | concussão | leve |
| Bordão | simples | 1d6 | concussão | versátil (1d8) |
| Lança | simples | 1d6 | perfurante | arremesso, versátil (1d8) |
| Maça | simples | 1d6 | concussão | — |
| Machadinha | simples | 1d6 | cortante | leve, arremesso |
| Azagaia | simples | 1d6 | perfurante | arremesso |
| Martelo Leve | simples | 1d4 | concussão | leve, arremesso |
| Besta Leve | simples | 1d8 | perfurante | munição, duas mãos, recarga |
| Dardo | simples | 1d4 | perfurante | acuidade, arremesso |
| Funda | simples | 1d4 | concussão | munição |
| Espada Curta | marcial | 1d6 | perfurante | acuidade, leve |
| Espada Longa | marcial | 1d8 | cortante | versátil (1d10) |
| Rapieira | marcial | 1d8 | perfurante | acuidade |
| Cimitarra | marcial | 1d6 | cortante | acuidade, leve |
| Machado de Batalha | marcial | 1d8 | cortante | versátil (1d10) |
| Martelo de Guerra | marcial | 1d8 | concussão | versátil (1d10) |
| Maça Estrela | marcial | 1d8 | perfurante | — |
| Machado Grande | marcial | 1d12 | cortante | pesada, duas mãos |
| Espada Grande | marcial | 2d6 | cortante | pesada, duas mãos |
| Glaive | marcial | 1d10 | cortante | pesada, alcance, duas mãos |
| Arco Curto | marcial | 1d6 | perfurante | munição, duas mãos |
| Arco Longo | marcial | 1d8 | perfurante | munição, pesada, duas mãos |
| Besta de Mão | marcial | 1d6 | perfurante | munição, leve, recarga |

---

## 6. Perícias (e habilidade associada)

| Perícia | Hab. | Perícia | Hab. |
|---|---|---|---|
| Acrobacia | DES | Intuição | SAB |
| Adestrar Animais | SAB | Investigação | INT |
| Arcanismo | INT | Medicina | SAB |
| Atletismo | FOR | Natureza | INT |
| Atuação | CAR | Percepção | SAB |
| Enganação | CAR | Persuasão | CAR |
| Furtividade | DES | Prestidigitação | DES |
| História | INT | Religião | INT |
| Intimidação | CAR | Sobrevivência | SAB |

**Teste de perícia** = `d20 + mod da habilidade [+ proficiência se proficiente]`.
Vantagem/desvantagem = role 2d20 e use o maior/menor.

---

## 7. Combate (resumo)

**Iniciativa:** `d20 + mod DES`. Maior age primeiro.

**No seu turno:** 1 **movimento** (até o deslocamento) + 1 **ação** + (se a regra
permitir) 1 **ação bônus** + reações fora do turno.

**Ataque:** `d20 + mod (FOR/DES) + proficiência` vs **CA** do alvo.
- **20 natural** = acerto crítico (role os dados de dano **2×**).
- **1 natural** = erro automático.
**Saving throw:** `d20 + mod + proficiência (se proficiente)` vs CD.

**Ações comuns:** Atacar, Conjurar Magia, Disparada (dobra movimento),
Desengajar, Esquivar, Ajudar, Esconder-se, Preparar, Usar Objeto.

---

## 8. Condições (Apêndice A — efeitos resumidos)

- **Agarrado:** deslocamento 0; acaba se o agarrador for incapacitado.
- **Amedrontado:** desvantagem em testes e ataques enquanto vê a fonte; não se aproxima dela.
- **Atordoado:** incapacitado, não se move, fala hesitante; ataques contra têm vantagem; falha autom. em saves de FOR/DES.
- **Caído:** só engatinha; desvantagem em ataques; ataques corpo-a-corpo contra têm vantagem, à distância têm desvantagem.
- **Cego:** falha em testes que exijam visão; desvantagem nos próprios ataques, vantagem para quem o ataca.
- **Enfeitiçado:** não ataca quem o enfeitiçou; este tem vantagem em interações sociais com ele.
- **Envenenado:** desvantagem em ataques e testes de habilidade.
- **Impedido:** deslocamento 0; desvantagem nos próprios ataques e em saves de DES; vantagem para quem o ataca.
- **Incapacitado:** não realiza ações nem reações.
- **Inconsciente:** incapacitado, caído, larga o que segura; falha autom. em saves de FOR/DES; ataques contra têm vantagem; acerto a ≤1,5 m é crítico.
- **Invisível:** impossível de ver sem ajuda; vantagem nos ataques, desvantagem para quem o ataca.
- **Paralisado:** incapacitado, não se move/fala; falha autom. em saves de FOR/DES; ataques contra têm vantagem; acerto a ≤1,5 m é crítico.
- **Petrificado:** transformado em sólido; incapacitado, peso ×10, não envelhece; resistência a todo dano; imune a veneno e doença.
- **Surdo:** falha em testes que exijam audição.

---

*Documento de referência mecânica produzido para a engine deste projeto. Não
substitui nem reproduz o Livro do Jogador; é um resumo original de regras de
sistema (dados não protegidos por direitos autorais) para uso no desenvolvimento.*
