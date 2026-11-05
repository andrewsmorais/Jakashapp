import Link from "next/link";
import { Footer } from "@/components/Footer";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo";

export const LEGAL_UPDATED = "23 de outubro de 2026";

// Casca das páginas institucionais (termos, privacidade, reembolso, cookies, sobre, contato).
export function LegalPage({ title, subtitle, path, updated = true, children }: { title: string; subtitle?: string; path: string; updated?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-1)] text-gray-900 flex flex-col">
      <header className="border-b border-gray-200 bg-white/70 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Jakash" className="w-8 h-8 rounded-lg object-cover" />
            <span className="font-bold text-xl tracking-tight">Jakash</span>
          </Link>
          <Link href="/" className="text-sm font-bold text-brand-dark hover:opacity-70">← Voltar ao início</Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-12">
        <article className="max-w-3xl mx-auto">
          <JsonLd data={breadcrumbJsonLd([{ name: "Início", path: "/" }, { name: title, path }])} />
          <nav aria-label="Você está em" className="text-xs font-bold text-gray-400 mb-4">
            <Link href="/" className="hover:text-brand-dark">Início</Link> <span aria-hidden="true">›</span> <span aria-current="page" className="text-gray-500">{title}</span>
          </nav>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="text-gray-500 font-medium mt-2">{subtitle}</p>}
          {updated && <p className="text-xs font-bold text-gray-400 mt-3">Última atualização: {LEGAL_UPDATED}</p>}
          <div className="mt-8 text-[15px] leading-relaxed text-gray-700 [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:text-gray-900 [&_h2]:mt-10 [&_h2]:mb-3 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:space-y-1.5 [&_a]:text-brand-dark [&_a]:font-bold [&_a:hover]:underline [&_strong]:text-gray-900">
            {children}
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
