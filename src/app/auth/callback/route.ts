import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/authUtil';

export const dynamic = 'force-dynamic';

// Volta do Google, do link de confirmação de e-mail e do link de recuperar senha (fluxo PKCE: troca o ?code= por sessão).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));
  if (code) {
    const { error } = await createClient().auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL(next === '/redefinir-senha' ? '/redefinir-senha' : '/login?erro=1', url.origin));
}
