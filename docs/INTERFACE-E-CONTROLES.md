# Interface e controles

A interface web não é uma cópia pixel a pixel da interface do cliente 7.59. O repositório original fornece folhas visuais como `UI/main.wyt`, `UI/mainparts.wyt`, `UI/MainBox2.wyt`, `UI/nventory2.wyt`, `UI/Skill2.wyt` e `UI/PlayerInfo.wyt`. Parte desse material já é convertida pelo script `scripts/import-ui-and-sounds.mjs`, mas os painéis atuais foram reorganizados para mouse, teclado, telas menores e acessibilidade do navegador.

Os dados e recursos importados continuam separados da composição da interface. Isso permite preservar a identidade visual do WYD sem copiar a organização de outro servidor web.

## Controles ativos

| Ação | Tecla | Interface |
| --- | --- | --- |
| Mover | `WASD`, setas ou clique no chão | Mundo 3D |
| Atacar criatura próxima | `Espaço` | Cartão do alvo |
| Poção de vida e mana | `1`, `2` | Barra inferior |
| Golpe, cura e caça automática | `3`, `4`, `5` | Barra inferior |
| Personagem e atributos | `C` | Dock esquerdo |
| Inventário e equipamentos | `I` ou `V` | Dock esquerdo |
| Habilidades | `K` | Dock esquerdo |
| Missões | `Q` | Dock esquerdo |
| Ajuda de controles | `H` | Barra superior |
| Mostrar ou ocultar minimapa | `M` | Minimapa |
| Fechar painéis e alvo | `Esc` | Global |

Somente um painel principal fica aberto de cada vez. Abrir outro painel fecha o anterior, e todos possuem fechamento explícito. Os atalhos são ignorados enquanto o usuário digita em campos, seletores ou botões.

## Limite atual

Inventário, atributos, duas habilidades, missão de teste, combate, caça automática e minimapa navegável funcionam. Guilda, comércio, grupo, banco, refinação completa e árvore integral de habilidades ainda não foram portados. Botões para essas funções não devem aparecer antes de possuírem comportamento real.
