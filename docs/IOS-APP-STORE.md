# Jakash na App Store (iOS)

Guia para publicar o app iOS do Jakash. O app é uma casca nativa (Capacitor 8) que abre o site `https://www.jakash.app` e acrescenta recursos do iPhone: login com a Apple, notificações nativas, Face ID, compartilhar arquivos, vibração leve e compra de assinatura pela App Store.

Legenda: **[VOCÊ]** = só o dono consegue fazer (conta, chave, aprovação). **[PRONTO]** = já está no código.

## 0. O que já está pronto no código

- Projeto iOS em `ios/` (Swift Package Manager, sem CocoaPods), `capacitor.config.ts`, página "Sem conexão" em `ios-shell/`.
- Login obrigatório no app; a página inicial de vendas não aparece no app (o site no navegador continua igual).
- Login com a Apple (nativo) e com o Google (abre o navegador do sistema e volta pelo link `jakash://`).
- Notificações nativas (APNs) usando os mesmos lembretes do site; a permissão é pedida em Configurações > Notificações.
- Bloqueio com Face ID (opcional, desligado), exportar CSV pela folha de compartilhar, vibração leve ao salvar um lançamento.
- Lançamento por voz: microfone em "Novo lançamento" (botão +) que preenche o formulário; quem confere e salva é a pessoa. No app usa o reconhecimento de fala da Apple (grátis, plugin `@capgo/capacitor-speech-recognition`, pt-BR).
- Compra de assinatura pela Apple (IAP) com confirmação no servidor, restaurar compras, gerenciar assinatura. **Fica desligada** até você ligar `NEXT_PUBLIC_IOS_IAP=1`.
- `codemagic.yaml` (workflow `ios-release`), migration `supabase/migrations/20261023010000_ios_app.sql` (**não aplicada**), testes em `tests/ios-app.test.ts`.

## 1. Passo a passo para o dono (em ordem)

### 1.1 Apple Developer (developer.apple.com) [VOCÊ]

Team ID: `3V989HNC76` (já está no projeto).

1. **Certificates, Identifiers & Profiles > Identifiers**: abra o App ID `com.jakash.app` (já existe, usado no login com a Apple da web). Marque as capacidades **Sign in with Apple** (configuração "Enable as a primary App ID") e **Push Notifications**. Salve.
2. **Keys > "+"**: crie uma chave com **Apple Push Notifications service (APNs)**. Baixe o `.p8` (só dá para baixar uma vez) e anote o **Key ID**. Vai para a Vercel como `APNS_KEY_ID` e `APNS_KEY_P8`.
3. **Small Business Program**: inscreva-se em https://developer.apple.com/app-store/small-business-program/ . A comissão da Apple cai de 30% para 15% (vale a partir do mês seguinte à aprovação). Faça antes da primeira venda.

### 1.2 App Store Connect (appstoreconnect.apple.com) [VOCÊ]

1. **Business (Acordos, Impostos e Dados Bancários)**: aceite o **Paid Applications Agreement** e preencha impostos e conta bancária. Sem isso as assinaturas não funcionam.
2. **Users and Access > Integrations > App Store Connect API > Team Keys**: crie uma chave com acesso **App Manager** (ou Admin). Anote **Issuer ID** e **Key ID** e baixe o `.p8`. Vai para o Codemagic (passo 1.5).
3. **Users and Access > Integrations > In-App Purchase**: gere uma chave. Baixe o `.p8` e anote **Key ID** e **Issuer ID**. Vai para a Vercel como `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_P8`.
4. **Apps > "+" > Novo app**: plataforma iOS, nome **Jakash**, idioma principal **Português (Brasil)**, Bundle ID `com.jakash.app`, SKU `jakash-ios`. Depois de criado, copie o **Apple ID** numérico (Informações do app) para `APP_STORE_APPLE_ID` no `codemagic.yaml`.
5. **Assinaturas** (menu Monetização > Assinaturas): crie o grupo **Jakash** e dentro dele 2 assinaturas de **1 mês**, com estes **IDs de produto exatos**:

   | Plano | ID do produto | Preço (BRL) | Nível no grupo |
   |---|---|---|---|
   | Jakash Pessoal | `jakash.pessoal.mensal` | R$ 19,90 | 2 |
   | Jakash Empresarial | `jakash.empresarial.mensal` | R$ 39,90 | 1 (o mais alto) |

   (Decisão de 23/10/2026: o Jakash vende só dois planos. Os produtos antigos `jakash.essencial.mensal`, `jakash.familia.mensal` e `jakash.mei.mensal` não devem ser criados: o app não os reconhece.) Para cada uma: nome de exibição (ex.: "Jakash Pessoal"), descrição curta, e a **captura de tela para revisão** (tela de planos do app, depois do primeiro build). Os níveis fazem a troca de plano valer na hora quando sobe e na renovação quando desce.
6. **Notificações do Servidor (App Store Server Notifications) V2**: em Informações do app, preencha **URL de produção** e **URL de sandbox** com `https://www.jakash.app/api/apple/notifications` e escolha a **Versão 2**.
7. Preencha a ficha do app com os textos da seção 2 (descrição, palavras-chave, URLs, categoria, classificação etária, Privacidade do app).

### 1.3 Supabase [VOCÊ]

1. **Authentication > Providers > Apple > Client IDs**: acrescente `com.jakash.app` ao que já está lá (`com.jakash.app.web`), separado por vírgula. É isso que deixa o login nativo da Apple funcionar.
2. **Authentication > URL Configuration > Redirect URLs**: adicione `https://www.jakash.app/auth/native` (e, se o Supabase recusar o endereço com `?next=`, a forma `https://www.jakash.app/auth/native**`). É a volta do login com o Google no app.
3. Aplicar a migration (seção 1.6).

### 1.4 Vercel (Settings > Environment Variables) [VOCÊ]

Só os **nomes** estão aqui; os valores vêm dos passos acima. Depois de salvar, faça um novo deploy.

- Notificações: `APNS_KEY_ID`, `APNS_TEAM_ID` (use `3V989HNC76`), `APNS_KEY_P8` (conteúdo inteiro do `.p8`, com as linhas `-----BEGIN/END PRIVATE KEY-----`), opcionais `APNS_BUNDLE_ID` (padrão `com.jakash.app`) e `APNS_ENV` (`production` por padrão; `sandbox` só para build de desenvolvimento).
- Compra pelo app: `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_P8`, opcional `APPLE_BUNDLE_ID`.
- Interruptor da compra pelo app: `NEXT_PUBLIC_IOS_IAP`. **Só coloque `1` depois de criar os 3 produtos na App Store Connect e aplicar a migration.** A Apple só aprova o app se a compra pelo app estiver ligada na versão enviada para revisão.

### 1.5 Codemagic (codemagic.io) [VOCÊ]

1. Entre com a conta do GitHub e adicione o repositório do Jakash (app tipo "codemagic.yaml").
2. **Teams > Integrations > App Store Connect**: crie a integração com a chave do passo 1.2.2 e dê o nome **Jakash ASC** (o mesmo do `codemagic.yaml`; se usar outro nome, troque lá).
3. O código do app iOS está na branch `ios-app` (ainda não enviada ao GitHub). Depois de revisada, ela precisa estar na branch que o Codemagic compila.
4. Troque `APP_STORE_APPLE_ID` no `codemagic.yaml` pelo Apple ID numérico.
5. Rode o workflow **ios-release**. Ele instala, sincroniza, assina (certificado e perfil de distribuição criados pela integração), numera o build e envia ao **TestFlight**. O envio à revisão da App Store é manual.

### 1.6 Banco de dados [VOCÊ aprova]

Aplique `supabase/migrations/20261023010000_ios_app.sql` no SQL Editor do Supabase (desfazer: `..._down.sql`). Ela cria as colunas `profiles.billing_provider` e `profiles.apple_original_transaction_id` e a tabela `native_push_tokens` (sem acesso público). Faça antes de testar notificações e compra. O site continua funcionando mesmo antes de aplicar.

### 1.7 Teste no TestFlight [VOCÊ]

Instale o app pelo TestFlight e confira:

- [ ] Abre direto no login (sem tela de preços) e, se já estiver logado, no painel.
- [ ] Entrar com e-mail e senha; criar conta nova; "Esqueci minha senha".
- [ ] Entrar com a Apple e com o Google (o Google abre o navegador e volta para o app sozinho; se não voltar, tocar em "Abrir o Jakash").
- [ ] Configurações > Notificações > "Avisos neste aparelho": pede permissão, "Enviar teste" chega, tocar na notificação abre a tela certa.
- [ ] Configurações > Bloqueio com Face ID: liga, fecha o app, volta depois de 5 minutos e pede Face ID (com o código do iPhone como alternativa).
- [ ] Relatórios > CSV e Configurações > Dados > Exportar: abre a folha de compartilhar. Conferir também os botões de imprimir/PDF do MEI (`window.print`), que podem não funcionar no iOS.
- [ ] Anexar comprovante: pede câmera/fotos com texto em português.
- [ ] Botão + > microfone: pede Microfone e Reconhecimento de Fala (texto em português) só no primeiro toque; dizer "gastei 50 reais no almoço agora" preenche tipo, valor, descrição, categoria e data; nada é salvo até tocar em Salvar. Testar também com permissão negada (deve mostrar como liberar em Ajustes), em modo avião (a Apple usa o reconhecimento no aparelho se o idioma português estiver baixado; senão avisa que está sem conexão) e "almoço 50 e uber 20" (o segundo item aparece em "Também entendi").
- [ ] Links externos (compartilhar, e-mail) abrem fora do app.
- [ ] Modo avião: aparece "Sem conexão" e "Tentar de novo" volta ao site.
- [ ] Margens de cima e de baixo (notch e barra inferior) ficaram certas, nos modos claro e escuro.
- [ ] Compra (com `NEXT_PUBLIC_IOS_IAP=1`): assinar cada plano com uma conta **Sandbox**, "Restaurar compras", "Gerenciar assinatura", subir e descer de plano, e ver o plano liberar. Com a chave desligada: o app não mostra preço nem botão de compra.
- [ ] Excluir conta com assinatura Apple ativa mostra o aviso para cancelar em Ajustes do iPhone.

### 1.8 Enviar para revisão [VOCÊ]

Na versão 1.0 do app: escolha o build do TestFlight, adicione as 2 assinaturas em "Compras no app e assinaturas", preencha as Notas para a revisão (seção 2.8), anexe as capturas de tela e envie.

## 2. Textos da App Store Connect (pt-BR, prontos para colar)

### 2.1 Nome (máx. 30)
```
Jakash
```

### 2.2 Subtítulo (máx. 30 — 26 caracteres)
```
Controle financeiro com IA
```

### 2.3 Texto promocional (máx. 170 — 155 caracteres)
```
Registre gastos e receitas em segundos, acompanhe contas a pagar, cartões e objetivos e converse com a Jaki, a assistente de IA que organiza suas finanças.
```

### 2.4 Descrição (máx. 4000 — cerca de 2900 caracteres)
Honesta: sem promessa de crédito, de limpar nome, de score ou de conselho de investimento.
```
O Jakash organiza a sua vida financeira em um só lugar, de um jeito simples e em português.

Registre o que entra e o que sai em segundos, veja para onde o dinheiro está indo e planeje o mês com calma. Sem planilha complicada.

O QUE VOCÊ FAZ NO JAKASH

• Lançamentos: anote receitas e despesas, com categorias e subcategorias que você personaliza. Anexe a foto do comprovante.
• Chat da Jaki: converse com a Jaki, a assistente de inteligência artificial do Jakash, para registrar gastos escrevendo normalmente (por exemplo, "gastei 45 no mercado") e para tirar dúvidas sobre as suas finanças.
• Contas a pagar e a receber: veja o que vence e receba lembretes por notificação, para não esquecer nenhum vencimento.
• Cartões e parcelas: acompanhe faturas, limite, compras parceladas e quando cada parcela termina.
• Lista de compras: monte a lista do mercado, marque o que já pegou e finalize registrando o gasto.
• Sair das dívidas: cadastre suas dívidas e veja um plano de pagamento calculado com os seus números.
• Objetivos e reserva de emergência: defina metas, acompanhe o quanto já guardou e quanto falta.
• Orçamento do mês: defina limites por categoria e veja onde está gastando mais.
• Relatórios: resumo do mês por categoria, com exportação em CSV.
• MEI separado: quem tem MEI acompanha o limite anual, prepara a DASN-SIMEI, emite recibos e mantém as finanças da empresa separadas das pessoais.
• Compartilhar com a família: divida as finanças com quem você confia (casal, família ou sócios), com até 3 pessoas, em qualquer plano.

SEGURANÇA E PRIVACIDADE

• Entre com e-mail e senha, com a Apple ou com o Google.
• Proteja o app com Face ID (opcional), em Configurações.
• Seus dados são seus: exporte ou exclua a sua conta quando quiser, dentro do próprio app.
• Não vendemos seus dados e não mostramos anúncios.

IMPORTANTE

O Jakash é uma ferramenta de organização. Ele não é banco, não oferece crédito nem empréstimo, não consulta nem altera pontuação de crédito (score), não limpa nome e não faz recomendação de investimentos ou consultoria financeira, contábil ou tributária. A inteligência artificial pode errar: confira os seus lançamentos.

PLANOS E ASSINATURA

O Jakash tem planos mensais com renovação automática:
• Jakash Pessoal: R$ 19,90 por mês (até 3 pessoas, com lançamentos, cartões, contas a pagar, limites, objetivos, dívidas, investimentos, planejamento, simulador, Chat da Jaki e Motorista de app)
• Jakash Empresarial: R$ 39,90 por mês (tudo do Pessoal, mais o pacote MEI)

O pagamento é cobrado na sua conta Apple na confirmação da compra. A assinatura renova automaticamente, pelo mesmo valor, a menos que seja cancelada pelo menos 24 horas antes do fim do período atual. Você gerencia e cancela em Ajustes do iPhone > seu nome > Assinaturas.

Termos de uso: https://www.jakash.app/termos-de-uso
Política de privacidade: https://www.jakash.app/politica-de-privacidade
```
Observação: os preços do fim da descrição só fazem sentido com a compra pelo app ligada; se mudar os preços na App Store Connect, atualize aqui.

### 2.5 Palavras-chave (máx. 100 — 95 caracteres)
Separadas por vírgula, sem espaço depois da vírgula, sem nome de concorrente nem marcas de terceiros.
```
gastos,orçamento,despesas,controle,contas a pagar,cartão,dívidas,MEI,planejamento,metas,família
```

### 2.6 Categorias, URLs e outros campos
- Categoria principal: **Finanças**. Secundária: **Produtividade**.
- URL de suporte: `https://www.jakash.app/contato`
- URL da política de privacidade: `https://www.jakash.app/politica-de-privacidade`
- URL de marketing (opcional): `https://www.jakash.app`
- Termos de uso (EULA): use o contrato padrão da Apple ou cole `https://www.jakash.app/termos-de-uso` no campo de EULA personalizado.
- Direitos autorais: `2026 Jakash`
- Preço do app: **Grátis** (a receita vem das assinaturas).
- Disponibilidade: Brasil (e outros países se quiser).

### 2.7 Classificação etária e Privacidade do app

**Classificação etária** (questionário): responda **Nenhum / Não** para tudo: violência, conteúdo sexual, palavrão, drogas, terror, jogos de azar, apostas simuladas, concursos, medicina e saúde, conteúdo gerado por usuários visível a outros. **Acesso irrestrito à web: Não** (o app só abre o próprio site; links externos abrem no Safari). Há um chat com inteligência artificial (a Jaki), sem contato entre usuários. Resultado esperado: **4+**.

**Privacidade do app ("nutrition label")**, conforme o que o app realmente guarda. Nenhum dado é usado para rastreamento e não há anúncios nem SDK de terceiros de análise.

| Tipo de dado | Coletado? | Ligado à identidade | Rastreio | Finalidade |
|---|---|---|---|---|
| Informações de contato > **E-mail** | Sim | Sim | Não | Funcionalidade do app |
| Informações de contato > **Nome** | Sim | Sim | Não | Funcionalidade do app |
| Informações financeiras > **Outras informações financeiras** (lançamentos, contas, cartões, dívidas, objetivos, investimentos) | Sim | Sim | Não | Funcionalidade do app |
| Conteúdo do usuário > **Fotos ou vídeos** (fotos de comprovantes) | Sim | Sim | Não | Funcionalidade do app |
| Conteúdo do usuário > **Outro conteúdo do usuário** (descrições, mensagens ao chat e, no lançamento por voz, a frase já transcrita em texto quando a IA é usada) | Sim | Sim | Não | Funcionalidade do app |
| Identificadores > **ID do usuário** | Sim | Sim | Não | Funcionalidade do app |
| Identificadores > **ID do dispositivo** (token de notificação) | Sim | Sim | Não | Funcionalidade do app |
| Compras > **Histórico de compras** (plano e situação da assinatura) | Sim | Sim | Não | Funcionalidade do app |
| Diagnóstico (falhas, desempenho) | **Não** (o app não tem SDK de falhas) | n/a | n/a | n/a |
| Localização, contatos, saúde, navegação, pesquisa, uso de publicidade | Não | n/a | n/a | n/a |

**Áudio (lançamento por voz):** no app iOS o áudio vai só para o reconhecimento de fala da Apple (`SFSpeechRecognizer`), no próprio iPhone quando o aparelho tem o idioma baixado e, se não tiver, pelo serviço de fala da Apple. O Jakash recebe apenas o texto, nunca o áudio, e não grava nada. Por isso **não** há linha de "Dados de áudio" na tabela acima (dado que não chega a nós não é "coletado"). O envio do áudio para transcrição (OpenAI) existe só em navegadores sem reconhecimento de fala (ex.: Firefox) e **não é usado dentro do app**. Se preferir declarar por cautela, marque "Dados de áudio > Conteúdo de áudio", não ligado a rastreio, finalidade "Funcionalidade do app", e atualize o `PrivacyInfo.xcprivacy` (`NSPrivacyCollectedDataTypeAudioData`).

O CPF/CNPJ só é pedido para quem paga pelo site e não passa pelo app iOS. Se um dia entrar um serviço de análise ou de falhas, atualize a tabela e o arquivo `ios/App/App/PrivacyInfo.xcprivacy`.

### 2.8 Notas para a revisão (modelo)
```
Olá, equipe de revisão.

O Jakash é um app de organização financeira pessoal (lançamentos, contas a pagar, cartões, dívidas, objetivos).

CONTA DE TESTE
E-mail: [PREENCHER: e-mail da conta de demonstração]
Senha: [PREENCHER]
A conta já tem dados de exemplo e não exige nenhum serviço externo.

COMO USAR
- O app abre no login. Também é possível entrar com a Apple ou com o Google.
- Assinatura: Configurações > Planos e assinatura > aba "Planos". A compra é feita pela App Store (compra no app) com 2 assinaturas mensais do grupo "Jakash": jakash.pessoal.mensal e jakash.empresarial.mensal. Há "Restaurar compras" e "Gerenciar assinatura".
- Chat da Jaki (menu): assistente com inteligência artificial para registrar gastos e tirar dúvidas. Não há contato entre usuários.
- Lançamento por voz: botão + > microfone. O app pede Microfone e Reconhecimento de Fala só quando você toca no microfone. Nada é salvo sem você tocar em Salvar.
- Notificações: Configurações > Notificações > "Avisos neste aparelho" (a permissão só é pedida aí).
- Bloqueio com Face ID: Configurações (opcional, vem desligado).
- Excluir a conta: Configurações > Dados > Excluir minha conta (digitar EXCLUIR).

O app é uma versão nativa do serviço Jakash e usa recursos do iPhone (login com a Apple, notificações, Face ID, microfone e reconhecimento de fala, compartilhar arquivos, compra pela App Store).

Contato: [PREENCHER: nome, telefone e e-mail do responsável]
```
(Não cite compra fora do app nesta nota.)

### 2.9 Plano de capturas de tela
Tamanhos: **iPhone 6,9"** (1320 x 2868 px) e **iPhone 6,5"** (1284 x 2778 px). Se enviar só o 6,9", a App Store Connect ajusta para os menores. Use a conta de demonstração (sem dados pessoais), modo claro, hora 9:41 se possível. Tire pelo TestFlight num iPhone, ou num simulador do Codemagic/Mac de um amigo. 6 capturas, nesta ordem:

1. **Início** (`/dashboard`): saldo do mês e gráficos.
2. **Novo lançamento** (botão +): lançamento rápido aberto.
3. **Contas a pagar e a receber** (`/contas`) com vencimentos.
4. **Cartões e parcelas** (`/cartoes`, fatura aberta).
5. **Sair das dívidas** (`/dividas`) com o plano de pagamento.
6. **Objetivos** (`/metas`) ou **Orçamento do mês** (`/limites`).

Extras se quiser (até 10): Lista de compras (`/comprar`), Chat da Jaki (`/chat`), Pacote MEI (`/mei`), Configurações com Face ID e Notificações. Não mostre preços fora da App Store (os preços aparecem nas assinaturas).

## 3. Como ligar e desligar a compra pelo app

- Ligar: criar os produtos, aplicar a migration, configurar as variáveis `APPLE_IAP_*`, colocar `NEXT_PUBLIC_IOS_IAP=1` na Vercel e fazer novo deploy. O app (que carrega o site) passa a mostrar os planos e os botões de assinar.
- Desligar: remover a variável (ou `0`) e novo deploy. No app não aparece preço, botão de compra nem link para comprar no site; só a situação do plano.
- Quem já paga pelo site (Asaas) vê a situação e a fatura, e não recebe oferta de compra no app.

## 4. Como funciona por dentro (resumo técnico)

- O app sempre abre `https://www.jakash.app/login`; o site reconhece o app pelo trecho `JakashApp/` no User-Agent (`src/lib/native.ts`, `src/middleware.ts`).
- Compra: o app manda só o número da transação para `POST /api/apple/verify`. O servidor consulta a Apple (App Store Server API, produção e depois sandbox) e só libera o plano se o pacote, o produto e o dono da compra (`appAccountToken` = id do usuário) conferem e a compra não foi estornada nem venceu.
- Renovação, cancelamento e estorno: a Apple avisa `POST /api/apple/notifications`; o servidor ignora o conteúdo e consulta o estado real na Apple antes de alterar o perfil.
- Notificações: `src/lib/apns.ts` envia por HTTP/2 com JWT ES256 (chave `.p8`); tokens recusados pela Apple (410 / BadDeviceToken) são apagados.
- O plugin `@capacitor-community/apple-sign-in` declara Capacitor 7 no Swift Package; `scripts/ios-prepare.mjs` libera a faixa para o 8 (o Codemagic roda isso sozinho; localmente use `npm run ios:sync`).
- Voz: `src/lib/voiceInput.ts` escolhe o caminho (app iOS com o plugin `@capgo/capacitor-speech-recognition`; navegador com a Web Speech API; só sem nenhum dos dois, gravação de até 20 s enviada a `/api/voice/transcribe`). O texto é entendido por `src/lib/voiceParse.ts` (local, grátis); só sem valor ou tipo chama `/api/voice/parse` (IA, conta no limite diário). O plugin é MPL-2.0 (uso sem alterar os arquivos dele não obriga a abrir o código do app), já declara `capacitor-swift-pm from 8.0.0` e por isso não precisa de ajuste no `scripts/ios-prepare.mjs` (o script só confere). Os textos de permissão ficam no `Info.plist` (`NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`).
- Como o app carrega o site, a tela de voz chega para todo mundo no deploy, mas o microfone só aparece no app depois de instalar um build novo com o plugin (builds antigos escondem o botão em vez de pedir uma permissão que o app antigo não declara). Depois de atualizar dependências, rode `npm run ios:sync` (o Codemagic roda `cap sync ios` sozinho) e confira se `ios/App/CapApp-SPM/Package.swift` lista `CapgoCapacitorSpeechRecognition`.
