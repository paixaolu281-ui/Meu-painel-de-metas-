# 🎯 Meu Painel de Metas

Um aplicativo pessoal (PWA) para cadastrar metas financeiras e pessoais e acompanhar sua evolução com barras de progresso, valores, prazos, histórico de aportes e conquistas — tudo funcionando 100% no navegador, sem backend.

## Funcionalidades

- **Painel** com resumo geral (total das metas, total conquistado, progresso geral, metas concluídas) e uma seção de **Foco Atual** para a sua meta principal, com cálculo automático de quanto guardar por dia/semana/mês para bater o prazo.
- **Metas**: criar, editar e excluir metas com nome, valor objetivo, valor inicial, categoria, prioridade, prazo e descrição. Busca por nome e ordenação por prioridade, progresso, prazo, valor ou nome.
- **Aportes**: adicione dinheiro a qualquer meta a qualquer momento; tudo (progresso, saldo restante, resumo geral, gráficos e histórico) é recalculado automaticamente.
- **Detalhes da meta** com histórico completo de aportes, total investido, maior aporte e média por aporte.
- **Conclusão automática de metas** com animação de confete quando o valor atual atinge o objetivo — a meta é movida para "Conquistas" sem apagar nenhum dado.
- **Sistema de conquistas (badges)** desbloqueadas automaticamente conforme o uso.
- **Análises**: gráficos de evolução acumulada, distribuição por meta, progresso de cada meta e aportes por mês — desenhados em `<canvas>`, sem depender de bibliotecas externas (funcionam 100% offline).
- **Histórico geral** de todos os aportes, com filtro por meta e por categoria.
- **Configurações**: tema escuro / claro / automático, exportação e importação de backup em JSON, e opção de apagar todos os dados (com dupla confirmação).
- **PWA completo**: instalável no celular e no computador, com Service Worker para funcionamento offline.
- Tela de boas-vindas na primeira utilização, com opção de começar com metas de exemplo ou com o painel vazio.

## Estrutura de arquivos

```
/
├── index.html          → estrutura de todas as telas do app
├── manifest.json        → configuração do PWA (ícones, nome, tema)
├── sw.js                 → Service Worker (cache do app shell e modo offline)
├── css/
│   └── style.css        → design system completo (temas, componentes, layout responsivo)
├── js/
│   ├── db.js             → camada única de persistência (localStorage) e regras de negócio
│   ├── charts.js         → gráficos em canvas (sem dependências externas)
│   └── app.js            → interface: rotas, renderização das telas, formulários, modais
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

Todos os caminhos usados no projeto são **relativos**, então o app funciona tanto na raiz de um domínio quanto em um subdiretório (como é o caso do GitHub Pages em repositórios de projeto: `usuario.github.io/repositorio/`).

## Como executar localmente

Como o app usa Service Worker, é preciso servir os arquivos por HTTP (abrir o `index.html` direto com `file://` não funciona corretamente). Qualquer servidor estático simples resolve:

```bash
# Python
python3 -m http.server 8080

# Node (com o pacote "serve")
npx serve .
```

Depois, acesse `http://localhost:8080` no navegador.

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub e envie todos os arquivos deste projeto para a raiz dele (ou para a branch que preferir).
2. No repositório, vá em **Settings → Pages**.
3. Em **Source**, selecione a branch (ex: `main`) e a pasta `/ (root)`.
4. Salve e aguarde alguns instantes — o GitHub mostrará a URL pública do app (algo como `https://seu-usuario.github.io/nome-do-repositorio/`).
5. Abra essa URL: o app já estará funcionando, incluindo o modo offline.

Não é necessário nenhum passo de build — é HTML, CSS e JavaScript puros.

## Como instalar como aplicativo (PWA)

- **Android (Chrome)**: abra o app pelo link do GitHub Pages, toque no menu (⋮) e escolha **"Instalar aplicativo"** ou **"Adicionar à tela inicial"**.
- **iPhone (Safari)**: abra o app, toque no ícone de compartilhar e escolha **"Adicionar à Tela de Início"**.
- **Desktop (Chrome/Edge)**: clique no ícone de instalação que aparece na barra de endereço, ou no menu do navegador em **"Instalar Meu Painel de Metas"**.

Depois de instalado, o app abre em tela cheia (modo *standalone*) e continua funcionando mesmo sem internet, graças ao Service Worker.

## Como fazer backup dos seus dados

Todos os dados ficam salvos apenas no navegador do seu dispositivo (`localStorage`). Para não correr o risco de perdê-los ao trocar de celular, limpar o navegador ou reinstalar o app:

1. Vá em **Ajustes → Exportar meus dados**. Um arquivo `.json` com todas as suas metas, aportes e conquistas será baixado.
2. Guarde esse arquivo em um local seguro (Google Drive, e-mail para você mesmo, etc.).
3. Para restaurar, vá em **Ajustes → Importar meus dados** e selecione o arquivo `.json` salvo anteriormente. Isso substitui os dados atuais pelos dados do backup.

## Notas de implementação

- Persistência feita inteiramente com `localStorage`, através de uma camada única em `js/db.js` — nenhum outro arquivo acessa o `localStorage` diretamente.
- Os gráficos são desenhados manualmente em `<canvas>` (sem CDN) para garantir que funcionem mesmo offline e sem risco de indisponibilidade de bibliotecas externas.
- As fontes (Inter e Sora) são carregadas do Google Fonts; se o dispositivo estiver offline no primeiro acesso, o app usa as fontes padrão do sistema como alternativa — isso não afeta nenhuma funcionalidade.
- Os dados de demonstração exibidos na primeira utilização são opcionais: é possível pular direto para um painel vazio na tela de boas-vindas.
