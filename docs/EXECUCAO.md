# Execução e manutenção

## Desenvolvimento local

No PowerShell:

```powershell
cd "C:\caminho\para\web-port"
npm ci
npm run dev
```

Abra `http://127.0.0.1:5173/`. O Vite atualiza CSS e JavaScript automaticamente. Se a porta estiver ocupada, encerre o processo anterior ou use o endereço que já estiver ativo.

## Testes

`npm test` executa os testes Node sem iniciar o navegador. Rode-o depois de alterar parser, progressão ou exportadores.

`npm run build` cria `dist/`. `npm run preview` serve esse diretório em `http://127.0.0.1:4173/`.

## Reimportar dados do cliente

Os scripts esperam os dados extraídos em `../extracted/CLIENTE COM GUILDS 759/`:

```powershell
npm run import
```

O fluxo importa terrenos/texturas, exporta personagens, exporta Foema, exporta objetos do mundo e copia interface/sons. O resultado fica em `public/assets/`. Faça um commit separado após conferir o resultado.

## Teste manual rápido

1. Entre pelo lobby e escolha Theodore, TransKnight ou Foema.
2. Use `WASD` ou setas para andar; clique no terreno para navegação por destino.
3. Gire a câmera com o botão direito e ajuste o zoom com a roda.
4. Abra Status, Inventário, Skills e Quests pelo dock.
5. Use os slots 1–5; o slot 5 alterna a caça automática.
6. Troque de mapa e confirme que o personagem nasce dentro do terreno.
7. Recarregue a página para conferir a persistência local.

## Problemas comuns

- Tela preta: confirme suporte a WebGL2 e veja o console do navegador.
- Assets ausentes: rode `npm run import` com a pasta `extracted` no lugar correto.
- JSON antigo após exportação: use `Ctrl+F5`.
- Servidor WebSocket indisponível: o cliente continua em modo local; o servidor de teste é opcional.
