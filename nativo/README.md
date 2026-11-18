# Battalion em JavaScript

Para jogar ou compartilhar no Windows x64, use **Battalion-Nativo.exe**. O arquivo inclui o Node.js e abre o jogo no navegador padrão. Mantenha a janela do executável aberta enquanto joga. Para jogar em LAN, escolha um cenário, abra a sala e envie o convite **Mesma rede** ou **Radmin VPN** aos convidados. Cada um abre o link no navegador. Na sala, cada jogador escolhe a cor, vota no mapa e marca **Pronto**.

No Linux x64, extraia **Battalion-Nativo-Linux-x64.tar.gz** e rode `./Jogar-Battalion` na pasta extraída. No MacBook, extraia **Battalion-Nativo-macOS.tar.gz** e abra **Jogar-Battalion.command**. O pacote para Mac escolhe o runtime de Apple Silicon ou Intel. Abra `http://127.0.0.1:8770/` e mantenha o Terminal aberto enquanto joga. Confira os [requisitos do runtime](https://github.com/nodejs/node/blob/v24.22.1/BUILDING.md#platform-list).

O computador que abre a sala hospeda a partida. Convidados de Windows, Linux e macOS abrem o mesmo link no navegador. Para quatro pessoas, escolha **Dois Continentes**, **Multiplayer LAN** e **4 jogadores humanos**. Na mesma rede Wi-Fi ou cabeada, use o convite **Mesma rede**. Em redes diferentes, abra **Hospedar-Battalion-Internet.cmd** no Windows e use o convite **Internet**. Mantenha o computador e a janela do anfitrião abertos. O link HTTPS é temporário e pertence a essa execução. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

No projeto, **Jogar-Nativo.cmd** executa o código-fonte com o Node.js instalado e usa a porta 8770 por padrão. O executável do Windows procura outra porta se a 8770 já estiver ocupada por outro servidor ou por uma versão anterior. Use o endereço que o executável abrir no navegador. Para gerar outro executável depois de editar o jogo, execute `powershell.exe -NoProfile -File tools/empacotar-nativo.ps1` a partir da raiz do projeto. O empacotador verifica e incorpora o binário oficial x64 do Node.js com sua licença.

Depois de atualizar o executável Windows, rode `python tools/empacotar-unix.py` para gerar os pacotes Linux e macOS. Os pacotes reaproveitam os arquivos do jogo incluídos em **Battalion-Nativo.exe** e verificam os runtimes oficiais do Node.js pelo SHA-256 da distribuição.

Em **Cenários → Gerar mapa procedural**, o mapa sorteia as bases, os minérios, as refinarias e as travessias. Cada equipe começa com três máquinas de guerra. Marque **Ilhas sem pontes** para separar as bases pelo mar e usar transporte naval ou aéreo.

Para treinar uma IA no projeto Windows, abra **Treinar-IA-Battalion.cmd**. O padrão é treinar por oito horas, em partidas aceleradas e paralelas, com mapas padrão e procedurais. O treinador ajusta uma rede pequena que muda a prioridade das jogadas legais. A partida normal continua usando o motor do jogo para prever respostas.

```powershell
.\Treinar-IA-Battalion.cmd --horas 8
.\Treinar-IA-Battalion.cmd --horas 0 --ativar
```

O treino salva cada geração em `~/.battalion-nativo/treino.json` e retoma desse arquivo ao reabrir. Ctrl+C termina a geração em andamento e salva. A ativação compara o campeão em 16 partidas adicionais contra a IA padrão em modo rápido, com mapas e posições separados do treino, e instala o perfil para novas partidas. Recarregue a página do jogo para aplicar a mudança nos modos locais. Use `--horas 0 --validar` para consultar o resultado e `--desativar` para voltar à IA padrão.

O servidor valida o turno, a versão da partida e a jogada. Cada navegador desenha os sprites e o painel originais do Vengeance com Canvas. Zoom, câmera e seleção ficam no navegador de cada jogador. Os dados enviados ao oponente omitem as unidades camufladas e seus movimentos até a revelação.

Os cinco cenários de duas equipes aceitam LAN, partida contra a IA e dois jogadores no mesmo computador. O modo local de dois jogadores cobre o tabuleiro durante a passagem de turno e aplica a visão do jogador que recebe o controle. **Cerco dos Quatro Cantos** é uma arena de 40 × 40 com quatro IAs em modo espectador.

**Bacia dos Três Rios** tem 40 × 38 casas e três equipes. A maior parte do mapa é terrestre. Os canais têm margens **Shore** para produção naval e pontes altas que deixam os barcos passar.

**Dois Continentes** tem 40 × 38 casas, um mar central e duas pontes altas. Com **Alianças por continente**, as equipes 1 e 2 cooperam no oeste e as equipes 3 e 4 no leste. A IA prioriza ameaças aos aliados e as equipes aliadas são protegidas de ataques e capturas entre si. Quem joga sozinho controla a equipe 1 e tem a equipe 2 como aliada da IA. Na LAN ou no modo local, escolha quantas equipes terão jogadores humanos. Se as duas forças de um continente estiverem sob controle da IA, elas compartilham um único turno.

O deslocamento usa os quadros direcionais, o som por unidade e a aceleração do Flash. Um passo leva 400 ms. Num trajeto com várias casas, a primeira e a última levam 400 ms cada e as intermediárias levam 200 ms. Vengeance e Ghosts usam suas respectivas músicas originais. **Open Menu** permite ajustar **Som** e **Música** separadamente.

Selecione uma unidade e aponte para uma casa alcançável para ver a trajetória vermelha e a projeção translúcida no destino. A mesma rota é usada ao confirmar o movimento.

Os marcadores originais destacam as casas no limite do ataque, os alvos disponíveis e as casas em que o alcance da artilharia coincide com a área de movimento. O cursor mostra o ícone de ataque ao passar por um alvo válido. Para escolher de que lado o tanque vai atacar, trace a rota com o cursor até uma casa de onde ele possa atirar e então clique no inimigo. Um clique em uma casa livre só move o tanque. Se houver um alvo ao alcance, você pode clicar nele em seguida. A artilharia mostra sua área em vermelho translúcido a partir do destino previsto e só pode disparar em turnos em que ainda não se moveu.

As bandeiras originais **+**, **=** e **−** aparecem sobre os inimigos visíveis que podem atingir a unidade selecionada da posição atual deles. Ao apontar um destino, o alcance é recalculado para essa casa. O sinal compara a arma selecionada à blindagem do inimigo. Sobre o fantasma, o **!** amarelo indica um disparo possível e o vermelho indica que um dos disparos pode destruir sua unidade. A unidade fica mais escura após mover ou disparar. A vida aparece em quatro segmentos e cai visualmente no impacto. Em caso de destruição, a unidade desaparece durante a explosão.

O robô-aranha bloqueia o contra-ataque em seu próprio disparo. O Lancer atinge também a primeira casa atrás do alvo e pode acertar aliados. O ícone de reparo indica recuperação no próximo turno, cancelada se a unidade for atacada antes. As torres recuperam 5 pontos de vida por rodada. Nas missões com as regras clássicas do Flash, o reparo manual usa o saldo da equipe.

O tabuleiro aumenta a área visível dos mapas grandes conforme a largura e a altura da janela, inclusive em tela cheia. Mapas pequenos podem caber inteiros no espaço original. **Mapa inteiro** enquadra o cenário e volta à visão anterior quando acionado novamente.

Durante o turno do oponente, a câmera acompanha os deslocamentos visíveis das unidades, inclusive o avanço antes de um ataque. Se uma unidade começa o trajeto camuflada, o percurso fica oculto mesmo quando ela é revelada na chegada. Em LAN, o acompanhamento acontece só na tela de quem está assistindo à jogada.

Selecione uma unidade para ver os ícones originais de blindagem, arma, movimento e habilidades no painel inferior. Passe o cursor sobre eles para ler os detalhes. Clique numa casa livre para inspecionar o terreno. A floresta reduz em 20% o dano recebido por unidades terrestres e custa um ponto extra por casa. A colina aumenta o alcance da artilharia em uma casa. O ícone de cobertura aparece sobre unidades terrestres protegidas de ataques aéreos e de artilharia na trincheira (**Canyon**). **Esc** volta à inspeção por cursor. Selecione um **Jammer Truck** para ver o alcance de bloqueio em branco. A área é bloqueada para aeronaves da equipe adversária.

Clique numa unidade inimiga visível para consultar seu alcance potencial de movimento e ataque no tabuleiro. O clique esquerdo mantém o ataque direto quando uma unidade sua pode atingir o alvo. Nessa situação, use o botão direito sobre o inimigo para abrir a inspeção. Clique novamente no inimigo ou pressione **Esc** para limpar a seleção.

Clique duas vezes na máquina de guerra e depois no botão de construção para abrir o catálogo de unidades terrestres, aéreas e navais. Ao passar o cursor por um cartão, a unidade gira e aparece animada no retrato superior. Os ícones da ficha exibem dicas de blindagem, arma, movimento e habilidades. Escolha uma unidade e aponte para uma seta para ver a prévia na casa de saída. Ao confirmar, a unidade sai da máquina com o som original e a câmera acompanha a saída da sua equipe. O **X** volta ao catálogo. Uma saída ocupada ou incompatível com a unidade fica indisponível, e a construção naval exige que a máquina de guerra esteja em **Shore**.

**Campanha Vengeance** e **Campanha Ghosts** têm dez capítulos cada, com mapas, unidades, diálogos e arte de suas respectivas edições. A vitória abre o próximo capítulo. Medalhas e progresso ficam separados por campanha no navegador. **Treinamento** contém oito mapas em Vengeance e seis em Ghosts. Cada edição também oferece seu **Mapa bônus**.

Nas campanhas, as refinarias pagam ao seu controlador no início de cada turno e consomem a própria reserva. Com duas equipes, a refinaria avançada rende $120 por turno enquanto a reserva cobre a extração e $30 por turno em eficiência reduzida, antes de aplicar a dificuldade da IA. Cada fábrica fixa só produz na própria casa quando ela está livre e desconta o custo do saldo da equipe. As estruturas de controle habilitam a produção do tipo correspondente.

Quando uma máquina de guerra extrai minério ou uma refinaria gera renda, o valor creditado aparece por um instante sobre a casa que produziu o dinheiro.

Nas campanhas originais, um commando começa ou continua a captura automaticamente se estiver sobre a construção adversária no início do próprio turno. Nos cenários locais e LAN, o comando **Capturar** inicia a captura.

Nos cenários personalizados, cada **Oil Refinery** controlada paga $150 a cada máquina de guerra da equipe no início e no fim do turno dela. Os antigos pontos de renda marcados como **Factory** nos mapas personalizados são carregados como refinarias.

Para levar uma máquina de guerra a outra ilha, pare numa costa **Shore** com saída para o mar e, quando ela estiver disponível, clique nela duas vezes e escolha o ícone do **Leviathan**. Navegue até a costa de destino e use o mesmo ícone para desembarcar. O saldo viaja junto com a máquina.

O **Strike Commando** e o **Heavy Commando** podem usar o **Albatross** para cruzar água e terrenos difíceis. Clique duas vezes no soldado disponível para abrir as opções e use o ícone do Albatross para embarcar ou desembarcar. Nos cenários personalizados, o embarque está disponível. Campanhas com construções exigem o controle de um **Air Control**.

O submarino e o tanque furtivo recuperam a camuflagem ao concluir um deslocamento fora da detecção e sem atravessar uma zona de bloqueio. Também podem voltar a se camuflar ao encerrar um turno sem agir, fora da detecção inimiga.

**Editor de mapas** permite escolher a edição, usar um mapa base, pintar terreno e colocar unidades e construções. O rascunho fica salvo no navegador. Você pode importar ou exportar o JSON do editor e testar o mapa contra a IA ou no modo de dois jogadores. O editor da edição Flash continua disponível para arquivos YIMF.

As campanhas rodam com o motor e a IA da edição JavaScript. O serviço online original do Kongregate e a reprodução integral da IA, da moral e de todas as regras do Flash ficam fora desta versão.

## Dados

- `partida.js` define as regras executadas pelo servidor e as consultas usadas pelo tabuleiro.
- `tabuleiro.js` desenha o tabuleiro, ações e painel. `servidor.js` controla as salas e envia a visão de cada equipe.
- `dados.json` e `dados-ghosts.json` reúnem as regras e os recursos das edições. O servidor publica os mapas LAN com as posições iniciais removidas.
- Os arquivos `campanha*.json`, `bootcamp*.json` e `bonus*.json` contêm os mapas e eventos originais. `campanha.js` executa diálogos, partidas locais e resultados. `ia.js` escolhe jogadas para os adversários.

Para regenerar as duas edições, exporte a arte com o JPEXS e rode o gerador a partir da raiz do projeto.

```powershell
java -jar .tools/ffdec/ffdec.jar -onerror abort -format image:png,font:woff -export image,sound,font,symbolClass work/native-export jogo/battalion-vengeance.swf
python tools/gerar-dados-nativos.py
java -jar .tools/ffdec/ffdec.jar -onerror abort -format image:png,font:woff -export image,sound,font,symbolClass work/native-ghost-export jogo/battalion-ghosts.swf
python tools/gerar-dados-nativos.py --ghosts
```

