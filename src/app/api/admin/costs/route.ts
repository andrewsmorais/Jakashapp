import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const FIELDS = ['vercel', 'supabase', 'ai', 'domain', 'payment_fees', 'taxes', 'other'] as const;

// Lança/atualiza os custos de um mês (um registro por mês).
export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const month = typeof body?.month === 'string' ? body.month : '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: 'Mês inválido (use AAAA-MM).' }, { status: 400 });
  }

  const row: Record<string, unknown> = { month: `${month}-01`, updated_at: new Date().toISOString() };
  for (const f of FIELDS) {
    const v = Number(body?.[f] ?? 0);
    if (!Number.isFinite(v) || v < 0 || v > 10_000_000) {
      return NextResponse.json({ error: `Valor inválido em "${f}".` }, { status: 400 });
    }
    row[f] = Math.round(v * 100) / 100;
  }
  row.notes = typeof body?.notes === 'string' ? body.notes.slice(0, 500) : null;

  const { error } = await createAdminClient().from('admin_costs').upsert(row, { onConflict: 'month' });
  if (error) {
    console.error('admin_costs upsert error', error);
    return NextResponse.json({ error: 'Não foi possível salvar os custos.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
