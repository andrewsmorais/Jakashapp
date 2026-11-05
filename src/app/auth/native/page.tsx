import Link from "next/link";
import type { Metadata } from "next";
import { buildNativeDeepLink } from "@/lib/native";
import { OpenApp } from "./OpenApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Voltando para o Jakash", robots: { index: false, follow: false } };

// Ponte do login com o Google no app iOS: o Supabase volta para cá (navegador do sistema) com ?code=,
// e esta página devolve o código ao app pelo link jakash://auth/callback. Quem conclui o login é o próprio app (WebView).
export default async function AuthNativePage({ searchParams }: { searchParams: Promise<{ code?: string; next?: string }> }) {
  const sp = await searchParams;
  const link = buildNativeDeepLink(sp.code, sp.next);
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#F3F4F6] p-6 text-center font-sans">
      <div className="w-full max-w-[420px] bg-white border border-gray-100 p-8 rounded-[20px] shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        {link ? (
          <OpenApp link={link} />
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Não foi possível entrar</h1>
            <p className="text-gray-600 mb-6">O login não foi concluído. Volte para o app Jakash e tente de novo.</p>
            <Link href="/login" className="text-[#00A152] font-medium hover:underline">Ir para o login</Link>
          </>
        )}
      </div>
    </main>
  );
}
