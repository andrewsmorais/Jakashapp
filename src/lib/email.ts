// E-mail transacional pela API do Resend (sem SDK). Env: RESEND_API_KEY e EMAIL_FROM (ex.: "Jakash <lembretes@jakash.app>", domínio verificado no Resend).

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type SendResult = { ok: boolean; reason?: 'not_configured' | 'rejected' | 'network'; status?: number };

/** Igual ao sendEmail, mas devolve o motivo da falha (usado pelo botão "Enviar teste"). */
export async function sendEmailResult(to: string, subject: string, text: string, html?: string): Promise<SendResult> {
  if (!emailConfigured()) return { ok: false, reason: 'not_configured' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
    });
    if (!res.ok) console.error('[email] Resend respondeu', res.status);
    return res.ok ? { ok: true, status: res.status } : { ok: false, reason: 'rejected', status: res.status };
  } catch (err) {
    console.error('[email] falha no envio', (err as Error).message);
    return { ok: false, reason: 'network' };
  }
}

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<boolean> {
  return (await sendEmailResult(to, subject, text, html)).ok;
}

/** E-mail simples e legível em qualquer cliente. `lines` já vêm formatadas; o conteúdo é escapado. */
export function reminderEmail(opts: { name: string; title: string; lines: string[]; totalToPay: number; totalLabel: string; siteUrl: string }) {
  const { name, title, lines, totalToPay, totalLabel, siteUrl } = opts;
  const text = [`Oi, ${name}!`, '', title, '', ...lines.map((l) => `• ${l}`), ...(totalToPay > 0 ? ['', `Total a pagar: ${totalLabel}`] : []), '', `Abrir o Jakash: ${siteUrl}/contas`, '', 'Você recebe este e-mail porque ativou lembretes. Para parar, desative em Configurações › Notificações.'].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#111;line-height:1.5">
<p>Oi, ${esc(name)}!</p>
<p style="font-size:18px;font-weight:bold;margin:8px 0 12px">${esc(title)}</p>
<ul style="padding-left:18px;margin:0 0 12px">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
${totalToPay > 0 ? `<p style="margin:0 0 16px"><b>Total a pagar:</b> ${esc(totalLabel)}</p>` : ''}
<p><a href="${esc(siteUrl)}/contas" style="display:inline-block;background:#5B5BF0;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:bold">Abrir o Jakash</a></p>
<p style="color:#777;font-size:12px">Você recebe este e-mail porque ativou lembretes. Para parar, desative em Configurações › Notificações.</p>
</div>`;
  return { text, html };
}
