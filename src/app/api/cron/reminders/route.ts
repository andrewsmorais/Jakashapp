import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { addDays, type CardCfg } from '@/lib/cards';
import { brl } from '@/lib/format';
import {
  billItems, buildReminder, cardItems, finalInstallmentItems, meiItems, offsetFor, targetDateFor, todayInSaoPaulo,
  type BillLite, type CardDueRow, type DueItem, type InstallmentLite,
} from '@/lib/reminders';
import { pushConfigured, sendPush } from '@/lib/push';
import { apnsConfigured, sendApns } from '@/lib/apns';
import { emailConfigured, reminderEmail, sendEmail } from '@/lib/email';

// Lembretes de vencimento. Chamada diária pelo Vercel Cron (vercel.json) com "Authorization: Bearer CRON_SECRET".
// Por usuário: um aviso por canal por dia, com as contas a pagar/receber e faturas de cartão (as suas e as do parceiro, na gestão
// compartilhada) que vencem em hoje + N dias, conforme "Quando notificar". Resposta só com contagens (sem dados pessoais).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE = 1000;
const BATCH = 10;
const TIME_BUDGET_MS = 50_000;
const ACTIVE_STATUS = ['trial', 'active', 'past_due'];

type Admin = SupabaseClient;
type Channel = 'push' | 'email';
type Prof = {
  id: string; full_name: string | null;
  notify_email: boolean; notify_push: boolean; notify_when: string | null;
  subscription_status: string; subscription_expires_at: string | null; usage_type: string | null;
};
type Counts = Record<Channel, { sent: number; failed: number }>;

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jakash.app').replace(/\/$/, '');

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

// Lê todas as páginas de uma consulta (limite de linhas por resposta do PostgREST).
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

// Registra o envio ANTES de enviar: se duas execuções se cruzarem, só uma envia. Em caso de falha o registro é devolvido.
async function claim(admin: Admin, userId: string, channel: Channel, refDate: string): Promise<boolean> {
  const { error } = await admin.from('notification_log').insert({ user_id: userId, channel, ref_date: refDate });
  if (!error) return true;
  if (error.code !== '23505') console.error('[reminders] registro de envio', error.message);
  return false; // 23505 = já enviado hoje
}
async function release(admin: Admin, userId: string, channel: Channel, refDate: string) {
  await admin.from('notification_log').delete().eq('user_id', userId).eq('channel', channel).eq('ref_date', refDate);
}

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('tempo esgotado')), ms); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET não configurada.' }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dry = new URL(request.url).searchParams.get('dry') === '1'; // só calcula, não envia nem registra
  const started = Date.now();
  const channelsOn = { push: pushConfigured() || apnsConfigured(), email: emailConfigured() };
  if (!channelsOn.push && !channelsOn.email) {
    return NextResponse.json({ ok: true, note: 'Nenhum canal configurado (VAPID, APNs ou Resend).', channelsOn });
  }

  try {
    const admin = createAdminClient();
    const today = todayInSaoPaulo();
    const now = Date.now();

    // 1. Quem pode receber: notificações ligadas, assinatura em dia (ou teste ainda válido) e ao menos um canal utilizável.
    const profiles = (await readAll<Prof>((from, to) =>
      admin.from('profiles')
        .select('id,full_name,notify_email,notify_push,notify_when,subscription_status,subscription_expires_at,usage_type')
        .eq('notify_enabled', true).in('subscription_status', ACTIVE_STATUS).order('id').range(from, to)
    )).filter((p) => {
      if (p.subscription_status === 'trial' && p.subscription_expires_at && new Date(p.subscription_expires_at).getTime() < now) return false;
      return (channelsOn.push && p.notify_push) || (channelsOn.email && p.notify_email);
    });

    const counts: Counts = { push: { sent: 0, failed: 0 }, email: { sent: 0, failed: 0 } };
    if (profiles.length === 0) return NextResponse.json({ ok: true, eligible: 0, counts });

    // 2. Casais: cada um recebe também os vencimentos do parceiro.
    const pairs = await readAll<{ owner_id: string; partner_id: string }>((from, to) =>
      admin.from('partnerships').select('owner_id,partner_id').eq('status', 'accepted').order('id').range(from, to));
    const household = new Map<string, string[]>();
    for (const r of pairs) {
      household.set(r.owner_id, [r.owner_id, r.partner_id]);
      household.set(r.partner_id, [r.partner_id, r.owner_id]);
    }

    // 3. Vencimentos nas datas que interessam (no máximo 4: hoje, +1, +3 e +7 dias).
    const targets = Array.from(new Set(profiles.map((p) => targetDateFor(today, offsetFor(p.notify_when)))));
    const bills = await readAll<BillLite>((from, to) =>
      admin.from('bills').select('user_id,description,amount,due_date,type').eq('status', 'pending').in('due_date', targets).order('id').range(from, to));
    const cardRows = await readAll<CardDueRow>((from, to) =>
      admin.rpc('card_invoices_due_on', { p_dates: targets }).order('card_id').range(from, to));

    // Última parcela de parcelamentos que vence nessas datas (a fatura de um mês vence no próprio mês).
    const targetMonths = Array.from(new Set(targets.map((t) => `${t.slice(0, 7)}-01`)));
    const lastInstallments = (await readAll<InstallmentLite>((from, to) =>
      admin.from('transactions').select('user_id,card_id,description,amount,invoice_month,installment_number,installment_total')
        .in('invoice_month', targetMonths).gte('installment_total', 2).not('card_id', 'is', null).order('id').range(from, to)
    )).filter((r) => r.installment_number === r.installment_total);
    const cfgs: (CardCfg & { id: string })[] = [];
    const cardIds = Array.from(new Set(lastInstallments.map((r) => r.card_id as string)));
    for (let i = 0; i < cardIds.length; i += 200) {
      const { data } = await admin.from('credit_cards').select('id,closing_day,due_day').in('id', cardIds.slice(i, i + 200));
      cfgs.push(...((data ?? []) as (CardCfg & { id: string })[]));
    }
    const lastBy = new Map<string, InstallmentLite[]>();
    for (const r of lastInstallments) lastBy.set(r.user_id, [...(lastBy.get(r.user_id) ?? []), r]);

    const billsBy = new Map<string, BillLite[]>();
    for (const b of bills) billsBy.set(b.user_id, [...(billsBy.get(b.user_id) ?? []), b]);
    const cardsBy = new Map<string, CardDueRow[]>();
    for (const r of cardRows) cardsBy.set(r.user_id, [...(cardsBy.get(r.user_id) ?? []), r]);

    // 4. Um aviso por usuário.
    let withItems = 0;
    let timedOut = false;
    const would: Record<Channel, number> = { push: 0, email: 0 };

    const notify = async (p: Prof) => {
      const offset = offsetFor(p.notify_when);
      const target = targetDateFor(today, offset);
      const members = household.get(p.id) ?? [p.id];
      const items: DueItem[] = [
        ...billItems(members.flatMap((m) => billsBy.get(m) ?? []), target),
        ...cardItems(members.flatMap((m) => cardsBy.get(m) ?? []), target),
        ...finalInstallmentItems(members.flatMap((m) => lastBy.get(m) ?? []), cfgs, target),
        // Obrigações do MEI (relatório mensal, DAS sem conta agendada, DASN-SIMEI): só para quem usa o app para a empresa.
        ...(p.usage_type === 'empresarial' || p.usage_type === 'ambos'
          ? meiItems(target, (billsBy.get(p.id) ?? []).some((b) => b.type === 'expense' && b.due_date === target && /^das/i.test(b.description)))
          : []),
      ];
      const reminder = buildReminder(items, offset, target);
      if (!reminder) return;
      withItems++;

      const firstName = (p.full_name ?? '').trim().split(/\s+/)[0] || 'tudo bem';
      const wantPush = channelsOn.push && p.notify_push;
      const wantEmail = channelsOn.email && p.notify_email;
      if (dry) { if (wantPush) would.push++; if (wantEmail) would.email++; return; }

      if (wantPush) {
        // Push do navegador (web push) e do app iOS (APNs): mesmo aviso, mesmo canal "push" por dia.
        const [{ data: subs }, { data: natives }] = await Promise.all([
          pushConfigured() ? admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', p.id) : Promise.resolve({ data: [] }),
          apnsConfigured() ? admin.from('native_push_tokens').select('id,token').eq('user_id', p.id) : Promise.resolve({ data: [] }),
        ]);
        if (((subs && subs.length > 0) || (natives && natives.length > 0)) && (await claim(admin, p.id, 'push', today))) {
          let ok = false;
          const message = { title: `Jakash · ${reminder.title}`, body: reminder.summary.slice(0, 160), url: '/contas', tag: `jakash-${today}` };
          for (const s of subs ?? []) {
            const r = await sendPush(s, message);
            if (r === 'ok') ok = true;
            if (r === 'gone') await admin.from('push_subscriptions').delete().eq('id', s.id);
          }
          for (const n of natives ?? []) {
            const r = await sendApns(n.token, message);
            if (r === 'ok') ok = true;
            if (r === 'gone') await admin.from('native_push_tokens').delete().eq('id', n.id);
          }
          if (ok) counts.push.sent++; else { counts.push.failed++; await release(admin, p.id, 'push', today); }
        }
      }

      if (wantEmail && (await claim(admin, p.id, 'email', today))) {
        const { data: auth } = await admin.auth.admin.getUserById(p.id);
        const to = auth?.user?.email;
        let ok = false;
        if (to) {
          const mail = reminderEmail({ name: firstName, title: reminder.title, lines: reminder.lines, totalToPay: reminder.totalToPay, totalLabel: brl(reminder.totalToPay), siteUrl: siteUrl() });
          ok = await sendEmail(to, `Jakash · ${reminder.title}`, mail.text, mail.html);
        }
        if (ok) counts.email.sent++; else { counts.email.failed++; await release(admin, p.id, 'email', today); }
      }
    };

    for (let i = 0; i < profiles.length; i += BATCH) {
      if (Date.now() - started > TIME_BUDGET_MS) { timedOut = true; break; }
      // Prazo por usuário: um envio travado não segura o lote nem os lotes seguintes.
      const left = Math.max(1000, TIME_BUDGET_MS - (Date.now() - started));
      await Promise.all(profiles.slice(i, i + BATCH).map((p) => withDeadline(notify(p), left).catch((e) => console.error('[reminders] usuário', (e as Error).message))));
    }

    // Registros antigos não servem mais (a deduplicação só olha o dia).
    if (!dry) await admin.from('notification_log').delete().lt('ref_date', addDays(today, -60));

    const result = { ok: true, dry, today, targets, eligible: profiles.length, withItems, counts, ...(dry ? { would } : {}), timedOut, ms: Date.now() - started };
    console.log('[reminders]', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error('[reminders] erro', (error as Error).message);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
