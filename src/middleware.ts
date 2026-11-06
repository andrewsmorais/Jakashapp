import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Renova a sessão do Supabase a cada acesso. Nas telas do app:
//  1) sem login -> /login;
//  2) logado mas sem assinatura (Mensal ou Anual) -> /assinar. Só o dono (is_admin) entra sem assinar.
// A regra de quem pode entrar fica no banco (função has_app_access). As rotas /api cuidam da própria autenticação;
// páginas públicas (login, cadastro, contador, termos etc.) ficam livres.
const PROTECTED = ['/motorista', '/admin', '/dashboard', '/transacoes', '/contas-bancarias', '/cartoes', '/parcelamentos', '/comprar', '/viagem', '/relatorios', '/planejamento', '/limites', '/contas', '/dividas', '/metas', '/reserva', '/investimentos', '/chat', '/importar', '/mei', '/menu', '/categorias', '/configuracoes', '/bem-vindo', '/simulador'];

// Telas do app que abrem mesmo sem assinatura.
const NO_PLAN_OK = ['/configuracoes/dados'];

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
  // Não há landing neste repositório (ela fica em outro): quem abre o endereço do app cai no painel (logado) ou no login.
  if (path === '/') return NextResponse.redirect(new URL((user ? '/dashboard' : '/login') + request.nextUrl.search, request.url));
  // Pacote MEI saiu do app (só uso pessoal): quem abrir um link antigo vai para o início.
  if (path === '/mei' || path.startsWith('/mei/')) return NextResponse.redirect(new URL('/dashboard', request.url));
  if ((isProtected || path === '/assinar') && !user) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', path + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  // Sem assinatura não entra. Exceção: Configurações › Dados, para a pessoa poder excluir a conta (regra da Apple).
  if (isProtected && user && !NO_PLAN_OK.some((p) => path === p || path.startsWith(p + '/'))) {
    const { data: allowed, error } = await supabase.rpc('has_app_access');
    if (error || allowed !== true) return NextResponse.redirect(new URL('/assinar', request.url));
  }
  if (user && (path === '/login' || path === '/cadastro')) return NextResponse.redirect(new URL('/dashboard', request.url));
  return response;
}

export const config = {
  matcher: ['/((?!api/|contador/|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|offline.html|[^/]+\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|webmanifest)$).*)'],
};
