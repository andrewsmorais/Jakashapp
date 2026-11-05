"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, BarChart3, type LucideIcon } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { useUsageType } from "@/lib/useUsageType";
import { NAV_FOOTER, groupsFor } from "@/lib/nav";

type Tile = { icon: LucideIcon; label: string; href: string };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default function MenuPage() {
  const { supabase, userId, ready } = useSupabase();
  const [name, setName] = useState("");
  const { isMei } = useUsageType();
  const isAdmin = useIsAdmin();
  const groups = groupsFor(isMei).map((g) => ({ title: g.title, tiles: g.items as Tile[] }));
  const more: Tile[] = [...NAV_FOOTER, { icon: Sparkles, label: "Planos", href: "/configuracoes/planos" }, ...(isAdmin ? [{ icon: BarChart3, label: "Painel do dono", href: "/admin" }] : [])];
  const sections = [...groups, { title: "MAIS", tiles: more }];

  useEffect(() => {
    if (!ready || !userId) return;
    supabase.from("profiles").select("full_name").maybeSingle().then(({ data }) => setName(data?.full_name ?? ""));
  }, [ready, userId, supabase]);

  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "J";

  return (
    <div className="max-w-3xl mx-auto pb-10">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-brand-dark/10 dark:bg-[#262626] text-brand-dark dark:text-brand-soft font-extrabold flex items-center justify-center">{initials}</div>
        <div>
          <p className="text-sm text-gray-500">{greeting()}</p>
          <p className="font-extrabold text-lg leading-tight">{name || "Bem-vindo"}</p>
        </div>
      </div>
      <h1 className="text-2xl font-extrabold mb-1">Tudo</h1>
      {sections.map((sec) => (
        <section key={sec.title} className="mt-5">
          <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 tracking-widest mb-2">{sec.title}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {sec.tiles.map((t) => (
              <Link key={t.href} href={t.href}
                className="rounded-[24px] p-4 h-28 flex flex-col justify-between border transition-transform active:scale-95 bg-white/75 dark:bg-[#161616] border-white/80 dark:border-white/5 text-gray-800 dark:text-gray-100">
                <t.icon size={26} className="text-brand-dark dark:text-brand-soft" />
                <span className="font-bold text-sm leading-tight">{t.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
