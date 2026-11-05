import { signEs256Jwt, decodeJwsPayload } from '@/lib/jwtEs256';
import { PLANS, planFromAppleProduct, type PlanId } from '@/lib/plans';

// Compra dentro do app iOS (Apple In-App Purchase): verificação no servidor com a App Store Server API.
// Variáveis: APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_P8 (conteúdo do .p8 da chave "In-App Purchase"),
// APPLE_BUNDLE_ID (padrão com.jakash.app). Nada que vem do aparelho é confiável: sempre se consulta a Apple por TLS.

export const PRODUCTION_HOST = 'api.storekit.itunes.apple.com';
export const SANDBOX_HOST = 'api.storekit-sandbox.itunes.apple.com';

export const appleBundleId = () => process.env.APPLE_BUNDLE_ID || 'com.jakash.app';
export const iapFlagOn = () => process.env.NEXT_PUBLIC_IOS_IAP === '1';
export function appleIapConfigured(): boolean {
  return Boolean(process.env.APPLE_IAP_KEY_ID && process.env.APPLE_IAP_ISSUER_ID && process.env.APPLE_IAP_KEY_P8);
}

/** JWT da App Store Server API: header kid; claims iss, iat, exp (no máximo 60 min), aud "appstoreconnect-v1", bid. */
export function buildAppStoreJwt(opts: { keyId: string; issuerId: string; bundleId: string; keyPem: string; now?: number; ttlSeconds?: number }): string {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  const ttl = Math.min(opts.ttlSeconds ?? 20 * 60, 55 * 60);
  return signEs256Jwt(
    { kid: opts.keyId },
    { iss: opts.issuerId, iat, exp: iat + ttl, aud: 'appstoreconnect-v1', bid: opts.bundleId },
    opts.keyPem,
  );
}

// ---------------------------------------------------------------------------------------------
// Dados da transação (payload do JWS signedTransactionInfo)
// ---------------------------------------------------------------------------------------------
export type AppleTransaction = {
  bundleId?: string;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  appAccountToken?: string;
  expiresDate?: number; // milissegundos
  revocationDate?: number;
  environment?: string;
};

export const decodeTransaction = (jws: unknown) => decodeJwsPayload<AppleTransaction>(jws);

export type TxCheck =
  | { ok: true; plan: PlanId; expiresAt: string; originalTransactionId: string; transactionId: string; environment: string | null }
  | { ok: false; reason: 'bundle' | 'product' | 'account' | 'revoked' | 'expired' | 'incomplete' };

/** Regras para aceitar uma compra: pacote certo, produto conhecido, comprada por ESTA conta, não estornada e ainda válida. */
export function checkTransaction(tx: AppleTransaction | null, userId: string, now = Date.now(), bundleId = appleBundleId()): TxCheck {
  if (!tx || !tx.originalTransactionId || !tx.transactionId || typeof tx.expiresDate !== 'number') return { ok: false, reason: 'incomplete' };
  if (tx.bundleId !== bundleId) return { ok: false, reason: 'bundle' };
  const plan = planFromAppleProduct(tx.productId);
  if (!plan) return { ok: false, reason: 'product' };
  if (String(tx.appAccountToken ?? '').toLowerCase() !== userId.toLowerCase()) return { ok: false, reason: 'account' };
  if (tx.revocationDate) return { ok: false, reason: 'revoked' };
  if (tx.expiresDate <= now) return { ok: false, reason: 'expired' };
  return { ok: true, plan, expiresAt: new Date(tx.expiresDate).toISOString(), originalTransactionId: tx.originalTransactionId, transactionId: tx.transactionId, environment: tx.environment ?? null };
}

// ---------------------------------------------------------------------------------------------
// Estado da assinatura (Get All Subscription Statuses) -> perfil
// ---------------------------------------------------------------------------------------------
export type ProfileStatus = 'active' | 'past_due' | 'canceled';

/** 1 ativa -> active; 3 nova tentativa de cobrança e 4 carência -> past_due; 2 expirada e 5 estornada -> canceled. */
export function mapAppleStatus(status: unknown): ProfileStatus | null {
  switch (Number(status)) {
    case 1: return 'active';
    case 3:
    case 4: return 'past_due';
    case 2:
    case 5: return 'canceled';
    default: return null;
  }
}

export type SubscriptionStatusResponse = {
  environment?: string;
  bundleId?: string;
  data?: { lastTransactions?: { status?: number; originalTransactionId?: string; signedTransactionInfo?: string }[] }[];
};

export type ProfilePatch = {
  subscription_status: ProfileStatus;
  subscription_expires_at: string | null;
  subscription_plan?: PlanId;
  billing_provider: 'apple';
};

/** Escolhe a entrada da assinatura pedida e transforma em atualização do perfil. null = resposta sem dados úteis. */
export function profilePatchFromStatuses(resp: SubscriptionStatusResponse, originalTransactionId: string, bundleId = appleBundleId()): { patch: ProfilePatch; tx: AppleTransaction; status: number } | null {
  if (resp.bundleId && resp.bundleId !== bundleId) return null;
  const all = (resp.data ?? []).flatMap((g) => g.lastTransactions ?? []);
  const entry = all.find((t) => t.originalTransactionId === originalTransactionId) ?? null;
  if (!entry) return null;
  const mapped = mapAppleStatus(entry.status);
  const tx = decodeTransaction(entry.signedTransactionInfo);
  if (!mapped || !tx) return null;
  if (tx.bundleId && tx.bundleId !== bundleId) return null;
  const plan = planFromAppleProduct(tx.productId);
  return {
    status: Number(entry.status),
    tx,
    patch: {
      subscription_status: mapped,
      subscription_expires_at: typeof tx.expiresDate === 'number' ? new Date(tx.expiresDate).toISOString() : null,
      ...(plan ? { subscription_plan: plan } : {}),
      billing_provider: 'apple',
    },
  };
}

/** Tipo/valor do evento gravado em billing_events (painel do dono) para cada estado. */
export function billingEventFor(status: number, plan: PlanId | null): { kind: 'paid' | 'overdue' | 'refunded' | 'canceled'; amount: number } | null {
  const price = plan ? PLANS[plan].value : 0;
  switch (status) {
    case 1: return { kind: 'paid', amount: price };
    case 3:
    case 4: return { kind: 'overdue', amount: 0 };
    case 5: return { kind: 'refunded', amount: price };
    case 2: return { kind: 'canceled', amount: 0 };
    default: return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Assinatura do Asaas (pagamento pelo site) que impede a compra dentro do app
// ---------------------------------------------------------------------------------------------
export type BillingLite = { asaas_subscription_id?: string | null; subscription_status?: string | null; subscription_expires_at?: string | null; billing_provider?: string | null };

/** Tem assinatura do Asaas valendo (ativa, em atraso, ou em teste ainda no prazo)? Quem tem não compra de novo pela Apple. */
export function hasLiveAsaasSubscription(p: BillingLite | null | undefined, now = Date.now()): boolean {
  if (!p || !p.asaas_subscription_id || p.billing_provider === 'apple') return false;
  const st = String(p.subscription_status);
  if (st === 'active' || st === 'past_due') return true;
  if (st === 'trial') return !p.subscription_expires_at || new Date(p.subscription_expires_at).getTime() > now;
  return false;
}

// ---------------------------------------------------------------------------------------------
// Chamadas à App Store Server API
// ---------------------------------------------------------------------------------------------
export class AppleApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function authHeader(): string {
  const jwt = buildAppStoreJwt({
    keyId: process.env.APPLE_IAP_KEY_ID as string,
    issuerId: process.env.APPLE_IAP_ISSUER_ID as string,
    bundleId: appleBundleId(),
    keyPem: process.env.APPLE_IAP_KEY_P8 as string,
  });
  return `Bearer ${jwt}`;
}

/** Consulta produção e, se a Apple responder 404 (TestFlight e App Review compram no sandbox), tenta o sandbox. */
async function appleGet<T>(path: string, firstEnv: 'Production' | 'Sandbox' = 'Production'): Promise<{ json: T; environment: 'Production' | 'Sandbox' } | null> {
  const order: ('Production' | 'Sandbox')[] = firstEnv === 'Sandbox' ? ['Sandbox', 'Production'] : ['Production', 'Sandbox'];
  for (const env of order) {
    const host = env === 'Production' ? PRODUCTION_HOST : SANDBOX_HOST;
    const res = await fetch(`https://${host}${path}`, { headers: { authorization: authHeader() }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (res.status === 404) continue;
    if (!res.ok) throw new AppleApiError(res.status, `Apple ${env} respondeu ${res.status}`);
    return { json: (await res.json()) as T, environment: env };
  }
  return null;
}

/** GET /inApps/v1/transactions/{transactionId}: a transação como a Apple a conhece. */
export async function fetchAppleTransaction(transactionId: string): Promise<{ tx: AppleTransaction | null; environment: string } | null> {
  const r = await appleGet<{ signedTransactionInfo?: string }>(`/inApps/v1/transactions/${encodeURIComponent(transactionId)}`);
  if (!r) return null;
  return { tx: decodeTransaction(r.json.signedTransactionInfo), environment: r.environment };
}

/** GET /inApps/v1/subscriptions/{originalTransactionId}: estado atual (fonte da verdade para renovação, cancelamento, estorno). */
export async function fetchAppleSubscriptionStatuses(originalTransactionId: string, envHint?: string | null): Promise<SubscriptionStatusResponse | null> {
  const r = await appleGet<SubscriptionStatusResponse>(`/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`, envHint === 'Sandbox' ? 'Sandbox' : 'Production');
  return r ? r.json : null;
}
