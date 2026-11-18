# Battalion: Vengeance · versão moderna

Abra **Jogar-Moderno.cmd** na pasta Jogo. O jogo roda em [127.0.0.1:8768](http://127.0.0.1:8768) com Node.js. O atalho usa o build em `dist/`. A primeira compilação pode precisar de acesso à internet para instalar as dependências. O jogo compilado funciona offline. Para abrir a edição Flash recuperada, use **Jogar.cmd**.

## Como jogar

Passe pelo briefing ou pule para a batalha. Clique numa casa ocupada por um aliado. O preenchimento verde mostra as casas disponíveis para movimento. A linha clara acompanha a rota até a casa sob o cursor. O contorno pontilhado indica alcance e o círculo laranja marca um alvo. Clique numa casa vazia dentro do alcance de movimento ou num alvo marcado. O painel lateral prevê o dano quando o cursor passa sobre um alvo.

Use **Encerrar turno** para a IA jogar. A dificuldade **Extrema** examina uma sequência de ações e uma resposta forte do adversário. A busca avalia um conjunto limitado de alternativas e está sujeita às mesmas regras de movimento e combate.

## Editor de mapas

Abra **Editor de mapas**. Crie uma grade entre 4 e 16 casas por lado ou copie o capítulo. Escolha uma ferramenta para pintar terreno, colocar unidades ou apagá-las. Coloque pelo menos uma unidade de cada lado e selecione **Testar contra a IA**. O objetivo disponível é eliminar as unidades adversárias.

O rascunho é salvo no perfil do navegador. Use **Exportar JSON** para levar o mapa a outro perfil ou computador. A campanha e as partidas personalizadas começam do início após recarregar a página.

## Código

Execute `npm ci` em `moderno/` para preparar as dependências, depois `npm run dev` para editar. Use `npm run build` para atualizar o build que o atalho carrega. Feche a janela do servidor anterior se estiver usando a mesma porta.

- `src/data.ts` importa o primeiro mapa, seus diálogos de abertura e os atributos das unidades dos XMLs em `../mods/`. Converte o material para o formato que o editor e as batalhas usam.
- `src/battle.ts` implementa movimento, combate, turnos e decisões da IA.
- `src/board.ts` desenha o tabuleiro, as unidades e os indicadores no Phaser. A interface em HTML/CSS fica em `index.html` e `src/style.css`.

O capítulo 1 é a primeira missão portada. O visual foi redesenhado e as regras centrais foram reimplementadas a partir dos dados e rotinas recuperados. A sequência inteira de eventos do Flash, a campanha restante e *Battalion: Ghosts* ainda precisam ser portados.
