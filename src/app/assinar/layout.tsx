import type { Metadata } from "next";

// Tela de escolha do plano: depende da sessão (nada de página pronta no build) e não aparece em buscadores.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Escolha seu plano", robots: { index: false, follow: false } };

export default function AssinarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
