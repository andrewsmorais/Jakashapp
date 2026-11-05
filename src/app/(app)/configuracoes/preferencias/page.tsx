"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useSettings } from "@/contexts/SettingsContext";
import { CURRENCIES, type CurrencyCode } from "@/lib/format";
import { BackTitle, Card, Label, ErrorNote, inputCls, btnCls } from "@/components/ui/page";

export default function PreferenciasPage() {
  const { supabase, userId, ready } = useSupabase();
  const { currency, setCurrency } = useSettings();
  const [cur, setCur] = useState<CurrencyCode>(currency);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !userId) return;
    supabase.from("profiles").select("currency").maybeSingle().then(({ data }) => {
      const saved = data?.currency as CurrencyCode | null;
      if (saved && saved in CURRENCIES) setCur(saved);
    });
  }, [ready, userId, supabase]);

  async function save() {
    const { error: err } = await supabase.from("profiles").update({ language: "pt", currency: cur }).eq("id", userId);
    if (err) { setError("Não foi possível salvar."); return; }
    setCurrency(cur);
    setError(null); setMsg("Preferências salvas.");
  }

  return (
    <div className="max-w-xl mx-auto pb-20">
      <BackTitle title="Preferências" subtitle="Escolha seu idioma e moeda." href="/configuracoes" />
      <Card className="space-y-5">
        <div><Label>Idioma</Label>
          <select className={inputCls} value="pt" disabled>
            <option value="pt">Português (Brasil)</option>
            <option value="en" disabled>English (em breve)</option>
            <option value="es" disabled>Español (em breve)</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">O Jakash funciona em português por enquanto. Outros idiomas chegam em uma próxima versão.</p>
        </div>
        <div><Label>Moeda de exibição</Label>
          <select className={inputCls} value={cur} onChange={(e) => setCur(e.target.value as CurrencyCode)}>
            {Object.entries(CURRENCIES).map(([code, c]) => <option key={code} value={code}>{c.label}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">Só muda o símbolo e o formato mostrado (ex.: R$ 1.234,56 → $ 1,234.56). Não converte valores: seus lançamentos continuam com os números que você registrou.</p>
        </div>
        <button onClick={save} className={btnCls + " w-full"}><Save size={16} /> Salvar alterações</button>
        <ErrorNote message={error} />
        {msg && <p className="text-sm text-emerald-600 font-bold">{msg}</p>}
      </Card>
    </div>
  );
}
