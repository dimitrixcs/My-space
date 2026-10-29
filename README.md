# My espace — Orbital Edition

> **Atenção:** não abra `index.html` com duplo clique para executar o aplicativo. O HTML exibe instruções porque módulos e dependências npm exigem um servidor local. No Windows, use `INICIAR_MY_ESPACE_WINDOWS.bat`; no macOS/Linux, use `INICIAR_MY_ESPACE_MAC_LINUX.sh`. Para usar sem instalar Node.js no computador, publique no GitHub Pages.

My espace é um espaço pessoal de produtividade com visual futurista, tarefas, planejamento, arquivos, notas e personalização. A interface adapta-se a Android, macOS, Linux e Windows 10/11 e pode ser publicada no GitHub Pages.

## Sincronização entre dispositivos

Com a mesma conta conectada em todos os aparelhos, o aplicativo sincroniza automaticamente:

- **Tarefas:** título, conclusão, prioridade e prazo.
- **Notas:** título e conteúdo do bloco de notas.
- **Preferências:** tema, conforto visual, modo compacto, cor de destaque e nome de exibição.
- **Arquivos:** metadados no espaço de trabalho e conteúdo binário no Supabase Storage privado.

As alterações são salvas primeiro no dispositivo e depois enviadas à nuvem. O app tenta receber atualizações de outros aparelhos em tempo real e também verifica a nuvem quando a janela volta a ficar ativa. Se a internet cair, os dados locais continuam disponíveis e uma nova tentativa é feita quando a conexão voltar.

**Importante:** a sincronização exige configurar seu próprio projeto Supabase uma vez. O repositório não contém credenciais suas e não tem um servidor de nuvem compartilhado pré-configurado. Sem essas etapas, o app continua em modo local e não afirma que os dados estão sincronizados.

### 1. Criar e preparar o Supabase

1. Crie um projeto em [Supabase](https://supabase.com/).
2. No projeto, abra **SQL Editor → New query**.
3. Abra `supabase/schema.sql` deste repositório, copie todo o conteúdo para o SQL Editor e execute. Isso cria a tabela de dados sincronizados, as regras RLS e o bucket privado `user-files`. O arquivo pode ser executado novamente com segurança.
4. Em **Project Settings → API** (ou **Data API / API Keys**, conforme a versão do painel), copie a **Project URL** e a chave publicável (publishable/anon).
5. Em **Authentication → URL Configuration**, permita os endereços em que o app será usado. Para desenvolvimento, inclua `http://localhost:5173`. Depois de publicar, inclua a URL exata do GitHub Pages, por exemplo `https://SEU-USUARIO.github.io/my-espace/`.
6. Em **Authentication → Providers → Email**, configure a confirmação de e-mail conforme preferir.

O SQL usa Row Level Security para que cada conta leia e altere somente seu próprio registro, e políticas de Storage que limitam os arquivos à pasta identificada pelo ID da mesma conta.

### 2. Configurar no computador

**Windows 10/11:** depois de clonar ou extrair o projeto, dê dois cliques em `INICIAR_MY_ESPACE_WINDOWS.bat`.

**macOS/Linux:** na pasta do projeto, execute `chmod +x INICIAR_MY_ESPACE_MAC_LINUX.sh` uma vez e depois `./INICIAR_MY_ESPACE_MAC_LINUX.sh`.

Os scripts verificam se Node.js/npm estão instalados, instalam as dependências na primeira execução e iniciam o servidor local. Mantenha a janela do terminal aberta enquanto usa o aplicativo. Para configuração manual via Git:

Copie `.env.example` para `.env.local` e preencha com os valores do seu projeto:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICAVEL
```

Em seguida, execute:

```bash
npm run dev
```

Abra o endereço local que o Vite mostrar. Para validar a versão de produção:

```bash
npm run build
npm run preview
```

**Nunca coloque uma chave `service_role`, segredo administrativo, senha ou token privado em arquivos `VITE_*` ou no navegador.** Use somente a chave publicável/anon; as regras de acesso são aplicadas no Supabase. O arquivo `.env.local` está ignorado pelo Git.

### 3. Configurar a publicação no GitHub Pages

O workflow em `.github/workflows/deploy.yml` já compila e publica o app quando há um push para `main`.

1. Envie o repositório ao GitHub e abra **Settings → Pages**. Escolha **GitHub Actions** como origem.
2. Abra **Settings → Secrets and variables → Actions → Variables** no repositório e crie estas *variables*:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Insira a URL do projeto Supabase e a chave publicável/anon. Essas variáveis são usadas durante a compilação pelo workflow.
4. Confirme que a URL do GitHub Pages também foi adicionada à lista de URLs permitidas no Supabase.
5. Faça `git push` para `main` e espere o workflow terminar. A sincronização ficará disponível quando abrir o site publicado e entrar na sua conta.

A chave publicável/anon foi projetada para estar no cliente quando as políticas RLS e Storage estão corretamente configuradas. **Nunca use uma chave `service_role` nessas variáveis.**

### 4. Usar a sincronização

1. Entre ou cadastre uma conta no My espace.
2. Ao entrar, o app combina tarefas, notas e arquivos locais úteis com o espaço da conta, evitando duplicar tarefas iguais. Arquivos locais presentes no IndexedDB são enviados para o bucket privado, desde que respeitem o limite de 50 MiB. Se já houver dados na nuvem, as preferências e os dados da conta continuam sendo a referência principal.
3. Em cada outro dispositivo, abra o mesmo site, entre na **mesma conta** e mantenha a conexão com a internet. O app buscará os dados remotos e começará a sincronizar alterações automaticamente.
4. Veja o estado no rodapé ou em **Personalização → Sincronização entre dispositivos**. Use **Sincronizar agora** para forçar uma tentativa.
5. Se o envio de um arquivo falhar, o arquivo permanece neste dispositivo e aparece com a indicação **Só neste dispositivo**. Tente sincronizar novamente ou baixe uma cópia local.

A sincronização do espaço de trabalho é baseada na última versão salva. Evite editar exatamente o mesmo conteúdo em dois dispositivos ao mesmo tempo; para itens iguais editados simultaneamente, a última atualização recebida pode prevalecer. Mantenha backups dos arquivos importantes.

## Funcionalidades

- Visão geral e progresso das tarefas.
- Criar, concluir e excluir tarefas com prioridade e prazo.
- Calendário/planejamento baseado nos prazos das tarefas.
- Armazenamento local temporário de arquivos, envio para nuvem privada, download e exclusão.
- Bloco de notas com salvamento automático.
- Tema claro/escuro, conforto visual, interface compacta e cores de destaque.
- Exportação JSON das tarefas, notas e preferências (o conteúdo binário dos arquivos não é incluído no backup JSON).
- Cadastro, login, sessão e recuperação de senha via Supabase Auth.
- Layout responsivo e modo de conforto visual que reduz animações e transparências.
- Publicação estática no GitHub Pages.

## Execução em diferentes sistemas

- **Android:** abra o endereço publicado no navegador e use “Adicionar à tela inicial”, se disponível.
- **Windows 10/11 e macOS:** use o navegador ou clone o repositório e execute com Node.js.
- **Linux:** pode usar no navegador ou clonar com Git e executar localmente via Node.js.

Git baixa o código-fonte, mas não é um instalador nativo. Esta versão é uma aplicação web/PWA; não inclui pacotes nativos `.exe`, `.dmg`, `.deb` ou `.rpm`. Abrir o `index.html` como `file://` não inicia o servidor e por isso não carrega o app: use o script de inicialização apropriado ou o site publicado.

## Privacidade e armazenamento

- Sem login e configuração Supabase, os dados ficam no navegador atual.
- Com login e configuração completos, tarefas, notas e preferências ficam em `user_workspace`; o conteúdo dos arquivos fica num bucket privado.
- O app usa um cache local por conta para continuar disponível no próprio aparelho. Sair da conta retorna para o espaço local de visitante, sem apagar os dados guardados na nuvem.
- Apagar dados do navegador pode remover o cache local, mas não remove automaticamente a área de trabalho da nuvem.
- Arquivos com mais de 50 MiB ou que falhem no envio permanecem locais e não aparecem nos outros aparelhos.
- A exportação JSON não contém o binário dos arquivos; use o botão de download para cópias de arquivos importantes.

## Estrutura

```text
my-espace/
├── .github/workflows/deploy.yml
├── INICIAR_MY_ESPACE_WINDOWS.bat
├── INICIAR_MY_ESPACE_MAC_LINUX.sh
├── src/main.js
├── src/style.css
├── supabase/schema.sql
├── .env.example
├── index.html
├── manifest.webmanifest
├── package.json
└── README.md
```

## Solução de problemas de sincronização

- **“Nuvem não configurada”**: confira `.env.local` no desenvolvimento ou as duas Actions Variables do GitHub Pages; depois reinicie/recompile o app.
- **Login funciona, mas não sincroniza**: confirme que executou `supabase/schema.sql` no projeto correto e que URL/chave pertencem a esse projeto.
- **Não atualiza em tempo real**: confira se `user_workspace` está habilitada para a publicação `supabase_realtime`. O app também busca atualizações ao voltar para a janela.
- **Arquivo marcado como local**: confira se o bucket privado `user-files` existe, se executou as políticas do SQL e se o arquivo tem menos de 50 MiB.
- **Dados diferentes entre aparelhos**: confirme que ambos estão conectados à mesma conta e têm internet. Use “Sincronizar agora”. Na primeira entrada após atualizar, dados locais úteis são combinados com a conta; em edições simultâneas do mesmo conteúdo, a última versão salva ainda pode prevalecer.

## Identidade visual — Orbital Edition

Interface futurista cinematográfica com identidade original, superfícies em camadas, iluminação ambiental sutil, detalhes de profundidade e cores configuráveis. A navegação privilegia clareza e produtividade. O modo de conforto reduz movimento e efeitos, e o layout adapta-se a computador, tablet e celular.
