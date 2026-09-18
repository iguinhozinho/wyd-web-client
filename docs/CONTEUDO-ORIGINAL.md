# Pipeline de criaturas originais

O catálogo é gerado a partir de `Mesh/BoneAni4.txt`, que informa o tipo de skin, a quantidade de movimentos, a quantidade de partes e o prefixo dos arquivos de cada criatura.

```powershell
npm run import:creatures
```

O comando procura automaticamente:

- esqueleto `<prefixo>.bon`;
- partes `<prefixo><parte><variante>.msh`;
- texturas WYS correspondentes;
- animações `<prefixo>01<movimento>.ani`.

Os resultados ficam em `public/assets/creatures/<prefixo>/` e o índice geral em `public/assets/creatures/manifest.json`.

O manifesto registra `parts` e `expectedParts` separadamente. Alguns tipos antigos declaram oito slots, mas não possuem uma malha base `01` para todos eles; esses casos devem ser tratados como personagens equipáveis ou variantes, sem inventar partes ausentes.

As animações originais também são preservadas como `motion01`, `motion02` etc. Os aliases `idle`, `walk`, `run`, `attack` e `death` são uma aproximação inicial e precisam ser confirmados por tipo durante a integração no jogo.

## Uso no protótipo

O cliente separa os monstros em quatro grupos de teste: Armia, Azran, Erion e demais setores de Kersef. A escolha usa o setor indicado pelo nome `FieldXXXX`; portanto, trocar o mapa pelo seletor também troca as criaturas carregadas.

Somente criaturas cuja quantidade de partes exportadas coincide com `expectedParts` são usadas nesses grupos. JSON e texturas já solicitados ficam no cache da sessão, evitando baixar e interpretar novamente o mesmo asset ao retornar a uma região.
