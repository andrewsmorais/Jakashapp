import Link from "next/link";
import { CTAButton } from "./CTAButton";
import { APP_LOGIN_URL } from "@/lib/links";

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--bg-1)]/80 backdrop-blur-md border-b border-gray-200 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="Jakash" className="w-8 h-8 rounded-lg object-cover" />
          <span className="font-bold text-xl tracking-tight text-gray-900">
            Jakash
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-bold">
          <Link href="#funcionalidades" className="text-gray-500 hover:text-brand-dark transition-colors">Funcionalidades</Link>
          <Link href="#como-funciona" className="text-gray-500 hover:text-brand-dark transition-colors">Como funciona</Link>
          <Link href="#planos" className="text-gray-500 hover:text-brand-dark transition-colors">Preços</Link>
          <Link href="#faq" className="text-gray-500 hover:text-brand-dark transition-colors">FAQ</Link>
        </nav>

        <div className="flex items-center gap-2 md:gap-4">
          <a href={APP_LOGIN_URL} className="flex items-center justify-center h-10 px-3 md:px-6 rounded-full text-brand-dark font-bold hover:bg-brand-dark/5 transition-colors text-sm">
            Entrar
          </a>
          <CTAButton text="Baixar o app →" size="sm" />
        </div>
      </div>
    </header>
  );
}
