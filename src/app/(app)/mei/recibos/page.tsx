"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSupabase } from "@/lib/useSupabase";
import { brl, formatDateBR, todayISO } from "@/lib/format";
import { BackTitle, Card, Empty, ErrorNote, Label, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";
import { AlertTriangle, Plus, Printer } from "lucide-react";
import { receiptNotesFor } from "@/lib/meiNota";

type MeiClient = { id: string; name: string };
type CatalogOpt = { id: string; name: string; description: string | null; unit_price: number };
type Invoice = {
  id: string;
  invoice_number: number;
  client_id: string | null;
  client_name: string | null;
  value: number;
  invoice_date: string;
  notes: string | null;
};

export default function RecibosPage() {
  const { supabase, userId, ready } = useSupabase();
  const today = todayISO();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [clients, setClients] = useState<MeiClient[]>([]);
  const [catalog, setCatalog] = useState<CatalogOpt[]>([]);
  const [catalogId, setCatalogId] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [nextNumber, setNextNumber] = useState(1);

  // Form state
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [value, setValue] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Carregar clientes
    const { data: clientsData, error: clientsError } = await supabase
      .from("mei_clients")
      .select("id,name")
      .eq("user_id", userId!)
      .eq("archived", false)
      .order("name");

    if (clientsError) {
      setError("Não foi possível carregar os clientes.");
      setLoading(false);
      return;
    }

    setClients((clientsData ?? []) as MeiClient[]);

    // Catálogo de produtos e serviços (opcional: se falhar, o recibo continua funcionando sem ele)
    const { data: catalogData } = await supabase
      .from("mei_items")
      .select("id,name,description,unit_price")
      .eq("archived", false)
      .order("name");
    setCatalog(((catalogData ?? []) as CatalogOpt[]).map((x) => ({ ...x, unit_price: Number(x.unit_price) })));

    // Carregar recibos
    const { data: invoicesData, error: invoicesError } = await supabase
      .from("mei_invoices")
      .select("id,invoice_number,client_id,client_name,value,invoice_date,notes")
      .eq("user_id", userId!)
      .order("invoice_date", { ascending: false })
      .order("invoice_number", { ascending: false });

    if (invoicesError) {
      setError("Não foi possível carregar os recibos.");
      setLoading(false);
      return;
    }

    const invs = (invoicesData ?? []) as Invoice[];
    setInvoices(invs);

    // Próximo número de recibo
    const maxNumber = invs.length > 0 ? Math.max(...invs.map((i) => i.invoice_number)) : 0;
    setNextNumber(maxNumber + 1);

    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    if (ready && userId) load();
  }, [ready, userId, load]);

  const flash = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(null), 3000);
  };

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const v = parseFloat(value);
    if (!(v > 0)) {
      setError("Informe um valor maior que zero.");
      return;
    }

    const selectedClientId = clientId || null;
    const selectedClientName = clientId
      ? clients.find((c) => c.id === clientId)?.name || clientName || "Cliente"
      : clientName.trim() || "Cliente";

    const { error: err } = await supabase.from("mei_invoices").insert({
      user_id: userId,
      invoice_number: nextNumber,
      client_id: selectedClientId,
      client_name: selectedClientName,
      value: v,
      invoice_date: invoiceDate,
      notes: notes.trim() || null,
    });

    if (err) {
      if (err.message.includes("unique")) {
        setError(`O número ${nextNumber} já foi usado. Recarregue a página.`);
      } else {
        setError("Não foi possível criar o recibo.");
      }
    } else {
      setClientId("");
      setClientName("");
      setCatalogId("");
      setValue("");
      setNotes("");
      setInvoiceDate(today);
      flash(`Recibo #${nextNumber} criado.`);
      load();
    }
  }

  // Escolher um item do catálogo preenche a descrição e o valor (continua editável)
  const pickCatalog = (id: string) => {
    setCatalogId(id);
    const it = catalog.find((c) => c.id === id);
    if (!it) return;
    setNotes(receiptNotesFor(it));
    if (it.unit_price > 0) setValue(String(it.unit_price));
  };

  const printInvoice = (invoice: Invoice) => {
    const html = generateInvoiceHtml(invoice);
    const printWindow = window.open("", "", "height=600,width=800");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20 space-y-6">
      <BackTitle
        title="Recibos"
        subtitle="Registre as notas/recibos emitidas. Use a impressão para gerar PDF. Sem integração com sistema fiscal."
      />

      <ErrorNote message={error} />
      {note && <p className="text-sm font-bold text-emerald-600">{note}</p>}

      <Card className="!bg-blue-50 dark:!bg-blue-500/10">
        <div className="flex items-start gap-2">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-bold">Recibos simples, sem valor fiscal.</p>
            <p className="mt-1">
              Este é um registro interno do Jakash. Para emissão de Notas Fiscais com valor legal,
              você precisaria de um sistema fiscal integrado (RPA, NFC-e, etc.), que é uma solução
              paga. Aqui você registra apenas para seu controle interno.
            </p>
            <p className="mt-1">
              O MEI emite a nota de serviço sem custo no emissor do governo. A{" "}
              <Link href="/mei/nota" className="font-bold underline underline-offset-2">Ficha da nota fiscal</Link>{" "}
              reúne todos os dados para você copiar lá.
            </p>
          </div>
        </div>
      </Card>

      {/* Formulário para criar recibo */}
      <Card>
        <h2 className="font-extrabold text-lg mb-4">Novo recibo #{nextNumber}</h2>
        <form onSubmit={createInvoice} className="space-y-4">
          {catalog.length > 0 && (
            <div>
              <Label>Produto ou serviço do catálogo (opcional)</Label>
              <select className={inputCls} value={catalogId} onChange={(e) => pickCatalog(e.target.value)}>
                <option value="">Sem item do catálogo</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.unit_price > 0 ? ` · ${brl(c.unit_price)}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Cliente</Label>
              <select
                className={inputCls}
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  if (e.target.value) setClientName("");
                }}
              >
                <option value="">Selecione ou digite nome</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {!clientId && (
              <div>
                <Label>Nome do cliente (se não tiver cadastro)</Label>
                <input
                  type="text"
                  className={inputCls}
                  maxLength={120}
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ex: João Silva"
                />
              </div>
            )}

            <div>
              <Label>Valor</Label>
              <input
                type="number"
                className={inputCls}
                inputMode="decimal"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label>Data do recibo</Label>
              <input
                type="date"
                className={inputCls}
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Notas (opcional)</Label>
            <textarea
              className={inputCls + " resize-none"}
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Descrição do serviço/produto, referência do pedido, etc."
            />
          </div>

          <button className={btnCls + " w-full sm:w-auto"} type="submit">
            <Plus size={16} className="inline mr-1.5" />
            Criar recibo #{nextNumber}
          </button>
        </form>
      </Card>

      {/* Lista de recibos */}
      <Card>
        <h2 className="font-extrabold text-lg mb-4">Recibos registrados ({invoices.length})</h2>
        {loading ? (
          <Empty>Carregando…</Empty>
        ) : invoices.length === 0 ? (
          <Empty>Nenhum recibo criado ainda.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/5">
                  <th className="text-left py-2 px-3 font-bold text-gray-600 dark:text-gray-400">#</th>
                  <th className="text-left py-2 px-3 font-bold text-gray-600 dark:text-gray-400">Cliente</th>
                  <th className="text-left py-2 px-3 font-bold text-gray-600 dark:text-gray-400">Data</th>
                  <th className="text-right py-2 px-3 font-bold text-gray-600 dark:text-gray-400">Valor</th>
                  <th className="text-center py-2 px-3 font-bold text-gray-600 dark:text-gray-400">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <td className="py-3 px-3 font-bold">{inv.invoice_number}</td>
                    <td className="py-3 px-3">
                      <div>
                        <p className="font-bold text-gray-800 dark:text-gray-100">{inv.client_name || "—"}</p>
                        {inv.notes && <p className="text-xs text-gray-500 mt-0.5">{inv.notes}</p>}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-gray-600 dark:text-gray-400">{formatDateBR(inv.invoice_date)}</td>
                    <td className="py-3 px-3 text-right font-bold text-gray-800 dark:text-gray-100">{brl(inv.value)}</td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => printInvoice(inv)}
                        className={btnGhostCls + " !py-1.5 !px-2.5 text-xs"}
                        title="Imprimir como PDF"
                      >
                        <Printer size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href="/mei/clientes" className={btnGhostCls}>
          Ir para clientes e cobranças
        </Link>
        <Link href="/mei/produtos" className={btnGhostCls}>
          Produtos e serviços
        </Link>
        <Link href="/mei/nota" className={btnGhostCls}>
          Ficha da nota fiscal
        </Link>
      </div>
    </div>
  );
}

function generateInvoiceHtml(invoice: Invoice): string {
  const dateObj = new Date(invoice.invoice_date + "T00:00:00");
  const formattedDate = dateObj.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recibo #${invoice.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 40px auto; padding: 40px; border: 2px solid #333; }
    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { font-size: 24px; margin-bottom: 5px; }
    .header p { font-size: 14px; color: #666; }
    .number { font-size: 18px; font-weight: bold; margin-top: 10px; }
    .section { margin: 30px 0; }
    .section-title { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #666; margin-bottom: 10px; }
    .section-content { font-size: 14px; line-height: 1.6; }
    .client { font-weight: bold; }
    .notes { font-style: italic; color: #666; font-size: 13px; }
    .amount-section {
      display: flex;
      justify-content: space-between;
      font-size: 16px;
      font-weight: bold;
      border-top: 2px solid #333;
      border-bottom: 2px solid #333;
      padding: 15px 0;
      margin: 30px 0;
    }
    .footer {
      text-align: center;
      font-size: 12px;
      color: #999;
      border-top: 1px solid #ddd;
      padding-top: 20px;
      margin-top: 30px;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .container { margin: 0; padding: 20px; border: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>RECIBO</h1>
      <p>Registro interno de faturamento</p>
      <div class="number">#${invoice.invoice_number}</div>
    </div>

    <div class="section">
      <div class="section-title">Cliente</div>
      <div class="section-content client">${escapeHtml(invoice.client_name || "Não informado")}</div>
    </div>

    <div class="section">
      <div class="section-title">Data</div>
      <div class="section-content">${formattedDate}</div>
    </div>

    ${
      invoice.notes
        ? `
    <div class="section">
      <div class="section-title">Descrição</div>
      <div class="section-content notes">${escapeHtml(invoice.notes)}</div>
    </div>
    `
        : ""
    }

    <div class="amount-section">
      <span>Valor:</span>
      <span>${(invoice.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
    </div>

    <div class="footer">
      <p>Emitido por Jakash - Gestor Financeiro</p>
      <p>Recibo gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
      <p style="margin-top: 10px; color: #ccc;">Este documento é um registro interno. Sem valor fiscal.</p>
    </div>
  </div>
</body>
</html>
  `;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
