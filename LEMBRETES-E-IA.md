# Lembretes automáticos, Chat da Jaki e gestão compartilhada — como ligar

## 1. Lembretes automáticos (vencimentos)

Todo dia às 8h (horário de Brasília) a Vercel chama `GET /api/cron/reminders` (configurado em `vercel.json`).
Para cada usuário com notificações ligadas e assinatura em dia (ou teste ainda válido), a rota junta o que vence em
**hoje + N dias** (N vem de *Configurações › Notificações › Quando notificar*): contas a pagar, contas a receber e
faturas de cartão em aberto. Na gestão compartilhada entram também os vencimentos da outra pessoa.
Os canais são **push no aparelho** e **e-mail**. É enviado **um aviso por canal por dia** (a tabela `notification_log` impede repetição, mesmo se o cron rodar duas vezes).

### Variáveis na Vercel
| Variável | Para quê |
|---|---|
| `CRON_SECRET` | Obrigatória. Texto longo e aleatório. A Vercel o manda como `Authorization: Bearer ...` ao chamar o cron. Sem ela a rota responde 503. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Push no aparelho (grátis). Gere com `npx web-push generate-vapid-keys`. A chave pública é lida no build: depois de cadastrar, faça um novo deploy. |
| `RESEND_API_KEY`, `EMAIL_FROM` | E-mail pela Resend (plano grátis cobre começo). O domínio do `EMAIL_FROM` precisa estar verificado lá. |

Canais sem variável configurada são simplesmente ignorados. Sem nenhum canal, a rota responde `Nenhum canal configurado`.

### Testar
```bash
# Só calcula quem receberia (não envia nem registra nada):
curl -H "Authorization: Bearer $CRON_SECRET" "https://www.jakash.app/api/cron/reminders?dry=1"
# Executa de verdade (o mesmo que o cron faz):
curl -H "Authorization: Bearer $CRON_SECRET" "https://www.jakash.app/api/cron/reminders"
```
A resposta traz só contagens (elegíveis, com vencimento, enviados/falhas por canal), sem dados pessoais.
O aviso no aparelho tem botão **Enviar teste** em *Configurações › Notificações*.

### Limites e observações
- No plano Hobby da Vercel o cron roda no máximo 1×/dia e pode sair em qualquer minuto da hora marcada (8h–8h59).
- Push no iPhone/iPad só funciona com o app instalado na Tela de Início (Compartilhar › Adicionar à Tela de Início).
- A rota processa até ~50 s por execução; com muitos usuários, divida o envio (rodar o cron mais de uma vez por dia exige plano Pro).

## 2. Chat IA (custo controlado)

Tela **Chat da Jaki** (`/chat`) e rota `POST /api/chat` (modelo `gpt-4o-mini` por padrão; `OPENAI_API_KEY` obrigatória).
Controles de custo:
- limite por usuário por dia (`AI_CHAT_DAILY_LIMIT`; padrão 30, MEI 60), reservado **antes** de chamar a IA e devolvido se a chamada falhar;
- só assinatura em teste, ativa ou com pagamento atrasado;
- mensagem de até 500 caracteres, últimas 8 mensagens de contexto, resposta de até 600 tokens;
- o contexto financeiro é montado no servidor com a sessão do usuário (as regras de acesso do banco continuam valendo);
- a IA nunca grava sozinha: lançamentos sugeridos só entram depois do botão **Confirmar**;
- a IA não recomenda investimentos nem crédito.

Não é custo zero: cada mensagem custa uma fração de centavo na OpenAI. O limite diário é o teto.

## 3. Gestão compartilhada (casal)

*Configurações › Gestão compartilhada*: uma pessoa gera um código (vale 48 h) e a outra aceita.
As duas passam a ver e editar contas bancárias, lançamentos, cartões, contas a pagar, limites, objetivos, dívidas e investimentos
uma da outra, com a etiqueta de quem lançou. **Perfil, assinatura e conversas do chat continuam privados.**
Encerrar a qualquer momento: nada é apagado, cada um volta a ver só o que é seu. Se as duas pessoas tinham limite para a mesma categoria, vale o de quem convidou.

## 4. Banco de dados

Migrações novas (já aplicadas no projeto Supabase e versionadas em `supabase/migrations/`):
`20261015000000_partnerships`, `20261015010000_cards_investments`, `20261015020000_shared_policies_balances`,
`20261015030000_notifications_ai_accent`, `20261015040000_reminders_helpers`.


## Importar extrato, Pacote MEI, Planejamento e Crescimento

- **Importar extrato** (`/importar`): OFX e CSV (PDF de fatura não é suportado). Categorias aprendem com o que o usuário já lançou; duplicatas são ignoradas por `import_key`.
- **Pacote MEI** (`/mei`): aparece para perfis empresarial/ambos. Limite anual R$ 81.000 (editável), DAS dia 20, DASN-SIMEI até 31/05, relatório mensal em PDF (`/mei/relatorio`), QR Pix estático, link somente-leitura para o contador (`/contador/<token>`, expira). Se houver middleware próprio, libere `/contador/*`, `/api/contador/*`, `/api/cron/*` e `/sw.js`.
- **Planejamento** (`/planejamento`): compromissos dos próximos 6 meses, "quanto posso gastar hoje", fluxo de caixa projetado, assinaturas detectadas e estratégia de dívidas.
- **Indicação** (`/configuracoes/indicar`): código/link; mês grátis para os dois só é aplicado automaticamente com `REFERRAL_APPLY_REWARDS=1`.
- **Insight mensal**: cron `/api/cron/insights` (dia 1, 12h UTC). Números calculados em código; a IA só escreve as dicas (uma chamada por usuário por mês).
