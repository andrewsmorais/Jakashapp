"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ClipboardCopy, Copy, ExternalLink, Info } from "lucide-react";
import { brl } from "@/lib/format";
import { CODIGOS_NFSE_URL, EMISSOR_NACIONAL_URL, NCM_CONSULTA_URL, fichaToText, type Ficha, type FichaIssue } from "@/lib/meiNota";
import { Card, btnCls, btnGhostCls } from "@/components/ui/page";

const badge = {
  obrigatorio: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  recomendado: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
};

function IssueLink({ issue }: { issue: FichaIssue }) {
  const cls = "shrink-0 text-xs font-bold text-brand-dark dark:text-brand-soft underline underline-offset-2";
  // Âncoras (#...) rolam até a seção da própria página; os demais caminhos são telas do app.
  return issue.href.startsWith("#") ? <a href={issue.href} className={cls}>{issue.linkLabel}</a> : <Link href={issue.href} className={cls}>{issue.linkLabel}</Link>;
}

/**
 * A ficha da nota, na ordem das telas do emissor oficial: cada campo com botão de copiar, "Copiar tudo" em texto simples
 * e a lista do que ainda falta. O Jakash não emite nota: tudo aqui é para copiar e colar no emissor.
 */
export function FichaView({ ficha, generatedOn }: { ficha: Ficha; generatedOn: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function copy(key: string, text: string) {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      setError("Não consegui copiar. Selecione o texto e copie manualmente.");
    }
  }

  const required = ficha.issues.filter((x) => x.level === "obrigatorio");
  const advised = ficha.issues.filter((x) => x.level === "recomendado");

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-lg">{ficha.title}</h2>
            <p className="text-3xl font-extrabold mt-1">{brl(ficha.total)}</p>
            {ficha.discount > 0 && <p className="text-xs text-gray-500">{brl(ficha.subtotal)} menos desconto de {brl(ficha.discount)}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnCls} onClick={() => copy("__all", fichaToText(ficha, generatedOn))}>
              {copied === "__all" ? <><Check size={16} /> Copiado</> : <><ClipboardCopy size={16} /> Copiar tudo</>}
            </button>
            {ficha.kind === "servico" && (
              <a className={btnGhostCls + " !py-2.5 !px-4"} href={EMISSOR_NACIONAL_URL} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Abrir o Emissor Nacional</a>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          {ficha.kind === "servico"
            ? "Abra o Emissor Nacional, entre com o gov.br, escolha NFS-e+ › Emissão completa e copie campo a campo, na ordem abaixo."
            : "Abra o emissor de NF-e da SEFAZ do seu estado (procure por “NF-e MEI” no site dela) e copie campo a campo."}
        </p>
        {error && <p className="text-sm text-red-500 font-medium mt-2">{error}</p>}
      </Card>

      <Card className={required.length === 0 ? "!bg-emerald-50 dark:!bg-emerald-500/10" : ""}>
        <h2 className="font-extrabold text-lg flex items-center gap-2">
          {required.length === 0 ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertTriangle size={18} className="text-amber-600" />} Antes de emitir
        </h2>
        {ficha.issues.length === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">Nenhuma pendência: todos os dados que o Jakash conhece estão preenchidos. Confira cada campo na tela do emissor.</p>
        ) : (
          <>
            {required.length === 0 && <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">Os dados principais estão preenchidos. Veja só o que vale conferir:</p>}
            <ul className="mt-2 divide-y divide-black/5 dark:divide-white/5">
              {[...required, ...advised].map((x) => (
                <li key={x.key} className="py-2.5 flex items-start justify-between gap-3">
                  <p className="text-sm flex-1 min-w-0">
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold align-middle ${badge[x.level]}`}>{x.level === "obrigatorio" ? "Falta" : "Confira"}</span>
                    {x.message}
                  </p>
                  <IssueLink issue={x} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {ficha.sections.map((s) => (
        <Card key={s.id}>
          <h2 className="font-extrabold text-lg">{s.title}</h2>
          {s.note && <p className="text-xs text-gray-500 mt-1 flex items-start gap-1.5"><Info size={14} className="shrink-0 mt-0.5" />{s.note}</p>}
          <ul className="mt-3 space-y-2">
            {s.fields.map((f) => {
              const key = `${s.id}.${f.key}`;
              const flagged = f.missing && f.need;
              return (
                <li key={key} className={`rounded-2xl px-4 py-3 flex items-center justify-between gap-3 ${flagged ? "bg-amber-50 dark:bg-amber-500/10" : "bg-brand-dark/5 dark:bg-[#1E1E1E]"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">{f.label}</p>
                    {f.value ? <p className="font-bold break-words">{f.value}</p> : (
                      <p className={`text-sm font-bold ${flagged ? (f.need === "obrigatorio" ? "text-red-500" : "text-amber-600 dark:text-amber-300") : "text-gray-400"}`}>
                        {flagged ? (f.need === "obrigatorio" ? "Falta preencher" : "Vale preencher") : "Não informado"}
                      </p>
                    )}
                    {f.hint && <p className="text-[11px] text-gray-500 mt-0.5">{f.hint}</p>}
                  </div>
                  {f.copy && (
                    <button type="button" className={btnGhostCls + " !py-2 !px-3 shrink-0"} onClick={() => copy(key, f.copy)} aria-label={`Copiar ${f.label}`}>
                      {copied === key ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {s.id === "servico" && (
            <p className="text-xs text-gray-500 mt-3">
              Não achou o código? <a className="font-bold underline underline-offset-2" href={CODIGOS_NFSE_URL} target="_blank" rel="noopener noreferrer">Lista oficial de códigos de tributação nacional</a>
              {" "}ou digite parte do nome do serviço direto no emissor.
            </p>
          )}
          {s.id === "item-1" && (
            <p className="text-xs text-gray-500 mt-3">
              <a className="font-bold underline underline-offset-2" href={NCM_CONSULTA_URL} target="_blank" rel="noopener noreferrer">Portal Único Siscomex</a> (acesso público à classificação fiscal).
            </p>
          )}
        </Card>
      ))}

      {ficha.notes.length > 0 && (
        <Card>
          <h2 className="font-extrabold text-lg flex items-center gap-2"><Info size={18} /> Preciso emitir esta nota?</h2>
          {ficha.notes.map((n) => <p key={n} className="text-sm text-gray-600 dark:text-gray-300 mt-2">{n}</p>)}
        </Card>
      )}
    </div>
  );
}
