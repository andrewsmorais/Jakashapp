import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { accountantCsv, loadAccountantView } from '@/lib/accountant';

export const dynamic = 'force-dynamic';

// Download dos lançamentos da empresa (CSV) para o contador. Pública, protegida só pelo token do link.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('y')) || new Date().getFullYear();
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return NextResponse.json({ error: 'Ano inválido' }, { status: 400, headers });

  const res = await loadAccountantView(createAdminClient(), token, year);
  if (res.status !== 'ok') return NextResponse.json({ error: 'Link inválido, vencido ou revogado' }, { status: res.status === 'invalid' ? 404 : 410, headers });

  return new NextResponse(accountantCsv(res.view), {
    headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="lancamentos-empresa-${year}.csv"` },
  });
}
