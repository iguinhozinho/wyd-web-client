# WYD 7.59 — port web experimental

Execute `INICIAR-WEB.cmd` na pasta acima e abra http://127.0.0.1:5173. Se já houver um teste rodando nessa porta, basta abrir o endereço. O servidor escuta apenas na máquina local. Node.js 22.12+ ou 24 LTS.

Este repositório contém o port jogável local do cliente WYD 7.59. Ele usa Vite + Three.js no navegador e mantém o progresso de teste no `localStorage`.

## Começar em 2 minutos

Requisitos: Node.js 22.12+ (ou 24 LTS).

```powershell
cd web-port
npm ci
npm run dev
```

Abra <http://127.0.0.1:5173/>. O atalho `INICIAR-WEB.cmd`, na pasta pai, executa o mesmo fluxo no Windows.

Para testar a lógica sem abrir o navegador:

```powershell
npm test
```

Para testar a versão empacotada:

```powershell
npm run build
npm run preview
```

O preview fica em <http://127.0.0.1:4173/>.

## Estado atual

- Three.js 0.180.0 + Vite, dependências locais fixadas em package-lock.json.
- Importação de 121 terrenos `.trn` e 98 texturas `.wys` reais do cliente.
- Seleção de terreno, câmera orbital e zoom.
- Personagens `ch01`, `ch02` e Theodore FBX, com animação e seleção no lobby.
- Catálogo com 60 tipos de criatura exportados; Armia, Azran, Erion e demais setores recebem grupos diferentes de monstros completos.
- Criaturas com idle, caminhada, ataque, vida, morte, respawn, seleção por proximidade e colisão básica com o cenário.
- 121 terrenos e 798 modelos de cenário exportados dos dados locais.
- Banco importado com 2.523 itens originais e inventário inicial baseado nos identificadores oficiais. O catálogo é carregado em segundo plano para não bloquear o lobby nem o mundo 3D.
- XP, nível, ouro e melhoria de arma, salvos no localStorage. Classes são apenas seleção visual/nome nesta fase.
- Layout adaptável e mensagens de erro de carregamento.

O personagem real é um primeiro leitor experimental: usa skinning por CPU para validar formato e pose, sem equipamentos selecionáveis. O combate é uma simulação de teste e não representa as fórmulas do servidor original. A execução em segundo plano pode ser limitada pelo navegador; não há recompensa offline.

## Comandos e importação de assets

```powershell
cd web-port
npm ci
npm run dev
npm test
npm run build
npm run preview
```

`npm run import` recria os assets a partir de `../extracted/CLIENTE COM GUILDS 759`. Use esse comando apenas quando os arquivos extraídos tiverem sido atualizados; ele sobrescreve os JSONs e DDS gerados em `public/assets`.

O importador não extrai RARs. Primeiro extraia o cliente para a pasta `extracted/CLIENTE COM GUILDS 759`, preservando as pastas `Env` e `Mesh`. Os RARs originais ficam fora deste repositório.

Mais detalhes estão em [docs/EXECUCAO.md](docs/EXECUCAO.md), [docs/ARQUITETURA.md](docs/ARQUITETURA.md) e [docs/INTERFACE-E-CONTROLES.md](docs/INTERFACE-E-CONTROLES.md).

## Achados e formato

O cliente usa C++ e DirectX 9; existem projetos Visual Studio do cliente e de TMSrv, DBSrv e BISrv. Nenhum executável original foi iniciado ou servidor nativo configurado. Fontes extraídos estão em `../extracted`.

O importador segue `TMGround.h` / `TMGround.cpp::LoadTileMap`: byte de tamanho do nome, nome, duas coordenadas de setor e 4.096 registros de 12 bytes. Altura é char com sinal multiplicado por 0,1; índice da textura recebe +10. O alinhamento deixa a cor no offset 8. As oito orientações UV vêm de `TileCoordList`.

`TextureManager.cpp::LoadEnvTexture` remove o byte inicial do WYS, restaura DDS e FourCC DXT1/DXT3. A tabela de disco usa registros de 260 bytes; caminhos WYT são associados aos WYS correspondentes. DDSLoader faz a leitura no navegador; requer WebGL2 e suporte à compressão S3TC.

A renderização usa o terreno, objetos instanciados, texturas DDS, colisores básicos, personagens com skinning por CPU e HUD responsivo. A lógica de combate e progresso ainda é uma simulação local.

## Próximas etapas do port completo

1. Confirmar os aliases de animação, escala e orientação das 60 criaturas e converter os modelos mais usados para glTF.
2. Substituir colisores aproximados pela navegação e pelas regras de colisão dos mapas originais.
3. Escolher entre portar a lógica do servidor ou manter TMSrv/DBSrv com um gateway WebSocket → TCP que valide sessões e mensagens. O navegador não se conecta diretamente ao socket nativo.
4. Mover combate, inventário e progresso para servidor autoritativo; implementar contas e persistência. localStorage serve somente ao teste.
5. Só então configurar domínio, HTTPS, hospedagem e, se desejado, CDN/telemetria Cloudflare. Nada foi publicado nem foi criada conta externa.

A referência https://idlewyd.xyz/ foi consultada apenas na tela pública de login. Não foram copiados código ou assets daquele site. A lista do Wappalyzer descreve tecnologias, mas não fornece protocolo ou arquitetura interna.

## Git

O Git fica dentro desta pasta `web-port`; o nome do projeto é `wyd-web-client`. Não inclua `node_modules`, `dist` ou logs.

```powershell
git init
git add .
git commit -m "chore: registrar port web WYD 7.59"
git status
```

Use commits pequenos para alterações futuras, por exemplo `fix: corrigir exportação do javali` ou `ui: ajustar hud responsivo`.

## Validação

Testes automatizados cobrem parsing de malhas/animações, texturas WYS, progressão, equipamentos, quests e save inválido. O port é uma base funcional para evolução; ainda não substitui o servidor nativo nem implementa multiplayer autoritativo.
