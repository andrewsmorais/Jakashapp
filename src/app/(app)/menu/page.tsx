"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type LucideIcon } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useUsageType } from "@/lib/useUsageType";
import { avatarUrl } from "@/lib/avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { NAV_FOOTER, groupsFor } from "@/lib/nav";

type Tile = { icon: LucideIcon; label: string; href: string };

// Saudação fixa (sem "bom dia/boa tarde/boa noite").
function greeting() {
  return "Que bom te ver por aqui,";
}

export default function MenuPage() {
  const { supabase, userId, ready } = useSupabase();
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const { isMei } = useUsageType();
  const groups = groupsFor(isMei).map((g) => ({ title: g.title, tiles: g.items as Tile[] }));
  // Painel do dono fica só em Configurações (e só aparece para a conta de administrador).
  const more: Tile[] = [...NAV_FOOTER];
  const sections = [...groups, { title: "MAIS", tiles: more }];

  useEffect(() => {
    if (!ready || !userId) return;
    supabase.from("profiles").select("full_name,avatar_path").maybeSingle().then(async ({ data }) => {
      setName(data?.full_name ?? "");
      setPhoto(await avatarUrl(supabase, (data?.avatar_path as string | null) ?? null));
    });
  }, [ready, userId, supabase]);

  return (
    <div className="max-w-3xl mx-auto pb-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/configuracoes/perfil" aria-label="Meu perfil"><UserAvatar name={name} url={photo} size={48} /></Link>
        <div>
          <p className="text-sm text-gray-500">{greeting()}</p>
          <p className="font-extrabold text-lg leading-tight">{name.split(" ")[0] || "Bem-vindo"}</p>
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
