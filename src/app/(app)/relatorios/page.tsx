"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, currentMonth, monthRange } from "@/lib/format";
import { buildClassifier, CATEGORY_TIPS, type CatFlagRow } from "@/lib/essentials";
import { PageHeader, Card, Progress, Empty, ErrorNote, inputCls, btnCls } from "@/components/ui/page";
import { saveOrShareText } from "@/lib/nativeShare";

type Row = { description: string; amount: number; type: "income" | "expense"; date: string; category: string; categoryId: string | null };

export default function RelatoriosPage() {
  const { supabase, userId, ready } = useSupabase();
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<Row[]>([]);
  const [classifier, setClassifier] = useState(() => buildClassifier([], []));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { start, end } = monthRange(month);
    const [c, f, t] = await Promise.all([
      supabase.from("categories").select("id,name,parent_id"),
      supabase.from("category_flags").select("category_id,is_essential,is_benefit"),
      supabase.from("transactions").select("description,amount,type,date,category_id").gte("date", start).lt("date", end).order("date"),
    ]);
    if (c.error || t.error) { setError("Não foi possível carregar o relatório."); return; }
    setError(null);
    setClassifier(buildClassifier(c.data ?? [], (f.data ?? []) as CatFlagRow[]));
    const byId = new Map((c.data ?? []).map((x) => [x.id, x]));
    const names = new Map((c.data ?? []).map((x) => [x.id, byId.get(x.parent_id ?? "")?.name ?? x.name]));
    setRows((t.data ?? []).map((x) => ({ description: x.description, amount: Number(x.amount), type: x.type, date: x.date, category: names.get(x.category_id) ?? "Sem categoria", categoryId: x.category_id })));
  }, [supabase, month]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  const income = rows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const expense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const byCat = Object.entries(
    rows.filter((r) => r.type === "expense").reduce<Record<string, number>>((m, r) => ({ ...m, [r.category]: (m[r.category] ?? 0) + r.amount }), {})
  ).sort((a, b) => b[1] - a[1]);

  // Essencial x não essencial (método "primo pobre"): o que é básico x o que dá para cortar.
  const essentialExp = rows.filter((r) => r.type === "expense" && classifier.isEssential(r.categoryId)).reduce((s, r) => s + r.amount, 0);
  const nonEssentialExp = expense - essentialExp;
  const essentialPct = expense > 0 ? (essentialExp / expense) * 100 : 0;
  // Renda livre x benefício (vale-alimentação/refeição): benefício não é dinheiro livre para gastar com qualquer coisa.
  const benefitInc = rows.filter((r) => r.type === "income" && classifier.isBenefit(r.categoryId)).reduce((s, r) => s + r.amount, 0);
  const freeInc = income - benefitInc;

  function exportCsv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
    const lines = ["Data;Descrição;Categoria;Tipo;Valor", ...rows.map((r) => [r.date, esc(r.description), esc(r.category), r.type === "income" ? "Receita" : "Despesa", r.amount.toFixed(2).replace(".", ",")].join(";"))];
    void saveOrShareText(`jakash-${month}.csv`, "﻿" + lines.join("\n")); // no app iOS abre a folha de compartilhar
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <PageHeader title="Relatórios" subtitle="Resumo do mês por categoria" action={
        <div className="flex gap-3">
          <input type="month" className={inputCls + " !w-auto"} value={month} onChange={(e) => setMonth(e.target.value)} />
          <button onClick={exportCsv} className={btnCls} disabled={rows.length === 0}><Download size={16} /> CSV</button>
        </div>
      } />
      <ErrorNote message={error} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card><p className="text-xs font-bold text-gray-500">Receitas</p><p className="text-2xl font-bold text-emerald-500">{brl(income)}</p></Card>
        <Card><p className="text-xs font-bold text-gray-500">Despesas</p><p className="text-2xl font-bold text-red-500">{brl(expense)}</p></Card>
        <Card><p className="text-xs font-bold text-gray-500">Resultado</p><p className="text-2xl font-bold">{brl(income - expense)}</p></Card>
      </div>
      {expense > 0 && (
        <Card className="mb-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="font-extrabold">Essencial × não essencial</p>
            <Link href="/categorias" className="text-xs font-bold text-brand-dark dark:text-brand-soft shrink-0">Ajustar categorias</Link>
          </div>
          <div className="h-3 w-full rounded-full overflow-hidden flex bg-gray-100 dark:bg-[#262626]">
            <div className="h-full bg-brand-dark dark:bg-brand-vivid" style={{ width: `${essentialPct}%` }} />
            <div className="h-full bg-amber-400" style={{ width: `${100 - essentialPct}%` }} />
          </div>
          <div className="flex justify-between text-sm mt-2">
            <span><i className="inline-block w-2.5 h-2.5 rounded-full bg-brand-dark dark:bg-brand-vivid mr-1.5" />Essenciais: <b>{brl(essentialExp)}</b> ({Math.round(essentialPct)}%)</span>
            <span><i className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 mr-1.5" />Não essenciais: <b>{brl(nonEssentialExp)}</b> ({Math.round(100 - essentialPct)}%)</span>
          </div>
          {benefitInc > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-[#262626] grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-gray-500">Renda livre</p><p className="font-bold text-emerald-500">{brl(freeInc)}</p></div>
              <div><p className="text-xs text-gray-500">Benefícios (VA/VR)</p><p className="font-bold">{brl(benefitInc)}</p></div>
            </div>
          )}
        </Card>
      )}
      <Card>
        <p className="font-extrabold mb-4">Despesas por categoria</p>
        {byCat.length === 0 ? <Empty>Sem despesas neste mês.</Empty> : (
          <div className="space-y-4">
            {byCat.map(([name, v]) => (
              <div key={name}>
                <div className="flex justify-between text-sm mb-1"><span className="font-bold">{name}</span><span>{brl(v)} · {Math.round((v / expense) * 100)}%</span></div>
                <Progress value={(v / expense) * 100} />
                {CATEGORY_TIPS[name] && <p className="text-xs text-gray-400 mt-1">💡 {CATEGORY_TIPS[name]}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
