"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, MessageCircle, Receipt } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, parseMoney, todayISO } from "@/lib/format";
import { PIX_TYPES, buildPixPayload, normalizePixKey, validatePixKey, type PixKeyType } from "@/lib/pix";
import { Card, ErrorNote, Label, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";

export type PixProfile = { pix_key: string | null; pix_key_type: string | null; pix_name: string | null; pix_city: string | null; fallbackName: string };

// Cobrança por Pix com QR "copia e cola" estático. Gerado aqui, sem custo; o dinheiro cai direto na sua conta.
export function PixCharge({ profile, onSaved }: { profile: PixProfile; onSaved: () => void }) {
  const { supabase, userId } = useSupabase();
  const [type, setType] = useState<PixKeyType>((profile.pix_key_type as PixKeyType) || "cpf");
  const [key, setKey] = useState(profile.pix_key ?? "");
  const [name, setName] = useState(profile.pix_name ?? profile.fallbackName.slice(0, 25));
  const [city, setCity] = useState(profile.pix_city ?? "");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [qr, setQr] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientId, setClientId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keyError = key.trim() ? validatePixKey(type, key) : null;
  const value = parseMoney(amount);
  const ready = Boolean(key.trim()) && !keyError && name.trim().length > 0 && city.trim().length > 0;
  const payload = useMemo(
    () => (ready ? buildPixPayload({ type, key, name, city, amount: value > 0 ? value : undefined, description: desc.trim() || undefined }) : ""),
    [ready, type, key, name, city, value, desc]
  );

  useEffect(() => {
    let off = false;
    if (!payload) { setQr(""); return; }
    import("qrcode").then((m) => m.toDataURL(payload, { margin: 1, width: 260, errorCorrectionLevel: "M" }))
      .then((url) => { if (!off) setQr(url); })
      .catch(() => { if (!off) setQr(""); });
    return () => { off = true; };
  }, [payload]);

  useEffect(() => {
    if (!userId) return;
    let off = false;
    supabase.from("mei_clients").select("id,name").eq("archived", false).order("name").then(({ data }) => { if (!off) setClients((data ?? []) as { id: string; name: string }[]); });
    return () => { off = true; };
  }, [supabase, userId]);

  const note = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2500); };

  async function saveKey() {
    setError(null);
    if (!ready) { setError(keyError ?? "Preencha a chave, o nome e a cidade."); return; }
    const { error: err } = await supabase.from("profiles").update({
      pix_key: normalizePixKey(type, key), pix_key_type: type, pix_name: name.trim().slice(0, 25), pix_city: city.trim().slice(0, 15),
    }).eq("id", userId!);
    if (err) setError("Não foi possível salvar a chave."); else { note("Chave salva."); onSaved(); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(payload); note("Código copiado."); } catch { setError("Não consegui copiar. Selecione o código e copie manualmente."); }
  }

  async function registerReceivable() {
    setError(null);
    if (!(value > 0)) { setError("Informe o valor para registrar a cobrança."); return; }
    const { error: err } = await supabase.from("bills").insert({
      user_id: userId, description: desc.trim() || "Cobrança Pix", amount: value, due_date: todayISO(), type: "income",
      is_business: true, client_id: clientId || null,
    });
    if (err) setError("Não foi possível registrar."); else { note("Registrada em Clientes e a receber. Dê baixa quando o Pix cair."); window.dispatchEvent(new Event("jakash:changed")); }
  }

  const share = `https://wa.me/?text=${encodeURIComponent(`${desc.trim() ? desc.trim() + "\n" : ""}${value > 0 ? `Valor: ${brl(value)}\n` : ""}Pix copia e cola:\n${payload}`)}`;

  return (
    <Card>
      <h2 className="font-extrabold text-lg">Cobrar por Pix</h2>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Gera o QR e o código &quot;copia e cola&quot; na hora, sem custo. O Pix cai direto na sua conta; o app não vê o pagamento, então dê baixa em Contas a receber.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label>Tipo da chave</Label>
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as PixKeyType)}>
            {PIX_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select></div>
        <div><Label>Chave Pix</Label><input className={inputCls} value={key} onChange={(e) => setKey(e.target.value)} placeholder={type === "telefone" ? "11 99999-8888" : type === "email" ? "voce@email.com" : ""} />
          {keyError && <p className="text-xs text-red-500 mt-1">{keyError}</p>}</div>
        <div><Label>Nome de quem recebe (até 25)</Label><input className={inputCls} maxLength={25} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Cidade (até 15)</Label><input className={inputCls} maxLength={15} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex.: São Paulo" /></div>
        <div><Label>Valor (opcional)</Label><input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Em branco = o cliente digita" /></div>
        <div><Label>Descrição (opcional)</Label><input className={inputCls} maxLength={40} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Pedido 15" /></div>
        {clients.length > 0 && (
          <div className="sm:col-span-2"><Label>Cliente (opcional, para registrar a receber)</Label>
            <select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Sem cliente</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" className={btnGhostCls} onClick={saveKey}>Salvar minha chave</button>
        {msg && <span className="text-sm font-bold text-emerald-600 self-center">{msg}</span>}
      </div>
      <ErrorNote message={error} />

      {payload && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-[260px_1fr] gap-5 items-start">
          <div className="rounded-2xl bg-white p-2 w-[276px] max-w-full mx-auto sm:mx-0 border border-gray-100">
            {qr ? <img src={qr} alt="QR Code do Pix" width={260} height={260} className="w-full h-auto" /> : <div className="aspect-square flex items-center justify-center text-sm text-gray-400">Gerando…</div>}
          </div>
          <div className="min-w-0">
            <Label>Copia e cola</Label>
            <textarea readOnly className={inputCls + " font-mono text-xs h-28 resize-none"} value={payload} onFocus={(e) => e.currentTarget.select()} />
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" className={btnCls} onClick={copy}><Copy size={16} /> Copiar</button>
              <a className={btnGhostCls + " !py-2.5 !px-4"} href={share} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Enviar no WhatsApp</a>
              <button type="button" className={btnGhostCls + " !py-2.5 !px-4"} onClick={registerReceivable}><Receipt size={14} /> Registrar a receber</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
