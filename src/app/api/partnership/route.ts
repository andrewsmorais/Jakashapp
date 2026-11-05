import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { memberLimit } from '@/lib/plans';

// Gestão compartilhada (casa de até 3 pessoas, conforme o plano de quem convida). O convite vale 48h e é aceito com um código de uso único.
// Quem aceita passa a ver e editar os dados financeiros de toda a casa, e vice-versa (políticas RLS household_user_ids()).
// Modelo em estrela: o dono (quem convidou) tem uma linha em `partnerships` por membro aceito.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
const INVITE_HOURS = 48;

const genCode = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const expired = (iso: string | null) => Boolean(iso && new Date(iso).getTime() < Date.now());

function maskEmail(email?: string | null): string {
  if (!email || !email.includes('@')) return '';
  const [user, domain] = email.split('@');
  return `${user.slice(0, 1)}***@${domain}`;
}

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('invite') }),
  z.object({ action: z.literal('lookup'), code: z.string().min(6).max(24) }),
  z.object({ action: z.literal('accept'), code: z.string().min(6).max(24) }),
]);

type Row = { id: string; owner_id: string; partner_id: string | null; status: string; invite_code: string | null; expires_at: string | null; accepted_at: string | null };
const COLS = 'id,owner_id,partner_id,status,invite_code,expires_at,accepted_at';

async function currentUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

type Admin = ReturnType<typeof createAdminClient>;

// Quantas pessoas (contando o dono) o plano do dono comporta.
async function limitOf(admin: Admin, ownerId: string): Promise<number> {
  const { data } = await admin.from('profiles').select('subscription_plan').eq('id', ownerId).maybeSingle();
  return memberLimit(data?.subscription_plan as string | null | undefined);
}

// Todos os planos comportam o mesmo número de pessoas, então não há upgrade que resolva: só avisa o limite.
function houseFullMessage(limit: number): string {
  return `Sua casa já tem o máximo de ${limit} pessoas do seu plano.`;
}

export async function GET() {
  const { user } = await currentUser();
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });
  const admin = createAdminClient();

  const { data: mineRaw } = await admin.from('partnerships').select(COLS).or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`);
  const mine = (mineRaw ?? []) as Row[];

  const asPartner = mine.find((r) => r.partner_id === user.id && r.status === 'accepted');
  const rootId = asPartner ? asPartner.owner_id : user.id;

  let accepted: Row[];
  if (asPartner) {
    const { data } = await admin.from('partnerships').select(COLS).eq('owner_id', rootId).eq('status', 'accepted');
    accepted = (data ?? []) as Row[];
  } else {
    accepted = mine.filter((r) => r.owner_id === user.id && r.status === 'accepted');
  }

  let pending = asPartner ? undefined : mine.find((r) => r.owner_id === user.id && r.status === 'pending');
  if (pending && expired(pending.expires_at)) {
    await admin.from('partnerships').delete().eq('id', pending.id);
    pending = undefined;
  }

  const limit = await limitOf(admin, rootId);

  if (accepted.length === 0) {
    if (pending) return NextResponse.json({ state: 'pending', code: pending.invite_code, expiresAt: pending.expires_at, limit });
    return NextResponse.json({ state: 'none', limit });
  }

  const ids = [rootId, ...accepted.map((r) => r.partner_id as string)];
  const { data: profs } = await admin.from('profiles').select('id,full_name').in('id', ids);
  const nameOf = (id: string) => profs?.find((p) => p.id === id)?.full_name ?? 'Membro';
  const others = ids.filter((id) => id !== user.id).map((id) => ({ id, name: nameOf(id) }));
  const myRow = asPartner ?? accepted[0];

  return NextResponse.json({
    state: 'accepted',
    role: rootId === user.id ? 'owner' : 'partner',
    me: { id: user.id, name: nameOf(user.id) },
    partner: others[0], // compatibilidade: o primeiro outro membro
    others,
    count: ids.length,
    limit,
    invite: pending ? { code: pending.invite_code, expiresAt: pending.expires_at } : null,
    since: myRow?.accepted_at ?? null,
  });
}

export async function POST(request: Request) {
  try {
    const { user } = await currentUser();
    if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
    const body = parsed.data;
    const admin = createAdminClient();

    const { data: mineRaw } = await admin.from('partnerships').select(COLS).or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`);
    const mine = (mineRaw ?? []) as Row[];

    // ---- criar convite ----
    if (body.action === 'invite') {
      if (mine.some((r) => r.partner_id === user.id && r.status === 'accepted')) {
        return NextResponse.json({ error: 'Você já faz parte da gestão compartilhada de outra pessoa. Só quem criou a casa pode convidar.' }, { status: 409 });
      }
      const limit = await limitOf(admin, user.id);
      const members = mine.filter((r) => r.owner_id === user.id && r.status === 'accepted').length + 1;
      if (members >= limit) return NextResponse.json({ error: houseFullMessage(limit), code: 'plan_limit' }, { status: 403 });

      for (const r of mine) {
        if (r.owner_id === user.id && r.status === 'pending') {
          if (!expired(r.expires_at)) return NextResponse.json({ code: r.invite_code, expiresAt: r.expires_at });
          await admin.from('partnerships').delete().eq('id', r.id);
        }
      }
      const expiresAt = new Date(Date.now() + INVITE_HOURS * 3600_000).toISOString();
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = genCode();
        const { error } = await admin.from('partnerships').insert({ owner_id: user.id, invite_code: code, expires_at: expiresAt });
        if (!error) return NextResponse.json({ code, expiresAt });
        if (error.code !== '23505') { console.error('[partnership] invite', error); break; } // 23505 = código repetido: tenta de novo
      }
      return NextResponse.json({ error: 'Não foi possível criar o convite agora.' }, { status: 500 });
    }

    // ---- conferir / aceitar convite ----
    const code = normalize(body.code);
    const { data: row } = await admin.from('partnerships').select('id,owner_id,status,expires_at').eq('invite_code', code).maybeSingle();
    if (!row || row.status !== 'pending' || expired(row.expires_at)) {
      return NextResponse.json({ error: 'Código inválido ou expirado. Peça um novo a quem convidou.' }, { status: 404 });
    }
    if (row.owner_id === user.id) return NextResponse.json({ error: 'Esse é o código do seu próprio convite. Envie-o para a outra pessoa.' }, { status: 400 });
    if (mine.length > 0) {
      return NextResponse.json({ error: 'Você já tem uma gestão compartilhada ou um convite aberto. Encerre antes de aceitar outro.' }, { status: 409 });
    }

    if (body.action === 'lookup') {
      const [{ data: prof }, { data: auth }] = await Promise.all([
        admin.from('profiles').select('full_name').eq('id', row.owner_id).maybeSingle(),
        admin.auth.admin.getUserById(row.owner_id),
      ]);
      return NextResponse.json({ ownerName: prof?.full_name ?? 'Alguém', ownerEmail: maskEmail(auth.user?.email) });
    }

    // O plano de quem convidou define quantas pessoas cabem.
    const [limit, { count: acceptedCount }] = await Promise.all([
      limitOf(admin, row.owner_id),
      admin.from('partnerships').select('id', { count: 'exact', head: true }).eq('owner_id', row.owner_id).eq('status', 'accepted'),
    ]);
    if ((acceptedCount ?? 0) + 1 >= limit) {
      return NextResponse.json({ error: 'A casa de quem convidou já está completa para o plano dela.' }, { status: 403 });
    }

    const { data: updated, error: updError } = await admin.from('partnerships')
      .update({ partner_id: user.id, status: 'accepted', accepted_at: new Date().toISOString(), invite_code: null, expires_at: null })
      .eq('id', row.id).eq('status', 'pending').select('id');
    if (updError || !updated?.length) {
      return NextResponse.json({ error: 'Esse convite não está mais disponível.' }, { status: 409 });
    }

    // Limites duplicados (mesma categoria ou geral): vale o de quem convidou.
    const { data: ownerBudgets } = await admin.from('budgets').select('category_id').eq('user_id', row.owner_id);
    const ownerKeys = new Set((ownerBudgets ?? []).map((b) => b.category_id ?? 'geral'));
    const { data: myBudgets } = await admin.from('budgets').select('id,category_id').eq('user_id', user.id);
    const dup = (myBudgets ?? []).filter((b) => ownerKeys.has(b.category_id ?? 'geral')).map((b) => b.id);
    if (dup.length) await admin.from('budgets').delete().in('id', dup);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[partnership] erro', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

const deleteSchema = z.object({ memberId: z.string().uuid().optional(), invite: z.boolean().optional() }).default({});

// Sem corpo: o membro sai da casa; o dono desfaz a casa inteira (e cancela o convite aberto).
// { memberId }: o dono remove um membro. { invite: true }: o dono cancela só o convite aberto.
export async function DELETE(request: Request) {
  const { supabase, user } = await currentUser();
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  const { memberId, invite } = parsed.data;

  let query = supabase.from('partnerships').delete();
  if (memberId) query = query.eq('owner_id', user.id).eq('partner_id', memberId);
  else if (invite) query = query.eq('owner_id', user.id).eq('status', 'pending');
  else query = query.or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`);

  const { error } = await query;
  if (error) return NextResponse.json({ error: 'Não foi possível encerrar agora.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
