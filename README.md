# Battalion local

## Instalar a edição nativa (Windows, Linux e macOS)

Baixe a versão mais recente em **[Releases](https://github.com/TauXLord/battalion-nativo/releases/latest)**:

- **Windows:** `Battalion-Nativo.exe` — é só abrir, não precisa instalar nada.
- **Linux x64:** `Battalion-Nativo-Linux-x64.tar.gz` — extraia e siga o `LEIA-ME.txt`.
- **macOS (Apple Silicon e Intel):** `Battalion-Nativo-macOS.tar.gz` — extraia e siga o `LEIA-ME.txt`.

Cada versão nova aparece em Releases com a lista de novidades. A versão instalada aparece no rodapé do menu do jogo.

Para compartilhar a versão atual da edição JavaScript no Windows x64, envie [Battalion-Nativo.exe](Battalion-Nativo.exe). O executável já inclui o Node.js. Consulte as [instruções da edição JavaScript](nativo/README.md) para abrir uma sala LAN ou recompilar o pacote.

Os pacotes [Linux x64](Battalion-Nativo-Linux-x64.tar.gz) e [macOS para Apple Silicon e Intel](Battalion-Nativo-macOS.tar.gz) incluem o mesmo jogo e o Node.js. Extraia o pacote e siga o arquivo **LEIA-ME.txt**.

## Edição Flash

**[Battalion.exe](Battalion.exe)** abre a tela de seleção de campanhas no navegador padrão do Windows. O executável inclui Ghosts, Vengeance, o editor, o servidor local e o Ruffle. Pode ser copiado sozinho e dispensa Node.js, Java e Flash Player. Mantenha a janela Battalion aberta enquanto joga. O navegador precisa oferecer suporte a WebAssembly.

Em **Editar mapas**, escolha Ghosts ou Vengeance, abra uma cópia do capítulo 1 ou crie uma grade em branco. Pinte o terreno, coloque unidades dos dois lados e use **Jogar contra a IA**. No menu Flash, escolha **Single Player → Start Game**. É possível exportar e importar YIMF com as peças disponíveis na paleta do episódio. O editor guarda um rascunho por episódio no navegador.

A edição personalizada roda numa cópia temporária do Flash com uma missão de eliminação. A campanha padrão e seu progresso têm armazenamento separado do teste de mapas. O executável usa a porta local 8769, e os saves antigos do endereço 8765 continuam acessíveis pelo atalho **Jogar.cmd**.

Para recompilar o executável após alterações, feche a janela Battalion e execute `powershell.exe -NoProfile -File tools/empacotar.ps1`. O arquivo gerado é um executável local sem assinatura digital.

## Cenários e rede local

**Jogar-Nativo.cmd** abre a edição JavaScript com as campanhas Vengeance e Ghosts, treinamentos, mapas bônus, editor e cenários locais e LAN. Consulte o [guia da edição nativa](nativo/README.md).

Em **Cenários e rede local**, selecione **Dois jogadores no mesmo computador** para revezar nos cinco cenários de duas equipes. Escolham duas cores e usem **End Turn** para passar o mouse. O tabuleiro, o minimapa e o painel de informações ocultam os submarinos e tanques inimigos que estiverem camuflados. Detecção e combate continuam podendo revelar essas unidades.

Os cinco mapas de duas equipes têm 20 unidades cada. A arena **Cerco dos Quatro Cantos** tem 40 × 40 casas e 40 unidades, com quatro equipes de IA em modo espectador. Cada equipe começa com três máquinas de guerra, 3.000 créditos em cada uma e uma torre. Capture fábricas neutras com commandos. Cada fábrica controlada paga 150 créditos a cada máquina de guerra da equipe no início e no fim do turno dela. A mineração continua disponível.

Use **−** e **+** para ajustar o zoom e **Mapa inteiro** para alternar entre a visão geral e a posição anterior. Em **Câmera**, ative ou desative **Arrastar o mapa** e **Rolagem nas bordas**. Arrastar vem ativado e a rolagem automática vem desativada. As preferências ficam no navegador. Os controles também aparecem em tela cheia.

Para hospedar, clique em **Ativar rede local (LAN)** na janela do executável. No navegador, escolha **Cenários e rede local → Multiplayer LAN → Abrir sala multiplayer**. Envie o convite **Mesma rede** para quem estiver no mesmo Wi-Fi ou rede cabeada. Para jogar de casas diferentes pelo Radmin, conectem-se à mesma rede do Radmin e use o convite **Radmin VPN**, que começa com um endereço `26.`. O Radmin deve estar conectado antes de ativar a LAN no executável.

Cada jogador escolhe a cor da própria equipe, vota em um mapa e marca **Pronto**. Se cada um votar em um mapa, prevalece o voto do anfitrião. Mudar cor ou mapa pede uma nova confirmação de ambos. **Começar partida** só fica disponível com os dois conectados, prontos e com cores distintas. O convidado usa só o navegador e controla a segunda equipe durante seu turno. Mantenha o executável e a aba do anfitrião abertos durante a partida. Entre casas diferentes, esta versão ainda depende de uma rede como a do Radmin.

O convidado recebe a imagem por uma conexão contínua com meta de até 15 quadros por segundo. A taxa efetiva depende do anfitrião e da rede. Se a transmissão parar, o último quadro fica visível com aviso de imagem pausada. Mantenha o jogo visível no computador anfitrião para evitar pausas do navegador. Ao substituir o executável, feche a versão anterior e gere outro convite.

Os cenários ficam em `cenarios/`. O gerador em `tools/gerar-cenarios.py` usa as peças originais e escolhe variantes de água, costa e estrada conforme as casas vizinhas.

Para jogar **Battalion: Ghosts** em Flash com as mesmas correções, abra **Jogar-Ghosts.cmd**. Os dez mapas da campanha, o mapa bônus, os mapas do Bootcamp e os dados editáveis ficam em `mods-ghosts/`. Use **Aplicar-mods-Ghosts.cmd** para recompilar depois de editar.

Para jogar a versão em TypeScript com tela cheia, editor e IA extrema, abra **Jogar-Moderno.cmd**. Consulte [o guia da versão moderna](moderno/README.md).

Abra **Jogar.cmd**. O navegador abre em [127.0.0.1:8765](http://127.0.0.1:8765/). Deixe a janela do servidor aberta enquanto joga. No menu, escolha **Single Player** e **Start Game**. A opção **Go to Bootcamp** abre o treinamento do jogo.

O jogo roda com o Node.js e o Ruffle incluído em `runtime/`. A campanha e o progresso ficam locais. Use o mesmo navegador, perfil e endereço para voltar aos seus saves. O progresso antigo do Y8 pertence a outro perfil e não foi migrado.

## Modificar o jogo

| Arquivo ou pasta | O que editar |
| --- | --- |
| `mods/campanha/Mission_1.yimf` a `Mission_10.yimf` | Mapas, unidades iniciais, diálogos e eventos das missões |
| `mods/bootcamp/` | Mapas originais do treinamento |
| `mods/dados/campaign.xml` | Nomes, objetivos, configurações de equipe e medalhas |
| `mods/dados/units.xml` | Custo, vida, dano, movimento e alcance das unidades |
| `mods/dados/terrain.xml` e arquivos `*Modifiers.xml` | Terreno e modificadores |

1. Edite um arquivo no VS Code e salve em UTF-8. Os arquivos `.yimf` são XML.
2. Abra **Aplicar-mods.cmd**. O script valida o XML, usa o JPEXS portátil e monta `jogo/battalion-vengeance.swf` a partir dos dados editados e da cópia original.
3. Recarregue a página e inicie a missão novamente para carregar as mudanças no mapa. Partidas já salvas podem conter o estado anterior.

Para um primeiro teste, mude o texto `Are you ready for this, Commander Yurik?` em `Mission_1.yimf`. Ele aparece na primeira fala ao iniciar o capítulo 1.

O Java e o [JPEXS FFDec 26.4.0](https://github.com/jindrapetrik/jpexs-decompiler/releases/tag/version26.4.0) são necessários para recompilar. O JPEXS já está em `.tools/ffdec` neste computador. Em outra instalação, extraia a versão portátil nessa pasta de modo que `.tools/ffdec/ffdec.jar` exista.

Use [a versão sem mods](http://127.0.0.1:8765/?original) para comparar com o SWF preservado. Ela usa a mesma API local e um caminho de SWF próprio. Para explorar sprites, sons e ActionScript, abra uma cópia do SWF no JPEXS.

## Recuperação e limites

- O SWF de [Battalion: Vengeance, da Urban Squall](https://www.kongregate.com/en/games/urbansquall/battalion-vengeance) foi encontrado no cache do aplicativo e comparado com [o arquivo servido pelo Y8](https://img.y8.com/cloud/y8-flash-game/contents/item_versions/flash_games/13942/original/battalion_vengeance.swf?1521338267). SHA-256 do arquivo preservado em `original/` é `690c900083c596f422bbf4cb7c4950907481c5deeaf52674c49f3f50271a211e`.
- O Flash esperava a API do Kongregate ao iniciar. A página passa o parâmetro `api_path` para carregar [a edição local da API](https://www.kongregate.com/flash/API_AS3_Local.swf) de `runtime/`. O navegador roda o jogo com [Ruffle 0.7.1](https://ruffle.rs/downloads). O servidor escuta somente no próprio computador, e a página bloqueia conexões externas do jogo.
- Os dados de mods foram extraídos do SWF. No capítulo 9, um travessão estava codificado em Windows-1252 dentro de um XML declarado UTF-8. Ele foi convertido para UTF-8 na cópia editável.
- O foco é a campanha offline. **Multiplayer** e o botão **Level Editor** do menu original dependiam do serviço externo do Kongregate e não foram restaurados. A edição local está disponível nos arquivos acima. Alguns textos do jogo podem quebrar linha de forma diferente no Ruffle.

## Correções da edição Flash

**Jogar.cmd** abre o Flash com a escala corrigida e mantém a proporção do jogo também em tela cheia. A opção `?original` continua abrindo a cópia preservada do SWF para comparação.

- As áreas de clique dos botões de menu e dos controles do tabuleiro usam a área retangular de cada controle. O cursor desenhado pelo jogo não recebe cliques, e a campanha usa uma única instância desse cursor.
- Os títulos cabem nos botões e painéis. Cada painel guarda o seu próprio título. As dicas de tela são limitadas às bordas do palco.
- Foi removida a chamada de telemetria do MochiBot no início do jogo. A API local necessária para carregar a campanha continua sendo usada.

**Aplicar-mods.cmd** reaplica as classes em `correcoes/` ao gerar o SWF modificado. As correções preservam os recursos gráficos, fontes e sons embutidos no Flash.

## Origem do Ghosts

A Urban Squall publicou [Battalion: Ghosts no Kongregate](https://www.kongregate.com/en/games/urbansquall/battalion-ghosts). O endereço do SWF do Y8 retornou HTTP 502. A cópia preservada foi obtida da [página do jogo no SpilleOnline](https://spilleonline.no/battalion-ghosts/). SHA-256 de `original/battalion-ghosts.swf` é `1d9ca460d6b6ab06e71bcd0ad0fd3e85950630dfe9e64538e6ae1936f5d1bfbe`.

O XML da campanha foi convertido para UTF-8 a partir de Windows-1252. Ghosts também deixa de consultar o serviço antigo que verificava se Vengeance já tinha sido lançado. [Ghosts sem correções](http://127.0.0.1:8765/?game=ghosts&original) carrega o SWF preservado com a API local. Ghosts e Vengeance têm caminhos de SWF próprios e seus saves ficam no navegador.
