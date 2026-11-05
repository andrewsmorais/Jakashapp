import { createPrivateKey, sign } from 'node:crypto';

// JWT ES256 (ECDSA P-256 + SHA-256) feito só com node:crypto, sem dependência nova.
// Usado pela Apple em dois lugares: APNs (notificações) e App Store Server API (compras).

export const b64url = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64url');

/** A chave .p8 vem de variável de ambiente: aceita quebras de linha reais ou "\n" escritos como texto. */
export function normalizePem(pem: string): string {
  const p = pem.trim().replace(/\\n/g, '\n');
  return p.endsWith('\n') ? p : `${p}\n`;
}

/** Assina "header.payload" e devolve o JWT. A assinatura é a forma crua r||s (64 bytes) que o JWS exige. */
export function signEs256Jwt(header: Record<string, unknown>, payload: Record<string, unknown>, pem: string): string {
  const signingInput = `${b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', ...header }))}.${b64url(JSON.stringify(payload))}`;
  const key = createPrivateKey(normalizePem(pem));
  const signature = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64url(signature)}`;
}

/**
 * Lê o payload (parte do meio) de um JWS/JWT SEM verificar a assinatura.
 * Só use com dados que vieram direto da Apple por TLS (resposta da App Store Server API), nunca com dados do cliente.
 */
export function decodeJwsPayload<T = Record<string, unknown>>(jws: unknown): T | null {
  if (typeof jws !== 'string') return null;
  const parts = jws.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}
