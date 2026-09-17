# Arquitetura do port

`src/main.js` coordena o lobby, cena Three.js, câmera, entrada, movimento, combate simulado e atualização da interface.

`src/wyd-character.js` lê JSONs exportados de `.bon`, `.msh`, `.ani` e `.wys`, aplica skinning por CPU e atualiza as poses. `src/fbx-character.js` carrega o Theodore sob demanda.

`src/wyd-world.js` cria os objetos do mapa como `InstancedMesh`. Modelos e texturas ficam em cache para reduzir o custo ao trocar de setor.

Os terrenos e objetos gerados ficam em `public/assets`. Os scripts em `scripts/` são reprodutíveis a partir dos arquivos extraídos do cliente.

O servidor em `server/` é apenas um backend de teste local. O navegador tenta WebSocket em `ws://127.0.0.1:7556` e cai para `localStorage` quando ele não está disponível. Para multiplayer real, combate, inventário e autenticação precisam migrar para um servidor autoritativo.

## Regras para alterações

- Não edite `dist/` manualmente; ele é saída de build.
- Não versionar `node_modules/` nem logs.
- Ao mudar o formato exportado, atualize o script e rode `npm test`.
- Ao alterar um asset gerado, registre no commit qual script o produziu.
