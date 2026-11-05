import http2 from 'node:http2';
import { signEs256Jwt } from '@/lib/jwtEs256';

// Notificações do app iOS (APNs, gratuito) por HTTP/2 + token JWT (chave .p8). Sem dependência nova.
// Variáveis: APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8 (conteúdo do .p8), APNS_BUNDLE_ID (padrão com.jakash.app),
// APNS_ENV (production | sandbox; padrão production, que vale para TestFlight e App Store).

export type ApnsPayload = { title: string; body: string; url?: string; tag?: string };
export type ApnsResult = 'ok' | 'gone' | 'error';

const TOKEN_RE = /^[0-9a-f]{64,200}$/;
/** Token de aparelho: hexadecimal de 64 a 200 caracteres (minúsculas). */
export const isValidApnsToken = (t: unknown): t is string => typeof t === 'string' && TOKEN_RE.test(t);

export function apnsConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_KEY_P8);
}

export const apnsBundleId = () => process.env.APNS_BUNDLE_ID || 'com.jakash.app';
export const apnsEnvironment = (): 'production' | 'sandbox' => (process.env.APNS_ENV === 'sandbox' ? 'sandbox' : 'production');
const apnsHost = () => (apnsEnvironment() === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com');

/** JWT do APNs: header {alg ES256, kid}, claims {iss = Team ID, iat}. */
export function buildApnsJwt(opts: { keyId: string; teamId: string; keyPem: string; now?: number }): string {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  return signEs256Jwt({ kid: opts.keyId }, { iss: opts.teamId, iat }, opts.keyPem);
}

// A Apple pede um token novo no máximo a cada 20 min e recusa os com mais de 60 min: reaproveita por ~50 min.
const TOKEN_TTL_MS = 50 * 60 * 1000;
let cached: { jwt: string; at: number; key: string } | null = null;
function currentJwt(): string {
  const id = `${process.env.APNS_KEY_ID}|${process.env.APNS_TEAM_ID}`;
  const now = Date.now();
  if (cached && cached.key === id && now - cached.at < TOKEN_TTL_MS) return cached.jwt;
  const jwt = buildApnsJwt({ keyId: process.env.APNS_KEY_ID as string, teamId: process.env.APNS_TEAM_ID as string, keyPem: process.env.APNS_KEY_P8 as string, now });
  cached = { jwt, at: now, key: id };
  return jwt;
}

/** Corpo da notificação. "url" fica fora de "aps": o app lê em notification.data.url ao tocar. */
export function buildApnsBody(p: ApnsPayload): string {
  return JSON.stringify({
    aps: { alert: { title: p.title.slice(0, 120), body: p.body.slice(0, 240) }, sound: 'default', ...(p.tag ? { 'thread-id': p.tag.slice(0, 64) } : {}) },
    ...(p.url ? { url: p.url } : {}),
  });
}

// Uma conexão HTTP/2 reaproveitada entre envios (a Apple desaconselha abrir uma por mensagem).
let session: http2.ClientHttp2Session | null = null;
let sessionHost = '';
function getSession(host: string): http2.ClientHttp2Session {
  if (session && !session.closed && !session.destroyed && sessionHost === host) return session;
  const s = http2.connect(`https://${host}`);
  session = s;
  sessionHost = host;
  const drop = () => { if (session === s) session = null; };
  s.on('error', drop);
  s.on('close', drop);
  s.on('goaway', drop);
  s.setTimeout(60_000, () => s.close());
  return s;
}

/** Quando a Apple diz que o token não vale mais, quem chama deve apagá-lo. */
export function classifyApnsResponse(status: number, reason?: string): ApnsResult {
  if (status === 200) return 'ok';
  if (status === 410) return 'gone'; // Unregistered / ExpiredToken
  if (status === 400 && reason === 'BadDeviceToken') return 'gone';
  return 'error';
}

export async function sendApns(token: string, payload: ApnsPayload): Promise<ApnsResult> {
  if (!apnsConfigured() || !isValidApnsToken(token)) return 'error';
  try {
    const body = buildApnsBody(payload);
    const host = apnsHost();
    const s = getSession(host);
    return await new Promise<ApnsResult>((resolve) => {
      let settled = false;
      const finish = (r: ApnsResult) => { if (!settled) { settled = true; resolve(r); } };
      const req = s.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${currentJwt()}`,
        'apns-topic': apnsBundleId(),
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 12 * 3600),
        ...(payload.tag ? { 'apns-collapse-id': payload.tag.slice(0, 64) } : {}),
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
      });
      let status = 0;
      const chunks: Buffer[] = [];
      req.setTimeout(10_000, () => { req.close(http2.constants.NGHTTP2_CANCEL); finish('error'); });
      req.on('response', (h) => { status = Number(h[':status'] ?? 0); });
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        let reason: string | undefined;
        try { reason = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}').reason; } catch { /* sem corpo */ }
        const r = classifyApnsResponse(status, reason);
        if (r === 'error') console.error('[apns] falha no envio', status, reason ?? '');
        finish(r);
      });
      req.on('error', (e) => { console.error('[apns] erro de rede', e.message); finish('error'); });
      req.end(body);
    });
  } catch (e) {
    console.error('[apns] erro', (e as Error).message);
    session = null;
    return 'error';
  }
}
