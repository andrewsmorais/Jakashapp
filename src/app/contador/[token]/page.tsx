import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAccountantView } from "@/lib/accountant";
import { ACTIVITY_LABEL, type MeiActivity } from "@/lib/mei";
import { brl, formatDateBR } from "@/lib/format";

// Página pública de leitura para o contador: não tem login, vale só enquanto o link estiver ativo.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Lançamentos da empresa | Jakash",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MSG: Record<string, string> = {
  invalid: "Este link não existe.",
  expired: "Este link venceu. Peça um novo para quem enviou.",
  revoked: "Este link foi cancelado por quem o enviou.",
};

export default async function ContadorPage(props: { params: Promise<{ token: string }>; searchParams: Promise<{ y?: string }> }) {
  const { token } = await props.params;
  const searchParams = await props.searchParams;
  const yearNow = new Date().getFullYear();
  const y = Number(searchParams.y);
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : yearNow;
  const res = await loadAccountantView(createAdminClient(), token, year);

  if (res.status !== "ok") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-black text-gray-800 dark:text-gray-100">
        <p className="text-center font-bold">{MSG[res.status]}</p>
      </main>
    );
  }

  const v = res.view;
  const totalRev = v.monthly.reduce((s, m) => s + m.revenue, 0);
  const totalExp = v.monthly.reduce((s, m) => s + m.expenses, 0);
  const shown = v.tx.slice(-400).reverse();
  const tone = v.limit.level === "excedido" ? "bg-red-500" : v.limit.level === "perigo" ? "bg-amber-500" : "bg-indigo-500";
  const csvHref = `/api/contador/${token}?y=${year}`;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-black text-gray-800 dark:text-gray-100 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <p className="text-xs font-bold text-gray-500">Acesso somente leitura · válido até {formatDateBR(v.expiresAt.slice(0, 10))}</p>
          <h1 className="text-2xl md:text-3xl font-extrabold mt-1">{v.owner.businessName || v.owner.name || "Lançamentos da empresa"}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {v.owner.cnpj ? `CNPJ ${v.owner.cnpj} · ` : ""}{ACTIVITY_LABEL[v.owner.activity as MeiActivity] ?? "MEI"}{v.label ? ` · ${v.label}` : ""}
          </p>
        </header>

        <nav className="flex items-center gap-2 text-sm font-bold">
          <a href={`?y=${year - 1}`} className="rounded-full border border-gray-200 dark:border-white/10 px-4 py-2">← {year - 1}</a>
          <span className="px-3">{year}</span>
          {year < yearNow && <a href={`?y=${year + 1}`} className="rounded-full border border-gray-200 dark:border-white/10 px-4 py-2">{year + 1} →</a>}
          <a href={csvHref} className="ml-auto rounded-full bg-indigo-600 text-white px-4 py-2">Baixar CSV</a>
        </nav>

        <section className="rounded-3xl bg-white dark:bg-[#161616] border border-gray-100 dark:border-white/5 p-5">
          <p className="text-xs font-bold text-gray-500">Receita bruta de {year} (lançamentos da empresa)</p>
          <p className="text-3xl font-extrabold mt-1">{brl(v.limit.revenue)}</p>
          <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-[#262626] overflow-hidden mt-3">
            <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(v.limit.pct, 100)}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {v.limit.pct.toFixed(0)}% do limite de {brl(v.limit.limit)}
            {v.limit.level === "excedido" ? ` · acima em ${brl(v.limit.excess)}` : ` · restam ${brl(v.limit.remaining)}`}
          </p>
        </section>

        <section className="rounded-3xl bg-white dark:bg-[#161616] border border-gray-100 dark:border-white/5 p-5 overflow-x-auto">
          <h2 className="font-extrabold mb-3">Mês a mês</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500"><th className="py-1 pr-3">Mês</th><th className="py-1 pr-3 text-right">Receitas</th><th className="py-1 text-right">Despesas</th></tr></thead>
            <tbody>
              {v.monthly.map((m) => (
                <tr key={m.month} className="border-t border-gray-100 dark:border-white/5">
                  <td className="py-1.5 pr-3">{MONTHS[m.month - 1]}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap">{brl(m.revenue)}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">{brl(m.expenses)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 dark:border-white/10 font-extrabold">
                <td className="py-2 pr-3">Total</td><td className="py-2 pr-3 text-right whitespace-nowrap">{brl(totalRev)}</td><td className="py-2 text-right whitespace-nowrap">{brl(totalExp)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="rounded-3xl bg-white dark:bg-[#161616] border border-gray-100 dark:border-white/5 p-5">
          <h2 className="font-extrabold mb-1">Lançamentos</h2>
          {v.tx.length > shown.length && <p className="text-xs text-gray-500 mb-2">Mostrando os {shown.length} mais recentes de {v.tx.length}. O CSV traz todos.</p>}
          {shown.length === 0 ? <p className="text-sm text-gray-500 py-4">Nenhum lançamento da empresa em {year}.</p> : (
            <ul className="divide-y divide-gray-100 dark:divide-white/5">
              {shown.map((t, i) => (
                <li key={i} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm truncate">{t.description}</p>
                    <p className="text-xs text-gray-500">{formatDateBR(t.date)}{t.category ? ` · ${t.category}` : ""}</p>
                  </div>
                  <span className={`font-bold text-sm whitespace-nowrap shrink-0 ${t.type === "income" ? "text-emerald-600" : "text-red-500"}`}>{t.type === "income" ? "+" : "-"}{brl(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-gray-400 pb-8">Gerado pelo Jakash a partir do que o cliente registrou. Não é documento fiscal; confira com os comprovantes.</p>
      </div>
    </main>
  );
}
