"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Bell, ChevronRight, Database, Globe, LogOut, MessageCircle, Palette, Sparkles, Tag, User, Users, type LucideIcon } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { BackTitle, Card } from "@/components/ui/page";
import { InstallGuide } from "@/components/InstallGuide";
import { BiometricLockSetting } from "@/components/BiometricLockSetting";
import { useIsNative } from "@/lib/useIsNative";

const ITEMS: { icon: LucideIcon; title: string; desc: string; href?: string; soon?: boolean }[] = [
  { icon: User, title: "Meu perfil", desc: "Nome, e-mail e data de nascimento.", href: "/configuracoes/perfil" },
  { icon: Globe, title: "Preferências", desc: "Idioma e moeda.", href: "/configuracoes/preferencias" },
  { icon: Bell, title: "Notificações", desc: "Lembretes de contas a pagar e receber.", href: "/configuracoes/notificacoes" },
  { icon: Tag, title: "Categorias", desc: "Crie e organize as categorias dos lançamentos.", href: "/categorias" },
  { icon: Palette, title: "Aparência", desc: "Tema claro/escuro e cor do app.", href: "/configuracoes/aparencia" },
  { icon: Sparkles, title: "Planos e assinatura", desc: "Seu plano, faturas e cancelamento.", href: "/configuracoes/planos" },
  { icon: Database, title: "Dados", desc: "Exportar, recomeçar do zero ou excluir a conta.", href: "/configuracoes/dados" },
  { icon: Users, title: "Gestão compartilhada", desc: "Dividir as finanças com outra pessoa.", href: "/configuracoes/compartilhada" },
];

// Link simples para o WhatsApp do suporte (abre o WhatsApp da própria pessoa). Só aparece se a variável estiver definida.
const SUPPORT_WA = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");

export default function ConfiguracoesPage() {
  const router = useRouter();
  const { supabase } = useSupabase();
  const isAdmin = useIsAdmin();
  const { native } = useIsNative();

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <BackTitle title="Configurações" subtitle="Ajuste o Jakash do seu jeito." href="/menu" />

      <Card className="!p-2">
        <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
          {isAdmin && (
            <li>
              <Link href="/admin" className="block hover:bg-brand-dark/5 dark:hover:bg-[#1E1E1E] rounded-2xl">
                <div className="flex items-center gap-4 px-3 py-4">
                  <div className="w-11 h-11 rounded-2xl bg-brand-dark/20 dark:bg-brand-soft/20 text-brand-dark dark:text-brand-soft flex items-center justify-center shrink-0"><BarChart3 size={20} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold">Painel do dono</p>
                    <p className="text-xs text-gray-500">Métricas, receita e lucro</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </Link>
            </li>
          )}
          {ITEMS.map((it) => {
            const inner = (
              <div className="flex items-center gap-4 px-3 py-4">
                <div className="w-11 h-11 rounded-2xl bg-brand-dark/10 dark:bg-[#262626] text-brand-dark dark:text-brand-soft flex items-center justify-center shrink-0"><it.icon size={20} /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">{it.title}</p>
                  <p className="text-xs text-gray-500">{it.desc}</p>
                </div>
                {it.soon ? <span className="text-[10px] font-bold rounded-full bg-gray-100 dark:bg-[#262626] px-2.5 py-1 text-gray-500">Em breve</span> : <ChevronRight size={18} className="text-gray-300" />}
              </div>
            );
            return <li key={it.title}>{it.href ? <Link href={it.href} className="block hover:bg-brand-dark/5 dark:hover:bg-[#1E1E1E] rounded-2xl">{inner}</Link> : <div className="opacity-70">{inner}</div>}</li>;
          })}
          {SUPPORT_WA && (
            <li>
              <a href={`https://wa.me/${SUPPORT_WA}`} target="_blank" rel="noopener noreferrer" className="block hover:bg-brand-dark/5 dark:hover:bg-[#1E1E1E] rounded-2xl">
                <div className="flex items-center gap-4 px-3 py-4">
                  <div className="w-11 h-11 rounded-2xl bg-brand-dark/10 dark:bg-[#262626] text-brand-dark dark:text-brand-soft flex items-center justify-center shrink-0"><MessageCircle size={20} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold">Suporte no WhatsApp</p>
                    <p className="text-xs text-gray-500">Abre uma conversa no seu WhatsApp.</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </a>
            </li>
          )}
        </ul>
      </Card>
      {/* No app iOS: bloqueio com Face ID no lugar do passo a passo de instalar o app. */}
      {native ? <div className="mt-4"><BiometricLockSetting /></div> : <Card className="mt-4"><InstallGuide /></Card>}
      <button onClick={logout} className="mt-6 w-full flex items-center justify-center gap-2 rounded-full border border-red-500/30 text-red-500 font-bold py-3 text-sm"><LogOut size={16} /> Sair da conta</button>
    </div>
  );
}
