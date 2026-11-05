import webpush from 'web-push';

// Push web (gratuito): o navegador do usuário recebe o aviso mesmo com o app fechado.
// Chaves VAPID: `npx web-push generate-vapid-keys` -> NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (+ VAPID_SUBJECT opcional).

export type PushSub = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export type PushResult = 'ok' | 'gone' | 'error';

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let ready = false;
function init() {
  if (ready) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'https://www.jakash.app',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
  ready = true;
}

// Prazo de cada envio: um endereço que não responde não pode segurar o cron dos outros usuários.
const SEND_TIMEOUT_MS = 8000;

/** 'gone' = a inscrição expirou ou foi revogada (404/410): quem chama deve apagá-la. */
export async function sendPush(sub: PushSub, payload: PushPayload): Promise<PushResult> {
  if (!pushConfigured()) return 'error';
  // Inscrição salva antes da lista de serviços permitidos: trata como expirada (quem chama apaga).
  if (!isValidPushEndpoint(sub.endpoint)) return 'gone';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    init();
    await Promise.race([
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 12 * 3600, urgency: 'normal', timeout: SEND_TIMEOUT_MS },
      ),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('push: tempo esgotado')), SEND_TIMEOUT_MS + 2000); }),
    ]);
    return 'ok';
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return 'gone';
    console.error('[push] falha no envio', status ?? (err as Error).message);
    return 'error';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Serviços de push dos navegadores (Chrome/Android/Edge novo, Firefox, Safari/iOS, Edge/Windows).
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

/** Só aceita endpoints https dos serviços de push conhecidos (o servidor só chama esses endereços). */
export function isValidPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && endpoint === u.href && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}
