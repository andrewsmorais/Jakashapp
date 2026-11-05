# Remover o assistente do WhatsApp: passos do fundador

Decisão de 23/10/2026: o Jakash não terá mais assistente no WhatsApp (a Meta cobra por resposta).
O código já foi removido na branch `remove-whatsapp-agent`. Falta o que só você pode fazer.

## 1. Publicar o código novo
Revise e faça o merge da branch `remove-whatsapp-agent` em `main` (a branch antiga `fase-2-whatsapp` está abandonada: não faça merge dela).
Faça isso **antes** da migration (passo 4).

## 2. Vercel: apagar as variáveis (só os nomes)
- `WHATSAPP_BOT_NUMBER`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `META_APP_SECRET`
- `WORKER_SECRET`
- `WHATSAPP_REMINDER_TEMPLATE`
- `WHATSAPP_REMINDER_LANG`
- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_DAILY_LIMIT` (se existir)

## 3. Painel da Meta
- No app da Meta, desligue a assinatura do webhook do WhatsApp e remova a URL de callback (`/api/whatsapp/webhook`).
- **Não apague** a conta do WhatsApp Business nem o número. Ele pode virar o canal de suporte.
- Se quiser, apague os modelos de mensagem (templates) de lembrete. Sem webhook e sem token, eles não são mais usados.

## 4. Supabase: aplicar a migration (só depois de aprovar)
Arquivo: `supabase/migrations/20261023020000_remove_whatsapp_assistant.sql` (e `_down.sql`, que recria só as estruturas vazias).

**Apaga dados para sempre:** fila de mensagens (`whatsapp_inbox`), códigos de vínculo, números de WhatsApp dos perfis,
a preferência `notify_whatsapp` e o vínculo dos lançamentos com a mensagem de origem. Os lançamentos continuam.
O custo de WhatsApp que você lançou em `admin_costs` é somado em "outros" (o lucro líquido não muda).
Rode primeiro em um branch do Supabase, se puder. O arquivo pode ser rodado mais de uma vez.

## 5. Supabase Vault
Depois da migration, em Project Settings > Vault, apague os segredos `WORKER_SECRET` e `nextjs_worker_url`.
Em Database > Cron Jobs, confira que não sobrou nenhum job com "whatsapp" no nome (a migration tenta remover sozinha).

## 6. Opcional: link de suporte no WhatsApp
Se quiser mostrar "Suporte no WhatsApp" em `/contato` e em Configurações, cadastre na Vercel:
`NEXT_PUBLIC_SUPPORT_WHATSAPP` com só números, DDI + DDD + número (ex.: `5512999999999`), e faça um novo deploy.
É um link comum (`wa.me`) que abre o WhatsApp da pessoa. Sem a variável, o link não aparece.
