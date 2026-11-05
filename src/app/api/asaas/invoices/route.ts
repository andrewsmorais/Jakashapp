import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ASAAS_URL = process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';

type AsaasPayment = {
  id: string;
  status: string;
  value: number;
  dueDate?: string;
  dateCreated?: string;
  paymentDate?: string | null;
  invoiceUrl?: string;
  bankSlipUrl?: string | null;
  transactionReceiptUrl?: string | null;
};

// Lista as faturas do usuário logado (só do customer dele no Asaas).
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });

  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) return NextResponse.json({ invoices: [] });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('asaas_customer_id').eq('id', user.id).single();
  if (!profile?.asaas_customer_id) return NextResponse.json({ invoices: [] });

  try {
    const res = await fetch(`${ASAAS_URL}/payments?customer=${encodeURIComponent(profile.asaas_customer_id)}&limit=24`, {
      headers: { 'Content-Type': 'application/json', access_token: apiKey },
    });
    const json = (await res.json()) as { data?: AsaasPayment[] };
    const invoices = (json.data ?? []).map((p) => ({
      id: p.id,
      status: p.status,
      value: p.value,
      dueDate: p.dueDate ?? null,
      createdAt: p.dateCreated ?? null,
      paidAt: p.paymentDate ?? null,
      invoiceUrl: p.invoiceUrl ?? null,
      receiptUrl: p.transactionReceiptUrl ?? p.bankSlipUrl ?? null,
    }));
    return NextResponse.json({ invoices });
  } catch (error) {
    console.error('Asaas invoices error:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as faturas.' }, { status: 502 });
  }
}
