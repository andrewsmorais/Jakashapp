"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, Plus, Receipt, Trash2 } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, parseMoney, todayISO } from "@/lib/format";
import {
  EMPTY_OVERRIDES, EMPTY_TOMADOR, UF_LIST, buildFicha, formatCnpj, lineFromItem, lineTotal, qtyText, validatePrestadorForm,
  type CatalogItem, type NotaKind, type NotaLine, type PrestadorForm, type PrestadorInput, type ServiceOverrides, type TomadorInput,
} from "@/lib/meiNota";
import { FichaView } from "@/components/mei/FichaView";
import { BackTitle, Card, Empty, ErrorNote, Label, btnCls, btnGhostCls, inputCls } from "@/components/ui/page";

type Prof = PrestadorInput & { mei_activity: string };
type ClientRow = {
  id: string; name: string; document: string | null; phone: string | null; email: string | null;
  cep: string | null; address: string | null; address_number: string | null; address_complement: string | null; neighborhood: string | null; city: string | null; uf: string | null;
};
type Line = NotaLine & { key: string };

const PROF_COLUMNS = "full_name,mei_activity,business_name,business_cnpj,business_municipio,business_uf,business_im,business_cep,business_address";
const CLIENT_COLUMNS = "id,name,document,phone,email,cep,address,address_number,address_complement,neighborhood,city,uf";
const ITEM_COLUMNS = "id,kind,name,description,unit_price,unit,ctrib_nac,nbs,municipal_code,ncm,cfop,archived";
const EMPTY_PF: PrestadorForm = { business_name: "", business_cnpj: "", business_municipio: "", business_uf: "", business_im: "", business_cep: "", business_address: "" };
const EMPTY_FREE = { name: "", quantity: "1", price: "", unit: "", ncm: "", cfop: "" };

const clientToTomador = (c: ClientRow): TomadorInput => ({
  clientId: c.id, name: c.name, document: c.document ?? "", email: c.email ?? "", phone: c.phone ?? "", cep: c.cep ?? "", address: c.address ?? "",
  address_number: c.address_number ?? "", address_complement: c.address_complement ?? "", neighborhood: c.neighborhood ?? "", city: c.city ?? "", uf: c.uf ?? "",
});

export default function NotaPage() {
  const { supabase, userId, ready } = useSupabase();
  const today = todayISO();
  const [prof, setProf] = useState<Prof | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<NotaKind>("servico");
  const [date, setDate] = useState(today);
  const [sel, setSel] = useState(""); // "" = sem tomador, "manual" = digitado na hora, senão o id do cliente
  const [manual, setManual] = useState<TomadorInput>(EMPTY_TOMADOR);
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState({ itemId: "", quantity: "1" });
  const [free, setFree] = useState(EMPTY_FREE);
  const [discount, setDiscount] = useState("");
  const [ov, setOv] = useState<ServiceOverrides>(EMPTY_OVERRIDES);
  const [pf, setPf] = useState<PrestadorForm>(EMPTY_PF);
  const seq = useRef(0);
  const kindChosen = useRef(false);

  const load = useCallback(async () => {
    const [p, c, i] = await Promise.all([
      supabase.from("profiles").select(PROF_COLUMNS).eq("id", userId!).maybeSingle(),
      supabase.from("mei_clients").select(CLIENT_COLUMNS).eq("archived", false).order("name"),
      supabase.from("mei_items").select(ITEM_COLUMNS).eq("archived", false).order("name"),
    ]);
    if (p.error || c.error || i.error) setError("Não foi possível carregar os dados. Tente de novo em instantes.");
    const pr = p.data as Prof | null;
    if (pr) {
      setProf(pr);
      setPf({
        business_name: pr.business_name ?? "", business_cnpj: pr.business_cnpj ? formatCnpj(pr.business_cnpj) : "", business_municipio: pr.business_municipio ?? "",
        business_uf: pr.business_uf ?? "", business_im: pr.business_im ?? "", business_cep: pr.business_cep ?? "", business_address: pr.business_address ?? "",
      });
      // Quem vende produto (comércio/indústria) abre na ficha de produto; o resto abre na de serviço.
      if (!kindChosen.current) { kindChosen.current = true; setKind(pr.mei_activity === "servicos" ? "servico" : "produto"); }
    }
    setClients((c.data ?? []) as ClientRow[]);
    setItems(((i.data ?? []) as CatalogItem[]).map((x) => ({ ...x, unit_price: Number(x.unit_price) })));
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);

  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(null), 3500); };
  const itemsOfKind = items.filter((x) => x.kind === kind);

  function switchKind(k: NotaKind) {
    if (k === kind) return;
    kindChosen.current = true;
    setKind(k);
    setLines([]);
    setPick({ itemId: "", quantity: "1" });
    setFree(EMPTY_FREE);
    setOv(EMPTY_OVERRIDES);
  }

  const tomador: TomadorInput | null = useMemo(() => {
    if (sel === "manual") return { ...manual, clientId: null };
    const c = clients.find((x) => x.id === sel);
    return c ? clientToTomador(c) : null;
  }, [sel, manual, clients]);

  const discountValue = (() => { const d = parseMoney(discount); return Number.isFinite(d) && d > 0 ? d : 0; })();

  const ficha = useMemo(() => buildFicha({
    kind, date, tomador, lines, discount: discountValue, service: ov,
    prestador: prof ?? { business_name: null, business_cnpj: null, business_municipio: null, business_uf: null, business_im: null, business_cep: null, business_address: null },
  }), [kind, date, tomador, lines, discountValue, ov, prof]);

  function addCatalog() {
    setError(null);
    const it = items.find((x) => x.id === pick.itemId);
    if (!it) { setError("Escolha um item do catálogo."); return; }
    const q = parseMoney(pick.quantity);
    if (!(q > 0)) { setError("A quantidade deve ser maior que zero."); return; }
    setLines((ls) => [...ls, { ...lineFromItem(it, q), key: `l${++seq.current}` }]);
    setPick({ itemId: "", quantity: "1" });
  }

  function addFree(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const q = parseMoney(free.quantity);
    const price = parseMoney(free.price);
    if (!free.name.trim()) { setError(kind === "servico" ? "Descreva o serviço." : "Descreva o produto."); return; }
    if (!(q > 0) || !(price > 0)) { setError("Informe quantidade e valor maiores que zero."); return; }
    setLines((ls) => [...ls, {
      key: `l${++seq.current}`, itemId: null, name: free.name.trim(), quantity: q, unitPrice: price, unit: free.unit.trim() || null,
      ncm: free.ncm.trim() || null, cfop: free.cfop.trim() || null,
    }]);
    setFree(EMPTY_FREE);
  }

  async function savePrestador(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = validatePrestadorForm(pf);
    if (!parsed.ok) { setError(parsed.error); return; }
    setBusy(true);
    const { error: err } = await supabase.from("profiles").update(parsed.row).eq("id", userId!);
    setBusy(false);
    if (err) { setError("Não foi possível salvar."); return; }
    flash("Dados do MEI salvos.");
    load();
  }

  // Atalho: registra um recibo simples (sem valor fiscal) com o total desta ficha, pela mesma tabela da tela Recibos.
  async function saveReceipt() {
    setError(null);
    if (!(ficha.total > 0)) { setError("Monte a nota com um valor maior que zero antes de registrar o recibo."); return; }
    if (!date) { setError("Informe a data."); return; }
    setBusy(true);
    const last = await supabase.from("mei_invoices").select("invoice_number").eq("user_id", userId!).order("invoice_number", { ascending: false }).limit(1);
    const number = (((last.data ?? []) as { invoice_number: number }[])[0]?.invoice_number ?? 0) + 1;
    const { error: err } = await supabase.from("mei_invoices").insert({
      user_id: userId, invoice_number: number, client_id: tomador?.clientId ?? null, client_name: tomador?.name.trim() || "Cliente",
      value: ficha.total, invoice_date: date, notes: ficha.summary.slice(0, 500) || null,
    });
    setBusy(false);
    if (err) { setError("Não foi possível registrar o recibo."); return; }
    flash(`Recibo #${number} registrado. Veja em Recibos.`);
  }

  const autoCtrib = lines.find((l) => l.ctribNac)?.ctribNac ?? "";
  const autoNbs = lines.find((l) => l.nbs)?.nbs ?? "";
  const autoMunCode = lines.find((l) => l.municipalCode)?.municipalCode ?? "";
  const setM = (patch: Partial<TomadorInput>) => setManual((m) => ({ ...m, ...patch }));
  const setP = (patch: Partial<PrestadorForm>) => setPf((f) => ({ ...f, ...patch }));
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-6">
      <BackTitle title="Ficha da nota fiscal" subtitle="Todos os dados que o emissor oficial pede, na ordem das telas dele e prontos para copiar. O Jakash não emite a nota." href="/mei" />
      <ErrorNote message={error} />
      {note && <p className="text-sm font-bold text-emerald-600">{note}</p>}

      <Card className="!bg-blue-50 dark:!bg-blue-500/10">
        <div className="flex items-start gap-2">
          <Info size={18} className="shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            O Jakash <span className="font-bold">não emite nota fiscal</span> e não se conecta a nenhum sistema fiscal. Você monta a ficha aqui, abre o emissor oficial
            (o Emissor Nacional para serviços, o da SEFAZ do seu estado para produtos) e copia os campos. O Emissor Nacional é gratuito para o MEI.
          </p>
        </div>
      </Card>

      <div className="flex gap-2" role="tablist">
        {([["servico", "Serviço (NFS-e)"], ["produto", "Produto (NF-e)"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => switchKind(k)}
            className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${kind === k ? "bg-brand-dark text-white dark:bg-brand-vivid" : "bg-white/70 dark:bg-[#1E1E1E] text-gray-600 dark:text-gray-300"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <Empty>Carregando…</Empty> : (
        <>
          <Card>
            <h2 id="tomador" className="font-extrabold text-lg mb-3 scroll-mt-24">{kind === "servico" ? "Tomador (quem contratou)" : "Destinatário (quem comprou)"}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><Label>Cliente</Label>
                <select className={inputCls} value={sel} onChange={(e) => setSel(e.target.value)}>
                  <option value="">{kind === "servico" ? "Sem tomador (pessoa física que não pediu nota)" : "Escolha o cliente"}</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="manual">Digitar os dados desta vez</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  CPF/CNPJ e endereço do cliente ficam no <Link href="/mei/clientes" className="font-bold underline underline-offset-2">cadastro de clientes</Link>.
                </p></div>
              {sel === "manual" && (
                <>
                  <div className="sm:col-span-2"><Label>Nome ou razão social</Label><input className={inputCls} maxLength={120} value={manual.name} onChange={(e) => setM({ name: e.target.value })} /></div>
                  <div><Label>CPF ou CNPJ</Label><input className={inputCls} maxLength={20} value={manual.document} onChange={(e) => setM({ document: e.target.value })} placeholder="000.000.000-00" /></div>
                  <div><Label>CEP</Label><input className={inputCls} maxLength={9} inputMode="numeric" value={manual.cep} onChange={(e) => setM({ cep: e.target.value })} placeholder="00000-000" /></div>
                  <div className="sm:col-span-2"><Label>Logradouro</Label><input className={inputCls} maxLength={120} value={manual.address} onChange={(e) => setM({ address: e.target.value })} placeholder="Rua, avenida..." /></div>
                  <div><Label>Número</Label><input className={inputCls} maxLength={20} value={manual.address_number} onChange={(e) => setM({ address_number: e.target.value })} /></div>
                  <div><Label>Complemento (opcional)</Label><input className={inputCls} maxLength={60} value={manual.address_complement} onChange={(e) => setM({ address_complement: e.target.value })} /></div>
                  <div><Label>Bairro</Label><input className={inputCls} maxLength={80} value={manual.neighborhood} onChange={(e) => setM({ neighborhood: e.target.value })} /></div>
                  <div className="grid grid-cols-[1fr_5rem] gap-2">
                    <div><Label>Município</Label><input className={inputCls} maxLength={80} value={manual.city} onChange={(e) => setM({ city: e.target.value })} /></div>
                    <div><Label>UF</Label>
                      <select className={inputCls} value={manual.uf} onChange={(e) => setM({ uf: e.target.value })}>
                        <option value="">--</option>
                        {UF_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select></div>
                  </div>
                  <div><Label>E-mail (opcional)</Label><input type="email" className={inputCls} maxLength={120} value={manual.email} onChange={(e) => setM({ email: e.target.value })} /></div>
                  <div><Label>Telefone (opcional)</Label><input className={inputCls} maxLength={20} inputMode="tel" value={manual.phone} onChange={(e) => setM({ phone: e.target.value })} /></div>
                </>
              )}
            </div>
          </Card>

          <Card>
            <h2 id="itens" className="font-extrabold text-lg mb-1 scroll-mt-24">{kind === "servico" ? "Serviço prestado" : "Produtos vendidos"}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div><Label>{kind === "servico" ? "Data de competência" : "Data da emissão"}</Label><input type="date" className={inputCls} value={date} max="2099-12-31" onChange={(e) => setDate(e.target.value)} /></div>
              <div><Label>Desconto (opcional)</Label><input className={inputCls} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0,00" /></div>
            </div>

            {lines.length > 0 && (
              <ul className="divide-y divide-gray-100 dark:divide-[#262626] mb-4">
                {lines.map((l) => (
                  <li key={l.key} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold truncate">{l.name}</p>
                      <p className="text-xs text-gray-500">{qtyText(l.quantity)}{l.unit ? ` ${l.unit}` : ""} x {brl(l.unitPrice)}{!l.itemId ? " · digitado na hora" : ""}</p>
                    </div>
                    <span className="font-extrabold text-emerald-600 whitespace-nowrap">{brl(lineTotal(l))}</span>
                    <button type="button" className="p-2 text-gray-400 hover:text-red-500" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remover ${l.name}`}><Trash2 size={16} /></button>
                  </li>
                ))}
                <li className="py-2.5 flex justify-between text-sm font-bold"><span>Total</span><span>{brl(subtotal)}</span></li>
              </ul>
            )}

            {itemsOfKind.length > 0 ? (
              <div className="grid grid-cols-[1fr_5.5rem_auto] gap-2 items-end">
                <div><Label>Do catálogo</Label>
                  <select className={inputCls} value={pick.itemId} onChange={(e) => setPick({ ...pick, itemId: e.target.value })}>
                    <option value="">Escolha {kind === "servico" ? "um serviço" : "um produto"}</option>
                    {itemsOfKind.map((x) => <option key={x.id} value={x.id}>{x.name}{x.unit_price > 0 ? ` · ${brl(x.unit_price)}` : ""}</option>)}
                  </select></div>
                <div><Label>Qtd.</Label><input className={inputCls} inputMode="decimal" value={pick.quantity} onChange={(e) => setPick({ ...pick, quantity: e.target.value })} aria-label="Quantidade" /></div>
                <button type="button" className={btnCls + " !px-4"} onClick={addCatalog}><Plus size={16} /> Adicionar</button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Seu catálogo de {kind === "servico" ? "serviços" : "produtos"} está vazio.{" "}
                <Link href="/mei/produtos" className="font-bold underline underline-offset-2">Cadastre em Produtos e serviços</Link> para reaproveitar valor e códigos, ou digite abaixo.
              </p>
            )}

            <form onSubmit={addFree} className="mt-4 rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-4 grid grid-cols-1 sm:grid-cols-6 gap-3">
              <p className="sm:col-span-6 text-xs font-bold text-gray-500">Ou digite {kind === "servico" ? "o serviço" : "o produto"} na hora</p>
              <div className="sm:col-span-6"><Label>Descrição</Label><input className={inputCls} maxLength={120} value={free.name} onChange={(e) => setFree({ ...free, name: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Quantidade</Label><input className={inputCls} inputMode="decimal" value={free.quantity} onChange={(e) => setFree({ ...free, quantity: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Valor unitário (R$)</Label><input className={inputCls} inputMode="decimal" value={free.price} onChange={(e) => setFree({ ...free, price: e.target.value })} placeholder="0,00" /></div>
              <div className="sm:col-span-2"><Label>Unidade{kind === "produto" ? "" : " (opcional)"}</Label><input className={inputCls} maxLength={10} value={free.unit} onChange={(e) => setFree({ ...free, unit: e.target.value })} placeholder="un, h, kg" /></div>
              {kind === "produto" && (
                <>
                  <div className="sm:col-span-3"><Label>NCM</Label><input className={inputCls} inputMode="numeric" maxLength={12} value={free.ncm} onChange={(e) => setFree({ ...free, ncm: e.target.value })} placeholder="0000.00.00" /></div>
                  <div className="sm:col-span-3"><Label>CFOP</Label><input className={inputCls} inputMode="numeric" maxLength={6} value={free.cfop} onChange={(e) => setFree({ ...free, cfop: e.target.value })} placeholder="5.102" /></div>
                </>
              )}
              <div className="sm:col-span-6"><button type="submit" className={btnGhostCls + " !py-2.5 !px-4"}><Plus size={14} /> Adicionar à nota</button></div>
            </form>
          </Card>

          {kind === "servico" && (
            <Card>
              <h2 id="servico" className="font-extrabold text-lg mb-1 scroll-mt-24">Ajustes do serviço</h2>
              <p className="text-xs text-gray-500 mb-3">Em branco, vale o que está no catálogo e o município do seu MEI. Preencha só para trocar ou completar (por exemplo, quando o serviço foi digitado na hora).</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Município da prestação</Label><input className={inputCls} maxLength={80} value={ov.city} onChange={(e) => setOv({ ...ov, city: e.target.value })} placeholder={prof?.business_municipio ?? "Município do seu MEI"} /></div>
                <div><Label>Código de tributação nacional</Label><input className={inputCls} maxLength={10} inputMode="numeric" value={ov.ctribNac} onChange={(e) => setOv({ ...ov, ctribNac: e.target.value })} placeholder={autoCtrib || "01.01.01"} /></div>
                <div><Label>Item da NBS (opcional)</Label><input className={inputCls} maxLength={15} inputMode="numeric" value={ov.nbs} onChange={(e) => setOv({ ...ov, nbs: e.target.value })} placeholder={autoNbs || "1.0101.10.00"} /></div>
                <div><Label>Código complementar do município (opcional)</Label><input className={inputCls} maxLength={10} value={ov.municipalCode} onChange={(e) => setOv({ ...ov, municipalCode: e.target.value })} placeholder={autoMunCode || "Só se o município tiver"} /></div>
              </div>
            </Card>
          )}

          <FichaView ficha={ficha} generatedOn={today} />

          <Card>
            <h2 className="font-extrabold text-lg flex items-center gap-2"><Receipt size={18} /> Registrar como recibo</h2>
            <p className="text-sm text-gray-500 mt-1">Guarda um recibo simples de {brl(ficha.total)} em Recibos, com o cliente e a descrição desta ficha. É só um registro seu, sem valor fiscal.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" className={btnCls} onClick={saveReceipt} disabled={busy || !(ficha.total > 0)}>Registrar recibo</button>
              <Link href="/mei/recibos" className={btnGhostCls + " !py-2.5 !px-4"}>Ver recibos</Link>
            </div>
          </Card>

          <Card>
            <h2 id="prestador" className="font-extrabold text-lg mb-1 scroll-mt-24">Dados do seu MEI (prestador)</h2>
            <p className="text-xs text-gray-500 mb-3">
              O emissor já sabe o CNPJ, a razão social e o endereço (vêm da Receita). Guarde aqui para a ficha ficar completa, principalmente o município, que é o que você informa no emissor.
              Moeda e limite do MEI ficam na tela <Link href="/mei" className="font-bold underline underline-offset-2">Pacote MEI</Link>.
            </p>
            <form onSubmit={savePrestador} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><Label>Nome do MEI (nome empresarial)</Label><input className={inputCls} maxLength={120} value={pf.business_name} onChange={(e) => setP({ business_name: e.target.value })} /></div>
              <div><Label>CNPJ</Label><input className={inputCls} maxLength={20} value={pf.business_cnpj} onChange={(e) => setP({ business_cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></div>
              <div><Label>Inscrição municipal (se tiver)</Label><input className={inputCls} maxLength={20} value={pf.business_im} onChange={(e) => setP({ business_im: e.target.value })} /></div>
              <div className="grid grid-cols-[1fr_5rem] gap-2">
                <div><Label>Município</Label><input className={inputCls} maxLength={80} value={pf.business_municipio} onChange={(e) => setP({ business_municipio: e.target.value })} /></div>
                <div><Label>UF</Label>
                  <select className={inputCls} value={pf.business_uf} onChange={(e) => setP({ business_uf: e.target.value })}>
                    <option value="">--</option>
                    {UF_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select></div>
              </div>
              <div><Label>CEP</Label><input className={inputCls} maxLength={9} inputMode="numeric" value={pf.business_cep} onChange={(e) => setP({ business_cep: e.target.value })} placeholder="00000-000" /></div>
              <div className="sm:col-span-2"><Label>Endereço (logradouro, número e bairro)</Label><input className={inputCls} maxLength={200} value={pf.business_address} onChange={(e) => setP({ business_address: e.target.value })} /></div>
              <div className="sm:col-span-2"><button className={btnCls} type="submit" disabled={busy}>Salvar dados do MEI</button></div>
            </form>
          </Card>
        </>
      )}

      <p className="text-xs text-gray-400">
        Campos, códigos e regras do emissor mudam. A ficha segue o guia público do Emissor Nacional, mas quem manda é a tela do emissor. O Jakash ajuda a organizar, não substitui seu contador.
      </p>
    </div>
  );
}
