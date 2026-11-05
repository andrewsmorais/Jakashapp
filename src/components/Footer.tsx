import Link from "next/link";

export const INSTAGRAM_HANDLE = "jakashfinancas";
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;

// Cada item abre a sua própria página (o usuário lê e volta pelo botão "Voltar ao início" ou pelo navegador).
const LINKS: { href: string; label: string }[] = [
  { href: "/termos-de-uso", label: "Termos de uso" },
  { href: "/politica-de-privacidade", label: "Política de privacidade" },
  { href: "/politica-de-reembolso", label: "Política de reembolso" },
  { href: "/politica-de-cookies", label: "Política de cookies" },
  { href: "/sobre", label: "Sobre a empresa" },
  { href: "/contato", label: "Contato" },
];

// Ícone do Instagram em SVG (o pacote de ícones não traz logos de marcas).
function InstagramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 text-gray-900">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-8">
        <div className="flex flex-col md:flex-row md:justify-between gap-12">
          {/* Lado esquerdo: jacaré + nome, e o Instagram embaixo */}
          <div className="flex flex-col items-start gap-5">
            <Link href="/" className="flex items-center gap-3" aria-label="Jakash, página inicial">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Jakash" className="w-16 h-16 rounded-2xl object-cover shadow-md" />
              <span className="font-extrabold text-3xl tracking-tight text-gray-900">Jakash</span>
            </Link>

            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Instagram do Jakash (@${INSTAGRAM_HANDLE})`}
              className="inline-flex items-center gap-2.5 text-sm font-bold text-gray-600 hover:text-brand-dark transition-colors"
            >
              <span className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-700"><InstagramIcon /></span>
              @{INSTAGRAM_HANDLE}
            </a>
          </div>

          {/* Lado direito: todas as páginas */}
          <nav aria-label="Links institucionais">
            <p className="text-xs font-extrabold tracking-widest text-gray-400 mb-4">INSTITUCIONAL</p>
            <ul className="flex flex-col gap-3 text-sm font-semibold">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-gray-600 hover:text-brand-dark transition-colors">{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 pt-6 border-t border-gray-200 text-xs text-gray-400 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} Jakash. Todos os direitos reservados.</p>
          <p>Feito no Brasil 🇧🇷</p>
        </div>
      </div>
    </footer>
  );
}
