// Regressões das correções da auditoria de 23/10/2026 (run-2): teste vencido, push e categorias padrão.
// Rodar: npm run test:security
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntitled } from "../src/lib/entitlements";
import { isValidPushEndpoint } from "../src/lib/push";

let pass = 0;
const t = (name: string, fn: () => void) => { try { fn(); pass++; } catch (e) { console.error(`FALHOU: ${name}`); throw e; } };
const past = new Date(Date.now() - 60_000).toISOString();
const future = new Date(Date.now() + 86_400_000).toISOString();
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

t("teste vencido não dá acesso", () => assert.equal(isEntitled({ plan: "cpf", status: "trial", expiresAt: past, viaOwner: false }), false));
t("teste no prazo dá acesso", () => assert.equal(isEntitled({ plan: "cpf", status: "trial", expiresAt: future, viaOwner: false }), true));
t("cancelado não dá acesso", () => assert.equal(isEntitled({ plan: "cpf", status: "canceled", expiresAt: future, viaOwner: false }), false));
t("chat e importação usam isEntitled", () => {
  for (const f of ["src/app/api/chat/route.ts", "src/app/api/import/extract/route.ts"]) {
    const s = read(f);
    assert.ok(s.includes("isEntitled("), f);
    assert.ok(!s.includes("ALLOWED_STATUS"), f);
  }
});

t("push aceita os serviços dos navegadores", () => {
  for (const u of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QAbc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ]) assert.equal(isValidPushEndpoint(u), true, u);
});
t("push recusa qualquer outro endereço", () => {
  for (const u of [
    "https://silent.attacker.example.com/push/x",
    "https://169.254.169.254.nip.io/x",
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/fcm/send/abc",
    "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://127.0.0.1;.evil.example/p",
    "nada",
  ]) assert.equal(isValidPushEndpoint(u), false, u);
});
t("envio de push tem prazo e o cron tem prazo por usuário", () => {
  assert.match(read("src/lib/push.ts"), /timeout: SEND_TIMEOUT_MS/);
  assert.match(read("src/app/api/cron/reminders/route.ts"), /withDeadline\(notify\(p\), left\)/);
});

t("checkout não dá segundo teste grátis", () => {
  const s = read("src/app/api/asaas/checkout/route.ts");
  assert.match(s, /const trialUsed = Boolean\(profile\.asaas_subscription_id\)/);
  assert.match(s, /trialDays > 0 \? 'trial' : 'unpaid'/);
});
t("excluir conta exige cancelamento confirmado", () => {
  const s = read("src/app/api/account/delete/route.ts");
  assert.match(s, /if \(!cancelled && asaasLive\)/);
});
t("categoria padrão só vem do app", () => {
  const s = read("supabase/migrations/20261024010000_categories_default_guard.sql");
  assert.match(s, /CHECK \(NOT is_default OR user_id IS NULL\)/);
  assert.match(s, /WITH CHECK \(auth\.uid\(\) = user_id AND is_default = false\)/);
});

console.log(`security-fixes: ${pass} ok`);
