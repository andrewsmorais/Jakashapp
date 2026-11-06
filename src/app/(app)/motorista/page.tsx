"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, formatDateBR, todayISO } from "@/lib/format";
import { SHIFT_COLUMNS, VEHICLE_COLUMNS, normalizeShift, normalizeVehicle, shiftMetrics, type Shift, type Vehicle } from "@/lib/driver";
import { platformOf } from "@/lib/driverPlatforms";
import { ShiftForm, type LastUsed } from "@/components/driver/ShiftForm";
import { ResultsPanel, type Period } from "@/components/driver/ResultsPanel";
import { VehiclesPanel } from "@/components/driver/VehiclesPanel";
import { TurnosPanel } from "@/components/driver/TurnosPanel";
import { BackTitle, Card, Empty, ErrorNote, Label, btnCls, btnGhostCls, inputCls } from "@/components/ui/page";

type Tab = "turnos" | "resultados" | "carros";
type Preset = "hoje" | "semana" | "mes" | "custom";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function periodFor(p: Preset, custom: Period): Period {
  const today = todayISO();
  const [y, m, d] = today.split("-").map(Number);
  if (p === "hoje") return { from: today, to: today };
  // Semana: de segunda-feira até hoje.
  if (p === "semana") { const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; return { from: iso(new Date(y, m - 1, d - dow)), to: today }; }
  if (p === "mes") return { from: `${today.slice(0, 7)}-01`, to: today };
  return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
}

type Acc = { id: string; name: string };

export default function MotoristaPage() {
  const { supabase, userId, ready } = useSupabase();
  const [tab, setTab] = useState<Tab>("turnos");
  const [formOpen, setFormOpen] = useState(false);
  const [day, setDay] = useState("");
  const [turnos, setTurnos] = useState<Shift[]>([]);
  const [turnosLoading, setTurnosLoading] = useState(true);
  const [turnosError, setTurnosError] = useState<string | null>(null);
  const [turnosLimit, setTurnosLimit] = useState(60);
  const turnosReq = useRef(0);
  const [newVehicle, setNewVehicle] = useState(0);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [preset, setPreset] = useState<Preset>("mes");
  const [custom, setCustom] = useState<Period>({ from: `${todayISO().slice(0, 7)}-01`, to: todayISO() });
  const [platform, setPlatform] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [editing, setEditing] = useState<Shift | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const [launching, setLaunching] = useState<Shift | null>(null);
  const [lastUsed, setLastUsed] = useState<LastUsed>(null);
  const period = useMemo(() => periodFor(preset, custom), [preset, custom]);

  const loadVehicles = useCallback(async () => {
    const { data, error: err } = await supabase.from("driver_vehicles").select(VEHICLE_COLUMNS).order("created_at");
    if (err) { setSetupNeeded(true); return; }
    setVehicles(((data ?? []) as Record<string, unknown>[]).map(normalizeVehicle));
  }, [supabase]);

  const loadShifts = useCallback(async () => {
    const { data, error: err } = await supabase.from("driver_shifts").select(SHIFT_COLUMNS).gte("date", period.from).lte("date", period.to).order("date", { ascending: false }).limit(2000);
    if (err) { setError("Não foi possível carregar os dias."); return; }
    setError(null);
    setShifts(((data ?? []) as Record<string, unknown>[]).map(normalizeShift));
  }, [supabase, period.from, period.to]);

  // Histórico do menu Turnos: o dia escolhido ou os mais recentes.
  const loadTurnos = useCallback(async () => {
    const req = ++turnosReq.current; // resposta de um filtro antigo não sobrescreve a do filtro atual
    setTurnosLoading(true);
    let q = supabase.from("driver_shifts").select(SHIFT_COLUMNS);
    q = day ? q.eq("date", day) : q;
    const { data, error: err } = await q.order("date", { ascending: false }).order("created_at", { ascending: false }).limit(day ? 100 : turnosLimit);
    if (req !== turnosReq.current) return;
    setTurnosLoading(false);
    if (err) { setTurnosError("Não foi possível carregar os turnos."); return; }
    setTurnosError(null);
    setTurnos(((data ?? []) as Record<string, unknown>[]).map(normalizeShift));
  }, [supabase, day, turnosLimit]);

  // Veículo, combustível e KM final do último turno: o próximo já começa com eles.
  const loadLast = useCallback(async () => {
    const { data } = await supabase.from("driver_shifts").select("vehicle_id,fuel,km_end").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setLastUsed((data as LastUsed) ?? null);
  }, [supabase]);

  useEffect(() => {
    if (!ready || !userId) return;
    Promise.all([loadVehicles(), loadShifts(), loadLast()]).then(() => setLoading(false));
  }, [ready, userId, loadVehicles, loadShifts, loadLast]);

  useEffect(() => { if (ready && userId) loadTurnos(); }, [ready, userId, loadTurnos]);

  async function remove(s: Shift) {
    if (!window.confirm(`Excluir o turno de ${formatDateBR(s.date)}?${s.income_tx_id ? " Os lançamentos que você mandou para o financeiro continuam lá." : ""}`)) return;
    const { error: err } = await supabase.from("driver_shifts").delete().eq("id", s.id);
    if (err) setError("Não foi possível excluir."); else { loadShifts(); loadTurnos(); }
  }

  async function afterSave() {
    setSaved(editing ? "Turno atualizado." : "Turno salvo!");
    setEditing(null);
    setFormOpen(false);
    setTab("turnos");
    await loadLast();
    setFormKey((k) => k + 1);
    loadShifts();
    loadTurnos();
  }

  function openNew() { setEditing(null); setSaved(null); setFormKey((k) => k + 1); setFormOpen(true); setTab("turnos"); }
  function openEdit(s: Shift) { setEditing(s); setSaved(null); setFormOpen(true); setTab("turnos"); }
  function addVehicle() { setNewVehicle((n) => n + 1); setFormOpen(false); setTab("carros"); }

  if (loading) return <div className="max-w-3xl mx-auto"><BackTitle title="Motorista de app" /><Empty>Carregando…</Empty></div>;

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <BackTitle title="Motorista de app" subtitle="Registre cada turno: quanto rodou, quanto ganhou e quanto gastou. Os resultados usam só os turnos." />

      {setupNeeded ? <Card><Empty>Esta área fica disponível depois da próxima atualização do app.</Empty></Card> : (
        <>
          <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#161616] mb-4">
            {([["turnos", "Turnos"], ["resultados", "Relatórios"], ["carros", "Meus veículos"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => { setTab(k); setSaved(null); setNewVehicle(0); if (k !== "turnos") { setFormOpen(false); setEditing(null); } }} className={`py-2.5 rounded-xl text-sm font-bold ${tab === k ? "bg-white dark:bg-[#262626] shadow-sm" : "text-gray-500"}`}>{l}</button>
            ))}
          </div>

          {tab === "turnos" && (
            <>
              {saved && !formOpen && <p className="text-sm font-bold text-emerald-600 mb-3">{saved}</p>}
              {formOpen ? (
                <ShiftForm key={`${formKey}-${editing?.id ?? "novo"}`} supabase={supabase} userId={userId!} vehicles={vehicles} editing={editing} lastUsed={lastUsed}
                  onSaved={afterSave} onCancel={() => { setFormOpen(false); setEditing(null); }} onAddVehicle={addVehicle} />
              ) : (
                <TurnosPanel shifts={turnos} vehicles={vehicles} day={day} onDay={setDay} onNew={openNew} onAddVehicle={addVehicle}
                  onEdit={openEdit} onDelete={remove} onLaunch={setLaunching} loading={turnosLoading} error={turnosError}
                  canLoadMore={!day && turnos.length >= turnosLimit} onLoadMore={() => setTurnosLimit((n) => n + 60)} />
              )}
            </>
          )}

          {tab === "resultados" && (
            <>
              <Card className="mb-4 !p-4 space-y-3">
                <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
                  {([["hoje", "Hoje"], ["semana", "Esta semana"], ["mes", "Este mês"], ["custom", "Escolher datas"]] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setPreset(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${preset === k ? "bg-brand-dark text-white dark:bg-brand-vivid" : "bg-white/70 dark:bg-[#1E1E1E] text-gray-500"}`}>{l}</button>
                  ))}
                </div>
                {preset === "custom" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>De</Label><input type="date" className={inputCls} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></div>
                    <div><Label>Até</Label><input type="date" className={inputCls} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>
                  </div>
                )}
                {vehicles.length > 1 && (
                  <select className={inputCls} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} aria-label="Carro">
                    <option value="">Todos os carros</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                )}
                <p className="text-xs text-gray-400">{formatDateBR(period.from)} a {formatDateBR(period.to)}</p>
              </Card>
              <ResultsPanel shifts={shifts} vehicles={vehicles} period={period} platform={platform} vehicleId={vehicleId} onPlatform={setPlatform}
                onEdit={openEdit} onDelete={remove} onLaunch={setLaunching} error={error} />
            </>
          )}

          {tab === "carros" && <VehiclesPanel key={newVehicle} supabase={supabase} userId={userId!} vehicles={vehicles} onChanged={loadVehicles} startNew={newVehicle > 0} />}
        </>
      )}

      {launching && <LaunchDialog supabase={supabase} userId={userId!} shift={launching} onClose={(done) => { setLaunching(null); if (done) { loadShifts(); loadTurnos(); } }} />}
    </div>
  );
}

// Manda o dia para o financeiro (o total do app). Duas formas:
//  "net":   uma receita com o lucro líquido (se der prejuízo, vira uma despesa com o valor do prejuízo);
//  "split": o lucro bruto como receita e as despesas do turno como despesa (o saldo no app fica igual ao lucro líquido).
function LaunchDialog({ supabase, userId, shift, onClose }: { supabase: ReturnType<typeof useSupabase>["supabase"]; userId: string; shift: Shift; onClose: (done: boolean) => void }) {
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [accountId, setAccountId] = useState("");
  const [mode, setMode] = useState<"net" | "split">("net");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = shiftMetrics(shift);
  const names = Array.from(new Set(shift.earnings.map((e) => platformOf(e.platform).name))).join(", ");

  useEffect(() => {
    supabase.from("accounts").select("id,name").eq("archived", false).order("created_at").then(({ data }) => {
      const list = (data ?? []) as Acc[];
      setAccounts(list);
      if (list.length) setAccountId(list[0].id);
    });
  }, [supabase]);

  async function go() {
    setBusy(true); setError(null);
    const dm = formatDateBR(shift.date).slice(0, 5);
    const label = `${dm}${names ? ` (${names})` : ""}`;
    const base = { user_id: userId, date: shift.date, account_id: accountId || null, origin: "manual", is_business: false };
    let incomeId: string | null = null;
    let expenseId: string | null = null;
    if (mode === "net") {
      if (m.net === 0) { setBusy(false); setError("O lucro líquido deste turno é zero: não há o que lançar."); return; }
      const loss = m.net < 0;
      const r = await supabase.from("transactions").insert({
        ...base, description: `${loss ? "Prejuízo das corridas" : "Lucro das corridas"} ${label}`.slice(0, 120), amount: Math.abs(m.net), type: loss ? "expense" : "income", category_id: null,
      }).select("id").single();
      if (r.error || !r.data) { setBusy(false); setError("Não foi possível lançar."); return; }
      if (loss) expenseId = (r.data as { id: string }).id; else incomeId = (r.data as { id: string }).id;
    } else {
      if (m.gross > 0) {
        const inc = await supabase.from("transactions").insert({ ...base, description: `Corridas ${label}`.slice(0, 120), amount: m.gross, type: "income", category_id: null }).select("id").single();
        if (inc.error || !inc.data) { setBusy(false); setError("Não foi possível lançar o lucro bruto."); return; }
        incomeId = (inc.data as { id: string }).id;
      }
      if (m.expenses > 0) {
        const exp = await supabase.from("transactions").insert({ ...base, description: `Despesas das corridas ${label}`.slice(0, 120), amount: m.expenses, type: "expense", category_id: null }).select("id").single();
        if (exp.error || !exp.data) { setBusy(false); setError(incomeId ? "Lancei o lucro bruto, mas não consegui lançar as despesas." : "Não foi possível lançar as despesas."); if (!incomeId) return; }
        else expenseId = (exp.data as { id: string }).id;
      }
    }
    // Marca o turno como lançado (o botão some e o turno mostra "Lançado no financeiro").
    await supabase.from("driver_shifts").update({ income_tx_id: incomeId ?? expenseId, expense_tx_id: expenseId }).eq("id", shift.id);
    window.dispatchEvent(new Event("jakash:changed"));
    setBusy(false);
    onClose(true);
  }

  const opt = (k: "net" | "split", title: string, desc: string) => (
    <button type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
      className={`w-full text-left rounded-2xl border-2 px-4 py-3 ${mode === k ? "border-brand-dark dark:border-brand-vivid bg-brand-dark/5" : "border-gray-200 dark:border-white/10"}`}>
      <span className="block text-sm font-extrabold">{title}</span>
      <span className="block text-xs text-gray-500">{desc}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => onClose(false)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full md:max-w-md bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] p-6 space-y-4">
        <h2 className="text-xl font-extrabold">Lançar no financeiro</h2>
        <p className="text-sm text-gray-500">Turno de {formatDateBR(shift.date)}: lucro bruto <strong>{brl(m.gross)}</strong>, despesas <strong>{brl(m.expenses)}</strong>, lucro líquido <strong>{brl(m.net)}</strong>.</p>
        <div className="space-y-2">
          {opt("net", `Só o lucro líquido (${brl(m.net)})`, m.net < 0 ? "Deu prejuízo: entra como uma despesa." : "Entra uma receita com o que sobrou no bolso.")}
          {opt("split", "Lucro bruto e despesas separados", `Receita de ${brl(m.gross)} e despesa de ${brl(m.expenses)}. O saldo fica igual ao lucro líquido.`)}
        </div>
        <div><Label>Conta onde o dinheiro caiu</Label>
          <select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Sem conta</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></div>
        <ErrorNote message={error} />
        <div className="flex gap-2">
          <button type="button" onClick={() => onClose(false)} className={btnGhostCls + " flex-1 !py-3"}>Cancelar</button>
          <button type="button" onClick={go} disabled={busy} className={btnCls + " flex-1"}>{busy ? "Lançando..." : "Lançar"}</button>
        </div>
      </div>
    </div>
  );
}
