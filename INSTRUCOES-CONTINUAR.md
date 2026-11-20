# Instruções para continuar o desenvolvimento do Battalion Nativo

Você vai continuar o trabalho num remake em JavaScript do jogo Flash **Battalion** (Vengeance/Ghosts). O dono do projeto fala português; responda em português, de forma simples e direta.

## Onde está cada coisa

- **`nativo/`**: o jogo. Roda no navegador, servido por um servidor Node próprio.
  - `partida.js`: **motor determinístico** (regras, `createGame`, `order`, `snapshot`, `checkWinner`, `advanceTurn`). Tudo o que muda o jogo entra aqui, para valer igual no jogo local, no multiplayer, no replay e para a IA.
  - `campanha.js`: transporte da partida local (campanha, contra a IA, mesmo dispositivo, assistir), com salvamento automático, replay e cronômetro.
  - `tabuleiro.js`: desenho do jogo no canvas e interface da partida.
  - `pagina.js`: menus, partida avulsa, gerador de mapas, perfil, desafio diário e conquistas.
  - `servidor.js`: servidor HTTP (salas multiplayer com SSE, salvamento automático das partidas em rede, cofre do perfil, replay em rede, atualização).
  - `clima-tela.js`: desenho do clima (nuvem macia com sombra, chuva fina, respingos, ondas, redemoinho, raio).
  - Outros: `retomar.js` (retomar de arquivo), `analise.js` e `relatorio.js` (relatório e linha do tempo do replay), `conquistas.js`, `desafio.js`, `cofre.js`, `chat.js`, `procedural.js` (gerador de mapas), `audio.js`.
  - **Arquivo novo de cliente precisa entrar no mapa `files` do `servidor.js`.** O teste "todos os módulos que a página importa são servidos" acusa quando isso é esquecido.
  - `traducao-en.json`: traduções (chave em português → inglês). Todo texto novo passa por `t('...')` e ganha uma entrada aqui.
  - `versao.json`: versão da edição (hoje **1.3.0**, publicada com o clima, o raio, o redemoinho e o botão Avançar rodada).
- **`android/`** e **`tools/empacotar-android.mjs`**: APK (WebView com os arquivos no próprio APK).
- **`tools/`**: empacotadores do Windows (`empacotar-nativo.ps1`), Linux/macOS (`empacotar-unix.py`) e Android, e `publicar-versao.mjs` (publica tudo no GitHub).
- **`testes/`**: testes do Node (`node --test "testes/*.test.mjs"`). Hoje são **54, todos passando**.

## Como trabalhar

- **Git** está em `C:\Program Files\Git\cmd\git.exe` (não está no PATH). O GitHub CLI está em `C:\Program Files\GitHub CLI\gh.exe`, com login de **TauXLord**.
  - Repositório **público** (desde 19/11/2026): `TauXLord/battalion-nativo` (código e Releases).
  - Repositório de versão: `TauXLord/battalion-nativo-versao`, só com `versao.json` (número, data e link). O jogo lê esse arquivo para avisar sobre atualizações. Nada do jogo pode ir para lá.
- Escreva as mensagens de commit num arquivo e use `git commit -F arquivo`. Faça um commit por funcionalidade e envie com `git push`.
- **Codificação:** os arquivos são UTF-8 com acentos. Não use `Set-Content` nem `Get-Content -Raw` do PowerShell para reescrever arquivos (já corrompeu acentos uma vez). Edite com Node, com uma ferramenta de edição de texto ou com `-Encoding utf8`.
- **Testar no navegador:** `node nativo/servidor.js` abre em `http://127.0.0.1:8770`. Use **127.0.0.1**, não `localhost`: as funções locais (sistema, cofre, partidas salvas) só respondem em 127.0.0.1. Para não mexer nos dados reais, rode com `BATTALION_NATIVE_PORT=878x`, `BATTALION_VAULT_DIR=<pasta temp>` e `BATTALION_SAVES_DIR=<pasta temp>`.
- **Gerar o .exe:** `powershell -NoProfile -ExecutionPolicy Bypass -File tools\empacotar-nativo.ps1` gera `Battalion-Nativo.exe` na raiz. Depois copie para `Battalion-Atualizado\`. Se o jogo do usuário estiver aberto, o arquivo fica travado.
- **Publicar versão:**
  1. Aumente `versao` e `data` em `nativo/versao.json` e faça o commit.
  2. Escreva as notas da versão num `.md`.
  3. Rode `node tools/publicar-versao.mjs --notas notas.md`. Ele gera exe, Linux, macOS e APK, cria a Release e atualiza o arquivo público de versão.
  4. **Pergunte ao usuário antes de publicar.**
- **Partida de avaliação:** `Partida-Avaliacao-1.3.json` na raiz (ignorado pelo git), também em `~/.battalion-nativo/partidas-rede/a1a1a1a1a1a1a1a1a1a1a1a1.json`. Aparece em Partida avulsa → "Partidas em rede salvas". O usuário avalia no modo **Mesmo dispositivo**, com o botão **⏭ Avançar rodada**.

## Regras que o usuário pediu e que devem continuar valendo

- O **modo desenvolvedor** (prévia de dano) nunca conta progresso, conquistas, estatísticas nem desafio diário.
- Não usar arte de outros jogos (o usuário mostrou o Pirateers 2 e imagens dele). Usar só como referência e redesenhar do zero.
- O clima é desenhado **no mesmo ritmo das animações do mapa** (`idle = Math.floor(now/500)`), inclusive o giro do redemoinho.
- Nada de downloads, publicações ou ações fora do computador sem a confirmação do usuário.

## Estado atual do clima (o que acabou de ser feito)

- Ciclo no motor (`state.weather`): limpo → nuvens chegando por um canto (2 rodadas) → aviso (com a animação da troca de turno) → chuva (2 a 4 rodadas) → nuvens indo embora.
- **Na chuva:** -1 de visão na névoa, -1 de alcance da artilharia, um raio a cada 5 jogadas (casa sorteada, 100 de dano) e o redemoinho 2×2 em mar aberto (navios não entram; perdem 10 de vida se começarem o turno ao lado).
- **Tela:** uma grande nuvem macia e transparente com sombra separada no mar, chuva fina azul (pixels de 2), respingos na terra, ondas em lâmina fina de espuma (como a referência `onda-*.png` que o usuário mostrou) e redemoinho girando em passos.
- **Último pedido do usuário:** as cristas no formato da imagem de exemplo e o redemoinho maior (4 casas), sem invadir a terra e girando no ritmo do jogo. Isso foi feito, mas **ele ainda não deu retorno**. Pergunte o que achou e ajuste.

## Pendências e ideias em aberto

1. Ouvir o retorno do usuário sobre as ondas, o redemoinho, a chuva e as nuvens, e ajustar.
2. Publicar a próxima versão (**1.3.0**, com o clima, o raio, o redemoinho e o botão Avançar rodada), **só depois que o usuário aprovar**.
3. O APK de Android foi testado só no navegador; ainda falta testar num celular de verdade.
4. A IA não foi treinada para aproveitar o clima, a névoa, a colina e a floresta (ela segue as regras, mas não planeja em torno delas).
5. A lista de sugestões na nota diária do Obsidian (`C:\Users\pablo\Documents\Ultimate Obsidian\Pablo\Notações\Notas Diárias\`) pode ser atualizada se o usuário pedir.
