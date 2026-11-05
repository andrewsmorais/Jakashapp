# Plano Jakash — versão única

> **23/10/2026 — decisão do fundador: o Jakash não terá assistente no WhatsApp (custo da Meta por resposta). Fases 1, 2 e a parte de WhatsApp da 6 foram canceladas; leitura de foto/PDF continua dentro do app (Importar).**
> Tudo que este plano diz sobre WhatsApp (webhook, worker, vínculo do número, lembretes e respostas pela Meta, variáveis `WHATSAPP_*`) está **cancelado e removido do código** (branch `remove-whatsapp-agent`; passos do fundador em `docs/REMOVER-WHATSAPP.md`). Ficam: o Chat da Jaki dentro do app, os links `wa.me` de compartilhar e, se o fundador definir, um link de suporte. As seções antigas abaixo ficam só como histórico.

> **Planos: Pessoal R$19,90 e Empresarial R$39,90 (23/10/2026).** O Jakash vende só dois planos: **Jakash Pessoal** (id `cpf`, R$ 19,90, até 3 pessoas, todas as telas pessoais) e **Jakash Empresarial** (id `mei`, R$ 39,90, Pessoal + pacote MEI). Os ids não mudaram. O plano Família deixou de ser vendido (um `familia` gravado vale como `cpf`) e não existe mais trava por plano nas telas pessoais (`FAMILY_ONLY_PATHS` e o `PlanGate` foram removidos). Produtos da App Store: `jakash.pessoal.mensal` e `jakash.empresarial.mensal`. Onde este plano fala de Essencial ou Família, leia como histórico.

**Data:** 20/10/2026
**Fontes juntadas:** auditoria do código feita pelo Claude (repositório lido arquivo por arquivo), relatório "Jakash: avaliação crítica e plano de evolução" e "Guia para Claude: conectar o Jakash à API oficial WhatsApp" (ambos da Manus, que **não** viu o código), e os pedidos do fundador.
**Para quem é:** o agente que vai executar (Sonnet 5.5, esforço alto) e o fundador.

---

## 0. Regras para o agente que vai executar

1. Trabalhe **na ordem de execução da seção 0.1** (que não é a ordem dos números das fases). Não comece uma fase sem a anterior cumprir o critério de pronto, exceto onde a fase disser que pode correr em paralelo.
2. **Um commit por item numerado** (ex.: `1.2`), com mensagem dizendo o item. Ao fim de cada fase: `npm run build` e `npx tsc --noEmit` sem erro.
3. **Migrations:** sempre em `supabase/migrations/AAAAMMDDHHMMSS_nome.sql` com o arquivo `_down.sql` correspondente (padrão já usado no repo). Toda tabela nova tem RLS do dono **e** a política da casa usando `public.household_user_ids()` (modelo: `20261015020000_shared_policies_balances.sql`). **Não aplique migration no banco de produção** (projeto Supabase `sogeaffujqmrrzuhrtao`) sem mostrar o SQL ao fundador e ele aprovar.
4. **Não mexa no painel da Meta**, nem em variáveis da Vercel. Quando precisar, escreva o passo para o fundador fazer.
5. **Segredos:** nunca imprima token, App Secret ou verify token em log, resposta ou commit. Nada secreto com prefixo `NEXT_PUBLIC_`.
6. **Reaproveite os nomes de variável que já existem** (não crie os nomes sugeridos pela Manus): `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_BOT_NUMBER`, `WHATSAPP_REMINDER_TEMPLATE`, `WHATSAPP_REMINDER_LANG`, `WORKER_SECRET`, `NEXT_PUBLIC_SITE_URL`.
7. **Não apague rotas/telas.** Simplificar = mudar menu, nomes e agrupar em abas. Rota antiga continua abrindo.
8. Textos de tela em português do Brasil, frases curtas. Nunca prometer "limpar o nome", rendimento ou aprovação de crédito.
9. Ao terminar cada fase, atualize a seção **16. Status** no fim deste arquivo.
10. **Regra de custo (decisão do fundador):** não contratar nem adicionar serviço, SDK ou plano **pago** novo sem aprovação por escrito. O custo variável que já existe (OpenAI, mensagens da Meta, Vercel, Supabase) continua, mas toda funcionalidade que o aumente precisa **declarar o custo** e ter teto: usar `gpt-4o-mini` (e o modelo de transcrição mais barato disponível) por padrão, contar foto e áudio no limite diário por plano, e preferir conta feita em código a chamar a IA.

### 0.1 Ordem de execução

| Ordem | Fase | Por que nessa posição |
|---|---|---|
| 1 | Fase 1 — WhatsApp ponta a ponta | feita no código; falta validar com mensagem real |
| 2 | Fase 2 — Conversa confiável | cria o motor único e o mecanismo de confirmação que as próximas usam |
| 3 | Fase 6 — Foto, áudio e boleto | usa a confirmação da Fase 2; é o pedido de maior valor do fundador |
| 4 | Fase 3 — App mais simples | arruma o menu antes de colocar telas novas |
| 5 | Fase 4 — Comprar | |
| 6 | Fase 5 — Sair do vermelho + guardar | |
| 7 | Fase 7 — Parcelas e cartões | |
| 8 | Fase 8 — Simulador de viagem | usa as parcelas da Fase 7 para mostrar o efeito no orçamento |
| 9 | Fase 9 — Contas, ícones e conexão bancária | |
| 10 | Fase 10 — Piloto, métricas e preço | |

---

## 1. Onde o Jakash está hoje (verificado no código)

A Manus marcou vários itens como "não comprovados" porque não teve acesso ao repositório. Esta tabela é a referência correta:

| Item | Situação | Evidência |
|---|---|---|
| Webhook GET (verificação) e POST com assinatura HMAC no corpo bruto | ✅ existe | `src/app/api/whatsapp/webhook/route.ts` (usa `crypto.timingSafeEqual`) |
| Fila + worker + varredura a cada minuto | ✅ existe | tabela `whatsapp_inbox`, RPC `acquire_whatsapp_task`, `src/app/api/whatsapp/worker/route.ts`, pg_cron ativo |
| Mensagem repetida da Meta não duplica | ✅ existe | `wamid UNIQUE` em `whatsapp_inbox` + índice único `(source_wamid, source_index)` em `transactions` |
| Vínculo seguro número ↔ conta | ✅ existe | código de uso único com validade (`20261014010000_whatsapp_link_codes.sql`), mensagem `conectar ABC123`, RPC `link_whatsapp_number` |
| Bloqueio antes da IA (número desconhecido, plano inativo, limite diário) | ✅ existe | `src/lib/whatsappGate.ts` |
| Cobrança recorrente e direitos por plano | ✅ existe | Asaas (`src/app/api/asaas/*`, token no webhook), `src/lib/entitlements.ts`, `src/lib/plans.ts` |
| Separação pessoal × empresa (MEI) | ✅ existe | `is_business` em contas, cartões e lançamentos; Pacote MEI em `/mei` |
| Gestão compartilhada (casa) | ✅ existe | `partnerships`, `household_user_ids()`, políticas "Casal acessa…" |
| Exportar CSV e excluir conta | ✅ existe | `/configuracoes/dados`, `src/app/api/account/delete/route.ts` |
| Lembretes de vencimento (push, e-mail, WhatsApp) | ✅ existe | `src/app/api/cron/reminders`, `src/lib/reminders.ts` (0, 1, 3 ou 7 dias antes) |
| Valores em dinheiro no banco | ✅ ok | `DECIMAL(12,2)` |
| **Mensagem real chegando do WhatsApp** | ❌ **bloqueio nº 1** | o "Teste" da Meta chega (POST 200), mensagem real não |
| Confirmar / desfazer lançamento pelo WhatsApp | ❌ falta | o worker grava direto via `commit_financial_transactions` |
| Perguntar pelo WhatsApp ("quanto gastei no mês?") | ❌ falta | a IA do WhatsApp só extrai **um** lançamento (`prompts/financial-agent-system.md`) |
| Categorias do próprio usuário no WhatsApp | ❌ falta | lista fixa no prompt; o Chat IA do app já usa as categorias reais |
| Foto e áudio pelo WhatsApp | ❌ falso hoje | o worker manda só o texto "[FOTO RECEBIDA]" e `imageUrl: undefined` (linhas 64–68 e 105) |
| Versão da Graph API centralizada | ❌ falta | worker usa `v17.0` fixo (linha 232); lembretes usam `WHATSAPP_GRAPH_VERSION` (padrão v21.0); painel da Meta já está na v26.0 |
| Prazo de guarda das mensagens | ❌ falta | `raw_payload` (telefone, nome e texto) fica guardado para sempre |
| Nome da assistente | ❌ inconsistente | os prompts dizem "Jakash"; a assistente se chama **Jaki** |
| Modelo de IA | ⚠️ atenção | o código usa `gpt-4o-mini` (não GPT-4o, como dizem os documentos) — está certo para custo, só registrar |
| Sobras | ⚠️ limpar | `next.config.mjs` vazio (o `.js` é o usado); `prompts/financial-agent.md` não é lido por nenhum código |

---

## 2. Mercado e posicionamento

**O que os documentos mostram (fontes no fim):**
- WhatsApp com IA **não é diferencial sozinho**. Segundo a Manus, o Mobills PRO já registra por texto e áudio no WhatsApp, e ZapGastos, Jota e Meu Assessor fazem propostas parecidas. O Porquim IA faz texto, áudio, foto e alerta de limite.
- Segundo a Manus, os **Termos do Mobills excluem uso por empresa e fluxo de caixa de negócio**. Isso abre espaço para o MEI, mas só se o Jakash separar de verdade pessoa e empresa (o código já separa).
- Preços: Organizze R$ 35 por mês no Manual e R$ 45 no Conectado; Minhas Economias R$ 24,90 por mês. No Mobills, o blog dele cita R$ 19,90 por mês, mas a Manus achou esse valor como **parcela do plano anual** (12× R$ 19,90), e o preço do PRO não está público. Antes de decidir preço, confira no site de cada um e compare sempre mensal com mensal.
- Nenhum dos concorrentes pesquisados mostra **lista de compras** nem **plano para sair das dívidas**.

**Posicionamento proposto (junta Manus + fundador):**
> "A Jaki cuida do seu dinheiro pelo WhatsApp: anota o gasto, avisa a conta, monta sua lista de mercado e te ajuda a sair das dívidas. E, se você é MEI, separa o dinheiro da empresa do seu."

**Visão do fundador (vale mais que a Manus):** a ideia desde o começo é um **app completo**, que dê valor além de anotar gasto: ler boleto, cupom e comprovante por foto; entender áudio; mostrar quando cada parcelamento acaba e quanto o orçamento libera; simular uma viagem; avisar a data do cartão e das contas; mostrar cada conta e cartão com o ícone do banco. O relatório da Manus é uma **fonte de ideias e de riscos**, não um roteiro a cumprir 100%. Onde ele manda "não acrescente funções" (por exemplo, para adiar Open Finance e OCR), vale a decisão do fundador, com os cuidados descritos em cada fase.

**Onde a Manus e o fundador discordam, e a decisão:**
- A Manus pede um único público. O fundador quer cidadão comum **e** empreendedor. **Decisão:** um app só, com dois modos que já existem no código (`usage_type`: pessoal / empresarial / ambos). Cada modo tem um início e um menu próprios. Campanhas e métricas medem cada público **separado**, como pede a Manus.
- A Manus diz "não acrescente funções grandes agora". O fundador quer **Comprar** e **Sair do vermelho**. **Decisão:** as duas entram, mas **depois** das Fases 1 e 2 (WhatsApp funcionando e confiável). São médias e reaproveitam tabelas existentes.
- A Manus deixa para depois Pix, pagamentos, crédito, Open Finance e nota fiscal. **Concordo para Pix, pagamentos, crédito e nota fiscal: ficam fora deste plano.** O Open Finance **vai entrar no futuro**, mas sem gastar nada agora (Fase 9, item 9.4). "Sair do vermelho" é organizar as próprias dívidas, não oferecer crédito nem cobrar ninguém.

---

## 3. Decisões do fundador (responder antes ou durante a Fase 1)

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Público da primeira campanha | Escolha um por vez (cidadão comum com dívidas **ou** MEI) e meça separado. O produto atende os dois. |
| D2 | Dívidas e plano para sair delas no **Essencial** (R$ 19,90)? Hoje `/dividas` é só do Família (`FAMILY_ONLY_PATHS` em `src/lib/plans.ts`). | **Sim.** É a dor nº 1 de quem tem nome sujo, e esse público compra o plano mais barato. |
| D3 | WhatsApp: grava direto + botão "Desfazer", ou pede confirmação sempre? | **Grava direto quando a mensagem está clara** e responde com os botões "Desfazer" e "Trocar categoria". **Pergunta antes** quando falta valor, o tipo é ambíguo ou o valor passa de R$ 1.000. |
| D4 | Modelo de mensagem do WhatsApp para lembretes (é pago por mensagem) | Criar o `lembrete_vencimento` (categoria Utilidade). Corpo em `LEMBRETES-E-IA.md`. |
| D5 | Nome da assistente | **Jaki** em todo lugar (prompts, respostas, telas). |
| D6 | Comprar no plano Essencial? | **Sim, em todos os planos.** É o que faz a pessoa abrir o app toda semana. |

---

## 4. Fase 0 — Tarefas do fundador (sem código)

Modelo/esforço: nenhum agente. Se quiser ajuda guiada, use **Sonnet 5.5, esforço médio**.

0.1 **Trocar o token de acesso.** O token do usuário do sistema foi colado no chat várias vezes. Gere um novo (Business Manager › Usuários do sistema › Gerar token, com as mesmas 5 permissões), coloque em `WHATSAPP_ACCESS_TOKEN` na Vercel e **faça um novo deploy**. Depois, revogue o antigo.

0.2 **Destravar a mensagem real (bloqueio nº 1).** Já confirmado: o token é válido, de usuário do sistema, sem expiração e com os escopos certos. O app está Publicado, o número Conectado e a URL do webhook configurada na aba **Whatsapp Business Account** (o Teste deu 200). Falta conferir, nesta ordem:
- a) Em developers.facebook.com › app Jakash › Casos de uso › Conectar no WhatsApp › Webhooks, na aba **Whatsapp Business Account** (não na aba "User"), o campo **`messages`** precisa estar com a assinatura ligada.
- b) Conferir se o app está inscrito na conta do WhatsApp. Abra o **Graph API Explorer** (developers.facebook.com/tools/explorer), escolha o app Jakash e cole o token novo no campo de token. Faça `GET 2342365759923700/subscribed_apps`. Se a lista vier vazia, mude para `POST` no mesmo caminho e envie.
- c) Na Vercel, conferir se `WHATSAPP_PHONE_NUMBER_ID` termina em `4207689`.
- d) Mandar "oi" do seu celular para +55 12 99184-2793 e olhar os logs da Vercel. **Nenhum POST** indica problema no item a ou b. **POST com 401** indica `META_APP_SECRET` errado. **POST 200, mas nada no Supabase** indica erro de leitura da mensagem.

0.3 Responder às decisões D1 a D6.

0.4 Criar o modelo `lembrete_vencimento` no Gerenciador do WhatsApp (D4).

**Pronto quando:** uma mensagem real aparece em `whatsapp_inbox` com o seu número.

---

## 5. Fase 1 — WhatsApp funcionando de ponta a ponta

Modelo/esforço: **Sonnet 5.5, alto** (código de produção, dinheiro e segurança).
Pode começar em paralelo com o item 0.2; o teste final depende dele.

1.1 **Cliente único da Graph API.** Criar `src/lib/whatsappApi.ts` com `graphUrl(path)`, usando `WHATSAPP_GRAPH_VERSION` com padrão `v26.0`, e `sendText(to, body)`. Trocar o `fetch` fixo em `v17.0` do worker (linha 232) e o de `src/lib/whatsappSend.ts` por esse cliente. Os erros da Meta vão para o log **sem** token e sem o texto da mensagem.

1.2 **Registrar o envio.** Guardar o `wamid` da resposta enviada (coluna nova `reply_wamid` em `whatsapp_inbox`). O webhook passa a reconhecer `value.statuses[]` (entregue/lido/falhou) e atualizar só esse registro. Status de entrega **nunca** vira lançamento.

1.3 **Foto e áudio: resposta honesta até a Fase 6.** No worker, quando `type` for `image`, `audio`, `video`, `document` ou `sticker`, não chamar a IA. Responder: "Por enquanto eu só entendo texto. Me manda assim: *gastei 35 no almoço*. Foto e áudio estão chegando!" e marcar `skipDb`.

1.4 **Nome Jaki.** Trocar "Jakash" por "Jaki" como nome da assistente em `prompts/financial-agent-system.md` e `src/lib/chatPrompt.ts`. O app continua se chamando Jakash. Tirar gírias como "Mano" do tom.

1.5 **Prazo de guarda (LGPD).** Migration com um job pg_cron diário que limpa `raw_payload` de registros `completed` ou `failed` com mais de 30 dias. Guardar só o tipo da mensagem e o resultado. Atualizar `/politica-de-privacidade` com esse prazo.

1.6 **Limpeza.** Apagar `next.config.mjs` (vazio) e `prompts/financial-agent.md` (não usado). Atualizar `INSTRUCOES-WHATSAPP.md` com o checklist da Fase 0.

**Testes de aceitação** (adaptados da seção 7 do guia da Manus):
- GET com verify token errado responde 403; com o certo, devolve o `hub.challenge` puro.
- POST com assinatura inválida responde 401 e não grava nada.
- O mesmo POST enviado duas vezes gera **um** registro.
- Mensagem real → registro em `whatsapp_inbox` → resposta chega no WhatsApp → `reply_wamid` preenchido → status "delivered" registrado.
- Número não vinculado recebe o link de cadastro; `conectar CODIGO` vincula a conta.
- Foto recebe a resposta honesta, sem chamar a IA.
- `grep -rn "v17.0" src` não encontra nada.

**Pronto quando:** o fundador manda "gastei 50 no mercado" do celular dele e o lançamento aparece **uma vez** no painel, na conta certa.

---

## 6. Fase 2 — Conversa confiável no WhatsApp

Modelo/esforço: **Sonnet 5.5, alto.**

2.1 **Um cérebro só.** Hoje existem dois: o do WhatsApp, que só extrai um lançamento com categorias fixas, e o do Chat IA, que já tem contexto, categorias reais e ações. O WhatsApp passa a usar o motor do Chat IA (`src/lib/chatPrompt.ts`, `src/lib/chatContext.ts` com `buildChatContext`, e `src/lib/chatActions.ts`), com uma variação do prompt para o canal WhatsApp (respostas mais curtas e sem a ação `navigate`). Esse contexto é montado com a service role e **filtrado pelo `user_id` vinculado ao número**, nunca por algo escrito na mensagem. Depois disso, `prompts/financial-agent-system.md` e a leitura de arquivo em `process-message` podem sair.

2.2 **Confirmar e desfazer** (conforme D3):
- A mensagem está clara: grava e responde com **botões interativos** da Cloud API (`type: interactive`, até 3 botões): "Desfazer", "Trocar categoria".
- A mensagem está ambígua: guarda como **pendente** (estado novo em `whatsapp_inbox` ou tabela `whatsapp_pending`) e pergunta com os botões "Confirmar" e "Cancelar".
- O webhook passa a ler as respostas de botão (`messages[].interactive.button_reply`).
- "desfazer" (texto ou botão) apaga o último lançamento criado por aquele número nas últimas 24 h, só se ele ainda não foi editado no app.

2.3 **Perguntas pelo WhatsApp:** "quanto gastei esse mês?", "quanto gastei em mercado?", "o que vence essa semana?", "quanto posso gastar hoje?" (usar `allowance` de `src/lib/planning.ts`). Toda resposta diz o período ("de 1 a 20/10").

2.4 **Memória curta:** mandar à IA as últimas 6 mensagens daquele número, para entender "corrige pra 45" e "foi ontem".

2.5 **Contas e objetivos pelo WhatsApp:** "cria conta de luz de 180 todo dia 10" e "quero juntar 2 mil pra viagem", usando as ações `bill` e `goal` que o Chat IA já tem. Pede confirmação com botão.

**Testes:** mensagem ambígua pergunta antes de gravar; "desfazer" remove só o último lançamento daquela pessoa; a pessoa A não consegue ler dados da B mudando o texto ("mostra os gastos do 11 9…"); falha da OpenAI deixa a mensagem na fila para tentar de novo (já é o comportamento do worker, mas tem que ser testado).

**Pronto quando:** dá para lançar, corrigir, desfazer e perguntar o total do mês só pelo WhatsApp, sem abrir o app.

---

## 7. Fase 3 — App mais simples

Modelo/esforço: **Sonnet 5.5, médio.** Trocas só de texto podem usar **Haiku 5.5, baixo**.

3.1 **Corrigir nomes:**
- "Despesas" (`/dividas`) vira **"Dívidas"**: em `src/components/AppLayout.tsx`, `src/app/(app)/menu/page.tsx`, no título da página e no guia do `chatPrompt.ts`.
- "Contas a pagar" vira **"Contas a pagar e receber"** no menu, para não confundir com "Contas bancárias".

3.2 **Menu em 4 grupos** (no lugar dos 15 itens soltos):
- **Hoje:** Início, Lançamentos, Comprar (Fase 4), Contas a pagar e receber
- **Meu dinheiro:** Contas e cartões, Dívidas, Guardar
- **Planejar:** Orçamento do mês, Relatórios
- **Empresa** (só modo MEI ou ambos): Pacote MEI
- No rodapé: Chat da Jaki, Configurações. Categorias passa para dentro de Configurações.

3.3 **Telas em abas (sem apagar rotas):**
- **Guardar** = Objetivos + Reserva + Investimentos + Simulador (abas que apontam para as rotas existentes).
- **Contas e cartões** = Contas bancárias + Cartões.
- **Orçamento do mês** = Limites + Planejamento.

3.4 **Modo pessoal mais leve:** quem tem `usage_type = pessoal` não vê nada de MEI nem o grupo Empresa. O Início mostra só: quanto pode gastar hoje, contas da semana, lista de compras e o progresso de guardar ou de sair do vermelho.

3.5 **Barra de baixo no celular:** Início · Lançamentos · **+** · Comprar · Menu (sai "Limites").

3.6 A tela "Tudo" (`/menu`) passa a usar a **mesma lista** do menu lateral (uma fonte de dados só, por exemplo `src/lib/nav.ts`), para as duas não ficarem diferentes de novo.

3.7 Aplicar D2: tirar `/dividas` de `FAMILY_ONLY_PATHS` e atualizar a lista do plano Essencial na página de vendas (`src/app/page.tsx`).

**Pronto quando:** no celular, todo destino fica a no máximo 2 toques do Início, e nenhum nome do menu aparece duas vezes com sentidos diferentes.

---

## 8. Fase 4 — Comprar (lista de compras)

Modelo/esforço: **Sonnet 5.5, médio.**

**Banco** (migration nova + down):
```sql
shopping_lists (id uuid pk, user_id uuid fk, name text default 'Mercado',
                is_business boolean default false, status text check in ('open','done') default 'open',
                transaction_id uuid null fk transactions, created_at, finished_at)
shopping_items (id uuid pk, list_id uuid fk on delete cascade, created_by uuid fk,
                name text not null, quantity numeric(10,3) default 1, unit text null,
                est_price numeric(12,2) null, checked boolean default false, checked_at timestamptz,
                position int, created_at)
```
RLS do dono e política da casa ("Casal acessa listas de compras" e "Casal acessa itens"), seguindo o modelo de `goal_contributions`.

**Tela `/comprar`:**
- Campo para adicionar rápido. Aceita várias coisas de uma vez: "2 leite, pão, 1kg arroz".
- Sugestões dos itens que a pessoa mais compra (a partir das listas antigas, sem tabela nova).
- Tocar no item marca como "no carrinho". Mostra **total estimado × total do carrinho** ao vivo.
- Mostra **"Você ainda pode gastar R$ X em Alimentação este mês"**, a partir dos limites que já existem (`budgets`).
- **Finalizar compra:** a pessoa informa o valor pago (já vem preenchido com o total do carrinho) e escolhe conta ou cartão. Para isso, o QuickAdd ganha os campos `amount`, `description` e `category` no `QuickAddPreset` (`src/components/QuickAdd.tsx`), e a compra vira **um** lançamento de despesa. A lista fica `done` com o `transaction_id`. O que não foi marcado passa para uma lista nova ("ficou faltando").
- No modo MEI, a opção "Lista da empresa" (`is_business`) gera lançamento da empresa.
- Funciona com sinal fraco: a marcação aparece na hora e é salva em seguida, tentando de novo se falhar.

**Jaki (WhatsApp e Chat):** nova ação `shopping_add` (itens) e as perguntas "o que falta comprar?" e "me manda a lista". Exemplo: "põe leite e pão na lista" responde "Anotei: leite, pão. Sua lista tem 7 itens."

**Testes:** a lista compartilhada aparece para as duas pessoas da casa; finalizar gera um lançamento só (clique duplo não duplica); a pessoa de fora da casa não vê a lista.

**Pronto quando:** dá para montar a lista pelo WhatsApp, marcar no mercado pelo celular e finalizar, e o gasto aparece no Início e nos limites.

---

## 9. Fase 5 — Sair do vermelho + incentivo a guardar

Modelo/esforço: **Sonnet 5.5, alto** (contas de dinheiro e textos sensíveis).

### 9.1 Dívidas completas (migration aditiva em `debts`)
Novos campos: `creditor` (credor), `original_amount`, `status` (`em_dia`, `atrasada`, `negativada`, `negociada`, `quitada`), `overdue_since` (desde quando está atrasada), `essential` (água, luz, gás, aluguel), `cash_offer` (proposta à vista), `agreement_installments`, `agreement_amount`, `agreement_first_due`. O `kind` ganha `conta_consumo` e `loja`.

### 9.2 Alerta das parcelas
- Quando a pessoa registra um acordo, as parcelas viram contas a pagar mensais (coluna nova `bills.debt_id`).
- O cron de lembretes que já existe passa a avisar essas parcelas sem nenhuma mudança.
- Ao dar baixa (`mark_bill_paid`), a parcela também abate da dívida (`register_debt_payment`) **na mesma transação** do banco.

### 9.3 Plano da Jaki para pagar as dívidas
- Rota nova `POST /api/debts/plan`.
- **As contas são feitas em código, não pela IA.** Usar `projectPayoff` (avalanche e bola de neve, em `src/lib/planner.ts`), a renda média e os compromissos de `src/lib/planning.ts` e os gastos essenciais do mês.
- A IA (`gpt-4o-mini`) **só escreve a explicação** com os números já calculados, e não pode inventar valor.
- A resposta traz:
  - ordem de pagamento, com as dívidas essenciais (água, luz, aluguel) primeiro e depois os juros mais altos;
  - quanto separar por mês e em quantos meses quita;
  - à vista com desconto × parcelado (juros totais e quanto sobra por mês em cada caso);
  - um **roteiro de negociação** (o que perguntar ao credor: valor total, desconto à vista, número de parcelas, se o acordo inclui a retirada da negativação, pedir tudo por escrito).
- Botão "Atualizar plano" a cada mês e também quando a pessoa pagar algo.

**Limites obrigatórios:**
- A Jaki não indica banco, empréstimo, portabilidade nem produto de crédito (é a regra atual do `chatPrompt.ts`).
- Nenhum texto promete "limpar o nome".
- Informação legal (por exemplo, o prazo máximo de permanência da negativação) **só entra depois de o fundador conferir em fonte oficial**, e com o link da fonte na tela.
- Nunca pedir CPF.
- Os dados de dívida aparecem na política de privacidade como finalidade nova.

### 9.4 Incentivo a guardar
- **Mini-reserva primeiro:** quem tem dívida recebe a sugestão de um objetivo pequeno, "Reserva inicial" (meta = 1 mês de gastos essenciais, calculado pelo app), para não voltar ao cartão numa emergência. Usa `goals` e `goal_contributions`, que já existem.
- **Marcos:** primeiros R$ 100 guardados, 25%, 50% e 100% de um objetivo, e cada dívida quitada. A comemoração aparece no app e, dentro da janela de 24 h, no WhatsApp.
- **Sequência:** "3 meses seguidos guardando", calculada pelos aportes em `goal_contributions`.
- **Fim do mês:** no resumo mensal que já existe (`src/app/api/cron/insights`, todo dia 1º), incluir "Sobrou R$ X no mês passado. Quer mandar para [objetivo]?" com um botão que cria o aporte.
- Tudo é sugestão: nada movimenta dinheiro sozinho.

**Testes:** o plano bate com a conta feita à mão para 3 dívidas de exemplo; a dívida quitada some do plano e dispara a comemoração; a parcela do acordo gera lembrete; a pessoa de outra casa não vê as dívidas.

**Pronto quando:** quem está com o nome sujo cadastra as dívidas em menos de 5 minutos, recebe o plano com a ordem e o valor do mês, e é avisado de cada parcela.

---

## 10. Fase 6 — Foto e áudio de verdade no WhatsApp

Modelo/esforço: **Sonnet 5.5, alto.**

6.1 **Baixar a mídia.** Pegar o `media_id` da mensagem, chamar `GET /{media_id}` para obter a URL temporária e baixar com o Bearer token, pelo cliente da Fase 1. Limite de tamanho: 5 MB para imagem e 16 MB para áudio.
6.2 **Foto** (comprovante ou nota): mandar à IA como data URL em base64. A rota `process-message` já aceita `imageUrl`.
6.3 **Áudio:** transcrever com o modelo de transcrição da OpenAI e seguir o fluxo de texto da Fase 2. Responder mostrando o que entendeu ("Entendi: *gastei 40 de gasolina*").
6.4 **Privacidade e custo:** não guardar a mídia (só o texto extraído); contar foto e áudio no limite diário de mensagens; colocar um teto por plano.
6.5 Tirar o "Em breve" de `src/app/bem-vindo/page.tsx` e atualizar a página de vendas.

6.6 **Boleto (foto ou PDF) vira conta a pagar, não gasto.** Extrair beneficiário, valor, vencimento e a linha digitável (47 ou 48 dígitos). **Validar os dígitos verificadores da linha digitável em código** e comparar o valor dela com o valor lido da imagem: se divergirem, mostrar os dois e pedir para a pessoa escolher. Criar em `bills` com o vencimento, para entrar no alerta que já existe. Se faltar o vencimento na foto, perguntar.
6.7 **Cupom ou nota fiscal** vira despesa: total, estabelecimento, data e categoria sugerida entre as categorias reais da pessoa.
6.8 **Comprovante de pagamento ou de Pix:** procurar uma conta a pagar pendente com o mesmo valor e vencimento próximo e oferecer **dar baixa** nela (`mark_bill_paid`); se não houver, lançar como despesa.
6.9 **Sempre confirmar antes de gravar** foto e áudio (botões "Confirmar" e "Corrigir"), mostrando o que a IA leu. Reaproveitar o motor de leitura de `src/app/api/import/extract/route.ts` e `src/lib/importer.ts`; não escrever um segundo leitor.

**Pronto quando:** a foto de um boleto vira uma conta a pagar com o vencimento certo, a de um cupom vira uma despesa e um áudio de 10 s vira o lançamento certo, tudo com confirmação, sem guardar a mídia.

---

## 11. Fase 7 — Parcelas e cartões

Modelo/esforço: **Sonnet 5.5, alto** (datas e valores).

**O que a pessoa vê:** cada compra parcelada com o **produto**, o cartão, a parcela atual ("4 de 12"), o valor da parcela, quanto ainda falta pagar e **quando termina** ("última parcela em 20/12/2026"), e quanto o orçamento **libera por mês** depois disso.

**Dados:** já existem. Cada parcela é uma linha de `transactions` com `installment_group`, `installment_number` e `installment_total` (`buildCardPurchase` em `src/lib/cards.ts`), e o produto é o `description`. Não precisa de tabela nova. Se ficar lento, criar uma função SQL `installment_plans()` (aditiva, com o mesmo RLS e a política da casa).

7.1 **Tela "Parcelamentos"** (aba dentro de "Contas e cartões"): lista agrupada por `installment_group`, ordenada por quem termina primeiro. Mostra produto, cartão, "x de y", valor da parcela, total que falta e a data da última parcela.
7.2 **Linha do tempo** dos próximos 12 meses: quanto de parcela cai em cada mês e onde o valor **diminui** ("em mar/2027 caem R$ 480 por mês"). Só conta em código, sem IA.
7.3 **Alertas** (no cron de lembretes que já existe, sem repetir aviso, usando `notification_log`): "faltam 3 parcelas de [produto]"; "a última parcela de [produto] vence dia 20/12 e, a partir de janeiro, você libera R$ 150 por mês". A fatura do cartão a vencer já tem aviso; conferir que o texto diz o número de dias.
7.4 **Compras importadas** entram como um lançamento só (o importador não separa parcelas). Permitir a pessoa informar "parcelas restantes" para elas aparecerem aqui.
7.5 **Jaki:** "quais são minhas parcelas?", "quando acaba o parcelamento do celular?", "quanto vou liberar em janeiro?".

**Pronto quando:** uma compra de R$ 1.200 em 12x aparece com o produto, "5 de 12", a data da última parcela e o valor que libera depois, e o aviso chega antes da última parcela.

---

## 12. Fase 8 — Simulador de viagem

Modelo/esforço: **Sonnet 5.5, médio**.

Reaproveita `GOAL_TYPES.viagem` (`src/lib/planner.ts`), `requiredMonthly` e `allowance` (`src/lib/planning.ts`).

8.1 **Formulário:** destino, datas, número de pessoas e custos por categoria (transporte, hospedagem, alimentação, passeios, seguro, outros), com **folga de 10 a 15% editável** para imprevistos.
8.2 **Resultado (em código):** custo total, **quanto guardar por mês** até a data e se isso cabe na sobra real do mês (`allowance` e compromissos já cadastrados). Mostrar 2 ou 3 cenários lado a lado (outra data, menos dias, outra faixa de custo).
8.3 **Parcelar no cartão:** mostrar como a viagem parcelada ocupa os meses seguintes, junto com as parcelas da Fase 7.
8.4 **Botão "Criar objetivo da viagem":** cria o objetivo (`goals`, tipo viagem) com a data e o aporte mensal sugerido, ligado às marcas e à sequência da Fase 5.
8.5 **Jaki:** "quero ir pra Salvador em julho, 4 pessoas". A IA monta um **rascunho** com faixas de custo que a pessoa edita. Rotular como **estimativa**, nunca como preço de passagem ou hotel (o app não consulta preço real nem vende viagem). As contas continuam em código.

**Pronto quando:** a pessoa simula uma viagem, vê quanto guardar por mês e se cabe, e cria o objetivo em um toque.

---

## 13. Fase 9 — Contas, ícones e conexão bancária

Modelo/esforço: ícones **Sonnet 5.5, médio**; a escolha do provedor de conexão bancária **Opus 5.5, alto**.

9.1 **Ícone de banco e de cartão.** Hoje não existe nenhum (`BRANDS` em `src/lib/cards.ts` só guarda nomes e `public/` só tem o logo do Jakash). Criar `src/lib/institutions.ts` (chave, nome, cor, iniciais) e uma coluna aditiva `institution` (texto, opcional) em `accounts` e `credit_cards`. O seletor aparece ao criar a conta ou o cartão.
9.2 **Visual "realista" sem violar marca:** o padrão é um selo limpo com a **cor e as iniciais** da instituição. Logos oficiais só quando a origem for **autorizada** (arquivos fornecidos por um provedor de conexão bancária ao conectar, ou liberação/guia de marca do próprio banco ou bandeira). **Não gerar imitações de logos de banco com IA**: ficam imprecisas e podem ser usadas como marca de terceiros. Conferir as regras de uso de marca de cada bandeira (Visa, Mastercard, Elo) antes de publicar.
9.3 Mostrar o ícone em Contas, Cartões, Lançamentos, Parcelamentos e no Início.
9.4 **Conexão bancária (Open Finance): FUTURO, fora da execução atual.** Decisão do fundador em 20/10/2026: vai entrar no app mais tarde, mas **não se investe agora em nada que aumente o custo do app**. Portanto: nenhum provedor, contrato, SDK ou assinatura paga entra neste ciclo, e o agente **não deve começar a implementar**. O que fica pronto desde já, sem custo: o campo `institution` e o seletor da 9.1, que serão a base quando a conexão chegar. Quando o fundador decidir retomar, abrir uma fase própria que comece por pesquisa (preço por conexão, bancos cobertos, termos de uso dos dados, logos fornecidos) e só depois código, **somente leitura**, com conciliação para não duplicar lançamentos e saída manual se a conexão cair.

**Pronto quando:** cada conta e cartão aparece com o selo da instituição em todas as telas, sem nenhum serviço pago novo.

---

## 14. Fase 10 — Piloto, métricas e preço

- Métricas: **Sonnet 5.5, médio**.
- Análise de preço: **Opus 5.5, alto**.

10.1 **Funil no painel do dono (`/admin`):** criou conta, vinculou o WhatsApp, primeiro lançamento, ativo 7 e 30 dias depois, mensagens recebidas × gravadas, taxa de "desfazer" e correção, custo de IA e de mensagens da Meta por conta ativa, cancelamentos e motivo. Tudo separado por modo (pessoal / MEI / ambos).
10.2 **Piloto:** 20 a 30 pessoas de cada público, com entrevista curta antes e depois (roteiro na seção "Fase 4" do relatório da Manus).
10.3 **Matriz de planos:** pessoas, WhatsApp, limites diários, Dívidas, Comprar, MEI, relatórios e suporte. Estimar o custo variável por conta: OpenAI, modelos de mensagem da Meta (conferir a tabela de preços do Brasil no painel), Vercel, Supabase e Asaas.
10.4 Decidir o preço com dados do piloto, e não antes.

---

## 15. Fora deste plano (de propósito)

Pix e pagamentos, crédito ou indicação de empréstimo, cobrança de terceiros, emissão de nota fiscal, recomendação de investimento e Embedded Signup (cada cliente conectar o próprio número). Cada um muda risco e custo, e precisa de avaliação jurídica antes.

---

## 16. Status (o agente atualiza ao fim de cada fase)

| Fase | Estado | Data | Observações |
|---|---|---|---|
| 0 — Fundador | pendente | | |
| 1 — WhatsApp ponta a ponta | **CANCELADA em 23/10/2026** (decisão do fundador: custo da Meta por resposta). Código removido. | 23/10/2026 | (histórico, 20/10/2026)  `tsc` e `npm run build` sem erro. Webhook testado com assinatura: GET errado 403, GET certo devolve o challenge, POST sem/ com assinatura inválida 401, status de entrega 200 sem virar lançamento. **Não testado:** envio real à Meta e o worker contra o banco (dependem do item 0.2 e das migrations). Pendências abaixo. |
| 2 — Conversa confiável (no WhatsApp) | **CANCELADA em 23/10/2026** (era a conversa pelo WhatsApp). O Chat da Jaki do app continua como está. | 23/10/2026 | |
| 3 — App mais simples | código pronto (3.1 a 3.7; 3.4 em parte) | 20/10/2026 | Menu em 4 grupos + rodapé numa fonte só (`src/lib/nav.ts`), abas Guardar / Contas e cartões / Orçamento do mês (`SectionTabs`), barra do celular com Comprar, Categorias dentro de Configurações, "Despesas" virou "Dívidas", `/dividas` liberada no Essencial (D2 aplicada pela recomendação). Início ganhou atalhos de compras e dívidas; o Início enxuto do modo pessoal (3.4) ficou só nisso: o resto do painel continua igual. |
| 4 — Comprar | código pronto; migration `20261020030000` **aplicada** em 20/10/2026 e testada (finalizar 2x gera 1 lançamento, o não marcado vai para lista nova, quem é de fora da casa não vê nem insere) | 20/10/2026 | `/comprar` (lista rápida com vários itens, sugestões, estimado × carrinho, quanto cabe em Alimentação, sinal fraco com nova tentativa, finalizar em um lançamento sem duplicar via `finish_shopping_list`). **Ficava para a fase do WhatsApp/Jaki (cancelada; pode virar ação do Chat da Jaki no app):** ação `shopping_add` e as perguntas "o que falta comprar?". Testes de RLS (casa × fora da casa) só rodam depois da migration. |
| 5 — Sair do vermelho + guardar | código pronto; migration `20261020040000` **aplicada** em 20/10/2026 em 4 partes e testada (acordo gera parcelas, baixa abate a dívida e a última marca quitada). **Ajuste:** a confirmação do banco para `DELETE` foi cancelada 3 vezes, então `register_debt_agreement` não apaga parcelas: se já há parcelas pendentes do acordo, pede para dar baixa ou excluir em Contas a pagar antes de refazer | 20/10/2026 | Motor em código (`src/lib/debtPlan.ts`, bate com a conta à mão e com o `projectPayoff`), rota `POST /api/debts/plan` (IA só redige e o texto é descartado se tiver número fora do plano ou frase proibida), acordo vira parcelas em Contas a pagar e dar baixa abate a dívida na mesma transação, mini-reserva, sequência de meses, conquistas e sugestão da sobra do mês em Guardar. **Não feito de propósito:** prazo legal da negativação (só com fonte oficial conferida pelo fundador) e comemoração no WhatsApp (cancelada com o WhatsApp). |
| 6 — Foto, áudio e boleto | **Parte do WhatsApp CANCELADA em 23/10/2026.** Foto e PDF continuam dentro do app, em Importar (já existe). Áudio e boleto: sem decisão, só se voltarem como funções do app. | 23/10/2026 | |
| 7 — Parcelas e cartões | código pronto (7.0 a 7.4), falta ver com dados reais; 7.5 (Jaki responder sobre parcelas) fica para depois da Fase 2 | 20/10/2026 | `tsc` e `npm run build` sem erro. Motor `src/lib/installments.ts` testado (agrupa, projeta 12 meses, calcula alívio, gera parcelas faltantes). Tela `/parcelamentos` (atalho em Cartões, menu e barra lateral). Aviso de última parcela entra no lembrete diário existente (sem migration e sem tabela nova). Importação de fatura já detecta "3/10" e agora a tela oferece "lançar as que faltam" (mesma chave `inst:grupo:n`, não duplica). |
| 8 — Simulador de viagem | código pronto (8.1 a 8.4); 8.5 (Jaki monta rascunho) ficava para a fase do WhatsApp, cancelada | 20/10/2026 | `/viagem` (aba em Guardar): custos por categoria + folga editável, quanto guardar por mês, cabe na sobra média dos últimos 3 meses, 4 cenários, efeito do parcelamento junto com as parcelas da Fase 7, criar objetivo de viagem. Engine em `src/lib/trip.ts` testado. Valores são estimativas da pessoa. |
| 9 — Contas e ícones (Open Finance fica para o futuro, sem custo agora) | código pronto (9.1 a 9.3); migration `20261020050000` **aplicada** em 20/10/2026 | 20/10/2026 | Selo por cor + iniciais (`src/lib/institutions.ts`, `InstitutionBadge`) em Contas, Cartões, Início e Parcelamentos; contas sem escolha deduzem pelo nome. Sem logo imitado e sem serviço pago. 9.4 (Open Finance) não iniciado, como combinado. |
| 10 — Piloto, métricas e preço | pendente | | |

### Pendências da Fase 1

Canceladas em 23/10/2026. As migrations `20261020010000_whatsapp_reply_status` (aplicada) e `20261020020000_whatsapp_retention` (nunca aplicada; arquivos apagados) deixam de importar: a limpeza do que existe no banco está em `supabase/migrations/20261023020000_remove_whatsapp_assistant.sql`, **ainda não aplicada**, que depende de aprovação do fundador.

---

## Fontes

- Manus — "Jakash: avaliação crítica e plano de evolução" (20/10/2026). As referências citadas nele incluem: [Mobills PRO](https://mobills.zendesk.com/hc/pt-br/articles/39727734628251-Tudo-sobre-o-Mobills-PRO), [Termos do Mobills](https://www.mobills.com.br/privacidade-e-termos/termos-de-uso/), [Organizze, preços](https://ajuda.organizze.com.br/hc/pt-br/articles/5661263190035-Conhe%C3%A7a-nossos-pre%C3%A7os-e-assinaturas), [Minhas Economias](https://faq.minhaseconomias.com.br/hc/pt-br/articles/35615401810715-Qual-o-valor-e-forma-de-pagamento-da-assinatura-Meu-Clube), [ZapGastos](https://zapgastos.com/), [Jota](https://jota.ai/), [Meu Assessor](https://meuassessor.com/), [IBGE, MEIs em 2022](https://agenciadenoticias.ibge.gov.br/agencia-noticias/2012-agencia-de-noticias/noticias/41046-em-2022-brasil-tinha-14-6-milhoes-de-microempreendedores-individuais), [ANPD, direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares)
- Manus — "Guia para Claude: conectar o Jakash à API oficial WhatsApp" (20/10/2026): [Webhooks da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview), [Criar o endpoint do webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint), [Mensagens e janela de 24 h](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages), [Preços da plataforma](https://whatsappbusiness.com/products/platform-pricing/)
- Pesquisa do Claude: [Mobills — 11 apps de controle financeiro para 2026](https://www.mobills.com.br/blog/apps-de-controle-financeiro/), [Data Hackers — Porquim IA](https://www.datahackers.news/p/porquim-ia-a-intelig-ncia-artificial-que-organiza-suas-finan-as-no-whatsapp)
