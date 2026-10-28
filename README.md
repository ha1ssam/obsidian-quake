# Quake para Obsidian

Jogue **Quake 1** dentro do Obsidian, numa aba ou numa janela separada.

O plugin traz o motor do jogo ([WebQuake](https://github.com/Triang3l/WebQuake), um port do Quake original para JavaScript/WebGL) adaptado para rodar dentro do Obsidian e ler os dados do jogo direto do seu cofre. Saves e configurações também ficam no cofre.

> **Os dados do jogo não vêm junto.** Você precisa do `pak0.pak` de uma cópia do Quake 1. O episódio shareware (gratuito) já basta; com o `pak1.pak` da versão completa você joga os 4 episódios.

## Instalação

1. Rode `npm install` e `npm run build` (ou baixe `main.js`, `manifest.json` e `styles.css` de uma release).
2. Copie esses três arquivos para `<seu cofre>/.obsidian/plugins/quake/`.
3. Ative **Quake** em *Configurações → Plugins da comunidade*.

## Colocando os dados do jogo

Coloque os arquivos assim no cofre (a pasta `Quake` pode ser mudada nas configurações):

```
Quake/
  id1/
    pak0.pak        ← obrigatório (shareware ou completo)
    pak1.pak        ← opcional (versão registrada)
    media/          ← opcional: trilha sonora
      quake02.ogg … quake11.ogg
  hipnotic/ rogue/ <mod>/   ← opcional: expansões e mods
```

Também funciona com os `.pak` soltos direto em `Quake/`. Se o plugin não achar o jogo, a tela inicial lista os `.pak` que existirem em outro lugar do cofre, com um botão para movê-los para o lugar certo.

Ou use o comando **Quake: Import pak files** (ou o botão na tela do jogo) para copiar os `.pak` a partir do seu computador.

Nomes de arquivos são tratados sem diferenciar maiúsculas de minúsculas (`PAK0.PAK` funciona).

Funciona o `pak0.pak` das versões 1.00, 1.01 e 1.06 do Quake, shareware ou completa.

## Como jogar

- Clique no ícone de caveira na barra lateral, ou use os comandos **Quake: Play in a new tab** / **Play in a new window**.
- Clique no jogo para capturar o mouse; `Esc` solta o mouse e abre o menu.
- O console abre com a tecla `` ` ``.
- Fechar a aba encerra o jogo e grava o `config.cfg`.

### Atalho dentro de uma nota

Um bloco de código `quake` vira um botão que abre o jogo com os argumentos que você escrever:

````markdown
```quake
+map e1m1 +skill 2
```
````

### Argumentos de linha de comando

Em *Configurações → Quake → Command line* você pode passar os mesmos argumentos do jogo original, por exemplo:

| Argumento | Efeito |
| --- | --- |
| `-hipnotic` | Mission Pack 1: Scourge of Armagon (pasta `hipnotic/`) |
| `-rogue` | Mission Pack 2: Dissolution of Eternity (pasta `rogue/`) |
| `-game nome` | Carrega um mod da pasta `nome/` |
| `+map e1m1` | Começa direto num mapa |
| `-nosound` / `-nocdaudio` | Desliga efeitos / música |

## Onde ficam os saves

Saves (`s0.sav`…), `config.cfg` e demos gravadas vão para a pasta do jogo dentro do cofre (ex.: `Quake/id1/s0.sav`), então sincronizam junto com o cofre.

## Limitações

- Só desktop (precisa de teclado e mouse).
- Multiplayer só via servidores WebSocket do WebQuake (`connect ws://ip:porta` no console).
- Todo o conteúdo da pasta do jogo é carregado na memória ao abrir (≈ 20 MB no shareware, ≈ 55 MB no completo).

## Desenvolvimento

```
npm install
npm run dev     # build com watch
npm run build   # typecheck + build de produção
```

- `src/main.ts` — plugin, comandos, configurações, bloco `quake`.
- `src/QuakeView.ts` — a aba do jogo: cria um iframe isolado, injeta o motor e faz a ponte com o cofre.
- `src/engine/platform.js` — camada que substitui as partes do WebQuake que esperavam um servidor web (leitura de `.pak`, saves, música, erros, saída).
- `vendor/webquake/` — motor WebQuake sem modificações (commit `917617f`).

## Licença

O código do plugin (`src/`, scripts de build) está sob a licença MIT (veja `LICENSE`).
O motor em `vendor/webquake/` é derivado do código-fonte do Quake da id Software e está sob a **GNU GPL v2** (veja `vendor/webquake/LICENSE.md`). Como o `main.js` distribuído inclui esse motor, o plugin compilado é distribuído sob a GPL v2.

Quake é marca registrada da id Software. Este projeto não é afiliado à id Software.
