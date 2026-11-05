import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isNativeUserAgent } from '@/lib/native';

// Renova a sessão do Supabase a cada acesso e manda para o login quem não está logado nas telas do app.
// As rotas /api cuidam da própria autenticação; páginas públicas (landing, login, cadastro, contador, etc.) ficam livres.
const PROTECTED = ['/dashboard', '/transacoes', '/contas-bancarias', '/cartoes', '/parcelamentos', '/comprar', '/viagem', '/relatorios', '/planejamento', '/limites', '/contas', '/dividas', '/metas', '/reserva', '/investimentos', '/chat', '/importar', '/mei', '/menu', '/categorias', '/configuracoes', '/bem-vindo', '/simulador'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + '/'));
  // App iOS (User-Agent "JakashApp/"): login sempre obrigatório e sem a landing de vendas (guideline 3.1.1/3.1.3 da Apple).
  const native = isNativeUserAgent(request.headers.get('user-agent'));
  if (native && path === '/') return NextResponse.redirect(new URL(user ? '/dashboard' : '/login', request.url));
  // No site, o bloqueio das telas só vale com NEXT_PUBLIC_REQUIRE_LOGIN=1 (por enquanto o login é de entrada livre).
  if (isProtected && !user && (native || process.env.NEXT_PUBLIC_REQUIRE_LOGIN === '1')) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', path + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  if (user && (path === '/login' || path === '/cadastro')) return NextResponse.redirect(new URL('/dashboard', request.url));
  return response;
}

export const config = {
  matcher: ['/((?!api/|contador/|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|offline.html|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|webmanifest)$).*)'],
};
