import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/adminAuth';
import { syncAsaasPayments } from '@/lib/asaasSync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Sincroniza com a API do Asaas. Body: { full?: boolean, cursor?: {s,o} }.
// full=true importa todo o histórico; se o tempo acabar, devolve `cursor` e o painel chama de novo.
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as { full?: boolean; cursor?: { s?: number; o?: number } };
  const cursor =
    Number.isInteger(body.cursor?.s) && Number.isInteger(body.cursor?.o)
      ? { s: Number(body.cursor!.s), o: Number(body.cursor!.o) }
      : undefined;

  const admin = createAdminClient();
  const result = await syncAsaasPayments(admin, { full: body.full === true, cursor });

  if (result.ok && result.done) {
    const now = new Date().toISOString();
    await admin.from('admin_sync_state').upsert({
      id: 1,
      last_sync_at: now,
      ...(body.full === true ? { last_full_sync_at: now } : {}),
      last_result: { scanned: result.scanned, inserted: result.inserted, feesFilled: result.feesFilled },
    });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
}
