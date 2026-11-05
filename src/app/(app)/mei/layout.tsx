"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import { PLANS, PLAN_FEATURES, meiLocked, planPrice } from "@/lib/plans";
import { Card, btnCls } from "@/components/ui/page";

// Quem assina o Pessoal vê o convite para o Empresarial; no teste grátis e no Empresarial, o pacote MEI abre normal.
export default function MeiLayout({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    fetch("/api/plan", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => setLocked(meiLocked(j))).catch(() => undefined);
  }, []);
  if (!locked) return <>{children}</>;
  return (
    <div className="max-w-xl mx-auto pt-6 pb-20">
      <Card className="text-center">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-brand-dark/10 dark:bg-white/5 inline-flex items-center justify-center text-brand-dark dark:text-brand-soft mb-3"><Briefcase size={26} /></span>
        <h1 className="text-xl font-extrabold">O pacote MEI faz parte do {PLANS.mei.name}</h1>
        <p className="text-sm text-gray-500 mt-2 mb-4">Você continua com tudo do {PLANS.cpf.name}. Para cuidar do MEI no mesmo app, mude para o {PLANS.mei.name} por {planPrice("mei")}/mês.</p>
        <ul className="text-sm text-left space-y-1.5 mb-5">
          {PLAN_FEATURES.mei.slice(1).map((f) => <li key={f} className="flex gap-2"><span className="text-brand-dark dark:text-brand-soft">✓</span>{f}</li>)}
        </ul>
        <Link href="/configuracoes/planos" className={btnCls + " w-full"}>Ver o {PLANS.mei.name}</Link>
      </Card>
    </div>
  );
}
