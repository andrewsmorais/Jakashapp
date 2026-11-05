import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { b64url, decodeJwsPayload, normalizePem } from '@/lib/jwtEs256';
import {
  buildAppStoreJwt, billingEventFor, checkTransaction, hasLiveAsaasSubscription, mapAppleStatus, profilePatchFromStatuses,
  type AppleTransaction,
} from '@/lib/appleIap';
import { apnsBundleId, buildApnsBody, buildApnsJwt, classifyApnsResponse, isValidApnsToken } from '@/lib/apns';
import { buildNativeDeepLink, isNativeUserAgent, parseNativeCallback, samePathOnly } from '@/lib/native';
import { safeNext } from '@/lib/authUtil';
import { PLANS, PLAN_FEATURES, PLAN_IDS, aiDailyLimit, canonicalPlan, isPlanId, memberLimit, planFromAppleProduct, planFromValue } from '@/lib/plans';

// Testes do app iOS (sem rede e sem banco). Rodar: npx tsx --tsconfig tsconfig.json tests/ios-app.test.ts
let passed = 0;
const ok = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { console.error(`FALHOU: ${name}\n`, e); process.exitCode = 1; }
};

const jws = (payload: unknown) => `${b64url(JSON.stringify({ alg: 'ES256' }))}.${b64url(JSON.stringify(payload))}.${b64url('assinatura')}`;

// Chave de mentira (P-256), só para estes testes.
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

function parseJwt(jwt: string) {
  const [h, p, s] = jwt.split('.');
  return { header: JSON.parse(Buffer.from(h, 'base64url').toString()), payload: JSON.parse(Buffer.from(p, 'base64url').toString()), sig: Buffer.from(s, 'base64url'), signingInput: `${h}.${p}` };
}
const signatureValid = (jwt: string) => {
  const { signingInput, sig } = parseJwt(jwt);
  return verify('sha256', Buffer.from(signingInput), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig);
};

// ---------------------------------------------------------------------------
// Leitura do payload JWS
// ---------------------------------------------------------------------------
ok('decodeJwsPayload lê o payload base64url (com acentos)', () => {
  assert.deepEqual(decodeJwsPayload(jws({ productId: 'jakash.empresarial.mensal', nome: 'Cobrança', n: 1 })), { productId: 'jakash.empresarial.mensal', nome: 'Cobrança', n: 1 });
});
ok('decodeJwsPayload recusa lixo', () => {
  for (const bad of [undefined, null, 42, '', 'a.b', 'a.b.c.d', 'a..c', 'a.%%%.c', `a.${b64url('[1,2]')}.c`, `a.${b64url('"texto"')}.c`, `a.${b64url('{quebrado')}.c`]) {
    assert.equal(decodeJwsPayload(bad), null, String(bad));
  }
});
ok('normalizePem aceita \\n escrito como texto', () => {
  assert.equal(normalizePem('-----BEGIN X-----\\nAAA\\n-----END X-----'), '-----BEGIN X-----\nAAA\n-----END X-----\n');
});

// ---------------------------------------------------------------------------
// Estado da Apple -> perfil
// ---------------------------------------------------------------------------
ok('mapAppleStatus: 1 ativa; 3 e 4 em atraso; 2 e 5 cancelada; resto ignora', () => {
  assert.equal(mapAppleStatus(1), 'active');
  assert.equal(mapAppleStatus(3), 'past_due');
  assert.equal(mapAppleStatus(4), 'past_due');
  assert.equal(mapAppleStatus(2), 'canceled');
  assert.equal(mapAppleStatus(5), 'canceled');
  for (const x of [0, 6, -1, null, undefined, 'x']) assert.equal(mapAppleStatus(x), null);
  assert.equal(mapAppleStatus('1'), 'active'); // a API pode mandar número como texto
});

const USER = '3f2b8c1e-9d4a-4c55-8a1f-0b6e2d7c9a10';
const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);
const goodTx = (over: Partial<AppleTransaction> = {}): AppleTransaction => ({
  bundleId: 'com.jakash.app', productId: 'jakash.pessoal.mensal', transactionId: '2000000111', originalTransactionId: '2000000100',
  appAccountToken: USER, expiresDate: NOW + 30 * 86400_000, environment: 'Sandbox', ...over,
});

ok('checkTransaction aceita compra válida e mapeia o plano', () => {
  const r = checkTransaction(goodTx(), USER, NOW);
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.plan, 'cpf'); assert.equal(r.originalTransactionId, '2000000100'); assert.equal(r.expiresAt, new Date(NOW + 30 * 86400_000).toISOString()); }
});
ok('checkTransaction aceita appAccountToken em maiúsculas', () => {
  assert.equal(checkTransaction(goodTx({ appAccountToken: USER.toUpperCase() }), USER, NOW).ok, true);
});
ok('checkTransaction recusa pacote, produto, conta, estorno, vencida e incompleta', () => {
  const reason = (tx: AppleTransaction | null) => { const r = checkTransaction(tx, USER, NOW); return r.ok ? 'ok' : r.reason; };
  assert.equal(reason(goodTx({ bundleId: 'com.outro.app' })), 'bundle');
  assert.equal(reason(goodTx({ productId: 'outro.produto' })), 'product');
  assert.equal(reason(goodTx({ appAccountToken: '11111111-1111-4111-8111-111111111111' })), 'account');
  assert.equal(reason(goodTx({ appAccountToken: undefined })), 'account');
  assert.equal(reason(goodTx({ revocationDate: NOW - 1000 })), 'revoked');
  assert.equal(reason(goodTx({ expiresDate: NOW - 1 })), 'expired');
  assert.equal(reason(goodTx({ expiresDate: NOW })), 'expired');
  assert.equal(reason(goodTx({ expiresDate: undefined })), 'incomplete');
  assert.equal(reason(goodTx({ originalTransactionId: undefined })), 'incomplete');
  assert.equal(reason(null), 'incomplete');
});
ok('produtos da Apple <-> planos', () => {
  assert.equal(planFromAppleProduct('jakash.pessoal.mensal'), 'cpf');
  assert.equal(planFromAppleProduct('jakash.empresarial.mensal'), 'mei');
  // Produtos dos planos antigos (Essencial, Família, MEI) não existem mais na loja.
  for (const old of ['jakash.essencial.mensal', 'jakash.familia.mensal', 'jakash.mei.mensal', 'jakash.empresarial.anual']) assert.equal(planFromAppleProduct(old), null, old);
  assert.equal(new Set(PLAN_IDS.map((id) => PLANS[id].appleProductId)).size, PLAN_IDS.length);
});

const statusResp = (status: number, tx: AppleTransaction) => ({
  environment: 'Sandbox', bundleId: 'com.jakash.app',
  data: [{ lastTransactions: [{ status, originalTransactionId: tx.originalTransactionId, signedTransactionInfo: jws(tx) }] }],
});
ok('profilePatchFromStatuses: ativa, atraso e cancelada', () => {
  const tx = goodTx({ productId: 'jakash.empresarial.mensal' });
  const a = profilePatchFromStatuses(statusResp(1, tx), '2000000100');
  assert.deepEqual(a?.patch, { subscription_status: 'active', subscription_expires_at: new Date(tx.expiresDate as number).toISOString(), subscription_plan: 'mei', billing_provider: 'apple' });
  assert.equal(profilePatchFromStatuses(statusResp(4, tx), '2000000100')?.patch.subscription_status, 'past_due');
  assert.equal(profilePatchFromStatuses(statusResp(3, tx), '2000000100')?.patch.subscription_status, 'past_due');
  assert.equal(profilePatchFromStatuses(statusResp(2, tx), '2000000100')?.patch.subscription_status, 'canceled');
  assert.equal(profilePatchFromStatuses(statusResp(5, tx), '2000000100')?.patch.subscription_status, 'canceled');
});
ok('profilePatchFromStatuses: ignora outra assinatura, outro pacote, status desconhecido e produto desconhecido não troca o plano', () => {
  const tx = goodTx();
  assert.equal(profilePatchFromStatuses(statusResp(1, tx), '999'), null);
  assert.equal(profilePatchFromStatuses({ ...statusResp(1, tx), bundleId: 'com.outro' }, '2000000100'), null);
  assert.equal(profilePatchFromStatuses(statusResp(9, tx), '2000000100'), null);
  assert.equal(profilePatchFromStatuses({}, '2000000100'), null);
  const unknown = profilePatchFromStatuses(statusResp(1, goodTx({ productId: 'x.y' })), '2000000100');
  assert.equal(unknown?.patch.subscription_plan, undefined);
});
ok('billingEventFor', () => {
  assert.deepEqual(billingEventFor(1, 'cpf'), { kind: 'paid', amount: 19.9 });
  assert.deepEqual(billingEventFor(5, 'mei'), { kind: 'refunded', amount: 39.9 });
  assert.deepEqual(billingEventFor(2, 'mei'), { kind: 'canceled', amount: 0 });
  assert.deepEqual(billingEventFor(4, null), { kind: 'overdue', amount: 0 });
  assert.equal(billingEventFor(7, 'cpf'), null);
});
ok('hasLiveAsaasSubscription', () => {
  const future = new Date(NOW + 86400_000).toISOString();
  const past = new Date(NOW - 86400_000).toISOString();
  assert.equal(hasLiveAsaasSubscription({ asaas_subscription_id: 'sub_1', subscription_status: 'active' }, NOW), true);
  assert.equal(hasLiveAsaasSubscription({ asaas_subscription_id: 'sub_1', subscription_status: 'past_due' }, NOW), true);
  assert.equal(hasLiveAsaasSubscription({ asaas_subscription_id: 'sub_1', subscription_status: 'trial', subscription_expires_at: future }, NOW), true);
  assert.equal(hasLiveAsaasSubscription({ asaas_subscription_id: 'sub_1', subscription_status: 'trial', subscription_expires_at: past }, NOW), false);
  assert.equal(hasLiveAsaasSubscription({ asaas_subscription_id: 'sub_1', subscription_status: 'canceled' }, NOW), false);
  assert.equal(hasLiveAsaasSubscription({ asaas_subscription_id: null, subscription_status: 'active' }, NOW), false);
  assert.equal(hasLiveAsaasSubscription({ asaas_subscription_id: 'sub_1', subscription_status: 'active', billing_provider: 'apple' }, NOW), false);
  assert.equal(hasLiveAsaasSubscription(null, NOW), false);
});

// ---------------------------------------------------------------------------
// JWTs ES256 (APNs e App Store Server API)
// ---------------------------------------------------------------------------
ok('JWT do APNs: header {alg, kid}, claims {iss, iat}, assinatura de 64 bytes que confere', () => {
  const jwt = buildApnsJwt({ keyId: 'ABC123DEFG', teamId: '3V989HNC76', keyPem: PEM, now: 1_800_000_000_000 });
  const t = parseJwt(jwt);
  assert.equal(jwt.split('.').length, 3);
  assert.equal(t.header.alg, 'ES256');
  assert.equal(t.header.kid, 'ABC123DEFG');
  assert.deepEqual(t.payload, { iss: '3V989HNC76', iat: 1_800_000_000 });
  assert.equal(t.sig.length, 64);
  assert.equal(signatureValid(jwt), true);
});
ok('JWT do APNs: assinatura não confere se o conteúdo mudar', () => {
  const jwt = buildApnsJwt({ keyId: 'K', teamId: 'T', keyPem: PEM });
  const [h, , s] = jwt.split('.');
  assert.equal(signatureValid(`${h}.${b64url(JSON.stringify({ iss: 'outro', iat: 1 }))}.${s}`), false);
});
ok('JWT da App Store Server API: kid, iss, iat, exp <= 60 min, aud e bid', () => {
  const now = 1_800_000_000_000;
  const jwt = buildAppStoreJwt({ keyId: 'KEY1234567', issuerId: '69a6de70-0000-47e3-e053-5b8c7c11a4d1', bundleId: 'com.jakash.app', keyPem: PEM, now });
  const t = parseJwt(jwt);
  assert.equal(t.header.alg, 'ES256');
  assert.equal(t.header.kid, 'KEY1234567');
  assert.equal(t.payload.iss, '69a6de70-0000-47e3-e053-5b8c7c11a4d1');
  assert.equal(t.payload.aud, 'appstoreconnect-v1');
  assert.equal(t.payload.bid, 'com.jakash.app');
  assert.equal(t.payload.iat, 1_800_000_000);
  assert.ok(t.payload.exp > t.payload.iat && t.payload.exp - t.payload.iat <= 3600);
  assert.equal(signatureValid(jwt), true);
  const longer = parseJwt(buildAppStoreJwt({ keyId: 'K', issuerId: 'I', bundleId: 'b', keyPem: PEM, now, ttlSeconds: 99999 }));
  assert.ok(longer.payload.exp - longer.payload.iat <= 3600);
});

// ---------------------------------------------------------------------------
// APNs: token, corpo e resposta
// ---------------------------------------------------------------------------
ok('token do APNs: hexadecimal minúsculo de 64 a 200 caracteres', () => {
  assert.equal(isValidApnsToken('a'.repeat(64)), true);
  assert.equal(isValidApnsToken('0123456789abcdef'.repeat(8)), true);
  assert.equal(isValidApnsToken('a'.repeat(200)), true);
  assert.equal(isValidApnsToken('a'.repeat(63)), false);
  assert.equal(isValidApnsToken('a'.repeat(201)), false);
  assert.equal(isValidApnsToken('g'.repeat(64)), false);
  assert.equal(isValidApnsToken('A'.repeat(64)), false);
  assert.equal(isValidApnsToken(`${'a'.repeat(64)}/../x`), false);
  assert.equal(isValidApnsToken(123), false);
});
ok('corpo do APNs: aps.alert + url fora de aps', () => {
  const b = JSON.parse(buildApnsBody({ title: 'Jakash · Contas', body: 'Você tem 2 contas', url: '/contas', tag: 'jakash-2026-10-23' }));
  assert.equal(b.aps.alert.title, 'Jakash · Contas');
  assert.equal(b.aps.alert.body, 'Você tem 2 contas');
  assert.equal(b.aps.sound, 'default');
  assert.equal(b.aps['thread-id'], 'jakash-2026-10-23');
  assert.equal(b.url, '/contas');
  assert.equal(JSON.parse(buildApnsBody({ title: 't', body: 'b' })).url, undefined);
});
ok('resposta do APNs: 410 e BadDeviceToken apagam o token; o resto só falha', () => {
  assert.equal(classifyApnsResponse(200), 'ok');
  assert.equal(classifyApnsResponse(410, 'Unregistered'), 'gone');
  assert.equal(classifyApnsResponse(400, 'BadDeviceToken'), 'gone');
  assert.equal(classifyApnsResponse(400, 'PayloadEmpty'), 'error');
  assert.equal(classifyApnsResponse(403, 'InvalidProviderToken'), 'error');
  assert.equal(classifyApnsResponse(429, 'TooManyRequests'), 'error');
  assert.equal(classifyApnsResponse(500), 'error');
});
ok('bundle do APNs tem padrão com.jakash.app', () => {
  const old = process.env.APNS_BUNDLE_ID;
  delete process.env.APNS_BUNDLE_ID;
  assert.equal(apnsBundleId(), 'com.jakash.app');
  if (old !== undefined) process.env.APNS_BUNDLE_ID = old;
});

// ---------------------------------------------------------------------------
// Detecção do app e volta do login (/auth/native)
// ---------------------------------------------------------------------------
ok('isNativeUserAgent reconhece o app pelo User-Agent', () => {
  assert.equal(isNativeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 JakashApp/1 (iOS)'), true);
  assert.equal(isNativeUserAgent('JakashApp/2 (iOS)'), true);
  assert.equal(isNativeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'), false);
  assert.equal(isNativeUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120'), false);
  assert.equal(isNativeUserAgent(''), false);
  assert.equal(isNativeUserAgent(null), false);
  assert.equal(isNativeUserAgent(undefined), false);
});
ok('safeNext só aceita caminhos do próprio site', () => {
  assert.equal(safeNext('/contas?mes=10'), '/contas?mes=10');
  for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', 'evil.com', '', null, undefined, '/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/\u0000x']) {
    assert.equal(safeNext(bad as string | null | undefined), '/dashboard', String(bad));
  }
});
ok('/auth/native: link jakash:// só com código válido e next validado', () => {
  const link = buildNativeDeepLink('abc123-DEF_456.xyz~', '/contas');
  assert.ok(link);
  const u = new URL(link as string);
  assert.equal(u.protocol, 'jakash:');
  assert.equal(u.hostname, 'auth');
  assert.equal(u.pathname, '/callback');
  assert.equal(u.searchParams.get('code'), 'abc123-DEF_456.xyz~');
  assert.equal(u.searchParams.get('next'), '/contas');
  assert.equal(new URL(buildNativeDeepLink('abcdefgh12', 'https://evil.com') as string).searchParams.get('next'), '/dashboard');
  assert.equal(new URL(buildNativeDeepLink('abcdefgh12', undefined) as string).searchParams.get('next'), '/dashboard');
  assert.equal(buildNativeDeepLink(undefined, '/x'), null);
  assert.equal(buildNativeDeepLink('', '/x'), null);
  assert.equal(buildNativeDeepLink('curto', '/x'), null);
  assert.equal(buildNativeDeepLink('tem espaço e <script>', '/x'), null);
  assert.equal(buildNativeDeepLink('a'.repeat(601), '/x'), null);
});
ok('appUrlOpen: só jakash://auth/callback vira /auth/callback do site', () => {
  assert.equal(parseNativeCallback('jakash://auth/callback?code=abcdefgh12&next=%2Fcontas'), 'https://www.jakash.app/auth/callback?code=abcdefgh12&next=%2Fcontas');
  assert.equal(parseNativeCallback('jakash://auth/callback?code=abcdefgh12&next=https%3A%2F%2Fevil.com'), 'https://www.jakash.app/auth/callback?code=abcdefgh12&next=%2Fdashboard');
  assert.equal(parseNativeCallback('jakash://auth/callback?code=abcdefgh12'), 'https://www.jakash.app/auth/callback?code=abcdefgh12&next=%2Fdashboard');
  for (const bad of [
    null, undefined, '', 'nao e url', 'https://www.jakash.app/auth/callback?code=abcdefgh12', 'jakash://outra/coisa?code=abcdefgh12',
    'jakash://auth/outro?code=abcdefgh12', 'jakash://auth/callback', 'jakash://auth/callback?code=x', 'jakash://evil.com/callback?code=abcdefgh12',
  ]) assert.equal(parseNativeCallback(bad), null, String(bad));
});
ok('toque em notificação: só caminhos do site', () => {
  assert.equal(samePathOnly('/contas'), '/contas');
  assert.equal(samePathOnly('/configuracoes/notificacoes'), '/configuracoes/notificacoes');
  for (const bad of ['https://evil.com', '//evil.com', 'contas', '', undefined, null, 5, '/' + 'a'.repeat(600)]) assert.equal(samePathOnly(bad), null, String(bad));
});

// ---------------------------------------------------------------------------
// Planos: Pessoal (cpf) e Empresarial (mei); 'familia' deixou de ser vendido mas ainda vale como cpf
// ---------------------------------------------------------------------------
ok('planos à venda: só Pessoal (cpf) e Empresarial (mei), com preço, nome e produto da Apple', () => {
  assert.deepEqual(PLAN_IDS, ['cpf', 'mei']);
  assert.deepEqual({ name: PLANS.cpf.name, value: PLANS.cpf.value, members: PLANS.cpf.members, aiDaily: PLANS.cpf.aiDaily, apple: PLANS.cpf.appleProductId },
    { name: 'Jakash Pessoal', value: 19.9, members: 3, aiDaily: 40, apple: 'jakash.pessoal.mensal' });
  assert.deepEqual({ name: PLANS.mei.name, value: PLANS.mei.value, members: PLANS.mei.members, aiDaily: PLANS.mei.aiDaily, apple: PLANS.mei.appleProductId },
    { name: 'Jakash Empresarial', value: 39.9, members: 3, aiDaily: 60, apple: 'jakash.empresarial.mensal' });
  assert.equal(planFromValue(19.9), 'cpf');
  assert.equal(planFromValue(39.9), 'mei');
  assert.equal(planFromValue(29.9), null);
});
ok('checkout só aceita cpf ou mei (isPlanId); familia e lixo são recusados', () => {
  assert.equal(isPlanId('cpf'), true);
  assert.equal(isPlanId('mei'), true);
  for (const bad of ['familia', 'cnpj', 'zap', '', undefined, null, 1, {}]) assert.equal(isPlanId(bad), false, String(bad));
});
ok("'familia' gravado no perfil vale como cpf (3 pessoas, mesmo limite de IA)", () => {
  assert.equal(canonicalPlan('familia'), 'cpf');
  assert.equal(canonicalPlan('cpf'), 'cpf');
  assert.equal(canonicalPlan('mei'), 'mei');
  for (const unknown of ['zap', 'piloto', 'cnpj', '', undefined, null, 'toString']) assert.equal(canonicalPlan(unknown), null, String(unknown));
  assert.equal(memberLimit('familia'), 3);
  assert.equal(memberLimit('cpf'), 3);
  assert.equal(memberLimit('mei'), 3);
  assert.equal(memberLimit(null), 3);
  const saved = process.env.AI_CHAT_DAILY_LIMIT;
  delete process.env.AI_CHAT_DAILY_LIMIT;
  try {
    assert.equal(aiDailyLimit('familia'), aiDailyLimit('cpf'));
    assert.equal(aiDailyLimit('cpf'), 40);
    assert.equal(aiDailyLimit('mei'), 60);
    assert.equal(aiDailyLimit('cnpj'), 60);
  } finally {
    if (saved !== undefined) process.env.AI_CHAT_DAILY_LIMIT = saved;
  }
});
ok('listas de venda: Pessoal tem as telas pessoais; Empresarial é Pessoal + pacote MEI; ninguém cita planos antigos', () => {
  const text = (id: 'cpf' | 'mei') => PLAN_FEATURES[id].join(' | ');
  for (const must of ['voz', 'extrato', 'Cartões', 'Limites', 'Dívidas', 'Investimentos', 'planejamento', 'Chat da Jaki', 'Motorista de app', 'até 3 pessoas', 'subcategorias']) {
    assert.ok(text('cpf').includes(must), `Pessoal sem "${must}"`);
  }
  assert.ok(PLAN_FEATURES.mei[0].includes('Pessoal'));
  for (const must of ['limite anual', 'DAS e DASN', 'Clientes', 'Pix', 'Recibos', 'Calculadora de preço', 'contador']) assert.ok(text('mei').includes(must), `Empresarial sem "${must}"`);
  for (const id of PLAN_IDS) assert.ok(!/Essencial|Família|familia/.test(PLANS[id].name + text(id)), id);
});

console.log(`ios-app: ${passed} testes passaram${process.exitCode ? ' (com falhas)' : ''}`);
