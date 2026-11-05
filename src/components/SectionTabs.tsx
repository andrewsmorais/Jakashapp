"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TAB_GROUPS, type TabGroupKey } from "@/lib/nav";

// Abas no topo de telas que fazem parte do mesmo assunto (Guardar, Contas e cartões, Orçamento do mês).
export function SectionTabs({ group }: { group: TabGroupKey }) {
  const pathname = usePathname();
  const tabs = TAB_GROUPS[group];
  return (
    <nav aria-label="Seções" className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 mb-5">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${active ? "bg-gradient-to-r from-brand-dark to-brand-accent dark:from-brand-vivid dark:to-brand-vivid text-white shadow-md shadow-brand-dark/20 dark:shadow-none" : "bg-white/70 dark:bg-[#161616] border border-white/80 dark:border-white/5 text-gray-500 dark:text-gray-400"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
