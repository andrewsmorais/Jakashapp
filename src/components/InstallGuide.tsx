"use client";

import { useEffect, useState } from "react";
import { InstallAppButton, useInstall, type Platform } from "@/components/PWA";

// Passo a passo ilustrado. Os desenhos são telas simuladas em SVG (não são capturas reais), com os textos que o
// Chrome (Android) e o Safari (iPhone) mostram em português. Se o navegador mudar o menu, o texto do passo continua valendo.

const F = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function Phone({ kind, children }: { kind: "android" | "ios"; children: React.ReactNode }) {
  const id = kind + Math.random().toString(36).slice(2, 7);
  return (
    <svg viewBox="0 0 220 440" className="w-full max-w-[200px] mx-auto drop-shadow-lg" role="img" aria-hidden="true" fontFamily={F}>
      <defs><clipPath id={id}><rect x="10" y="10" width="200" height="420" rx={kind === "ios" ? 26 : 20} /></clipPath></defs>
      <rect x="2" y="2" width="216" height="436" rx={kind === "ios" ? 34 : 28} fill="#1F2937" />
      <rect x="10" y="10" width="200" height="420" rx={kind === "ios" ? 26 : 20} fill="#fff" />
      <g clipPath={`url(#${id})`}>
        {children}
        {/* barra de status */}
        <rect x="10" y="10" width="200" height="26" fill="#fff" opacity="0.0" />
        <text x={kind === "ios" ? 36 : 24} y="28" fontSize="10" fontWeight="600" fill="#111827">9:41</text>
        <g fill="#111827"><rect x="172" y="21" width="3" height="7" rx="1" /><rect x="177" y="18" width="3" height="10" rx="1" /><rect x="182" y="15" width="3" height="13" rx="1" /><rect x="190" y="17" width="14" height="10" rx="3" fill="none" stroke="#111827" strokeWidth="1" /><rect x="192" y="19" width="9" height="6" rx="1.5" /></g>
        {kind === "ios" ? <rect x="82" y="14" width="56" height="16" rx="8" fill="#111827" /> : <circle cx="110" cy="22" r="4.5" fill="#111827" />}
      </g>
    </svg>
  );
}

const Tap = ({ x, y }: { x: number; y: number }) => (
  <g>
    <circle cx={x} cy={y} r="17" fill="#7C3AED" opacity="0.18" />
    <circle cx={x} cy={y} r="11" fill="#7C3AED" opacity="0.32" />
    <circle cx={x} cy={y} r="5" fill="#7C3AED" />
  </g>
);
const Ring = (p: { x: number; y: number; w: number; h: number; r?: number }) => <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r ?? 8} fill="#7C3AED" fillOpacity="0.10" stroke="#7C3AED" strokeWidth="2.2" />;
const Logo = ({ x, y, s, r }: { x: number; y: number; s: number; r?: number }) => (
  <g>
    <clipPath id={`lg${x}${y}${s}`}><rect x={x} y={y} width={s} height={s} rx={r ?? s * 0.22} /></clipPath>
    <image href="/jacare.jpg" x={x} y={y} width={s} height={s} clipPath={`url(#lg${x}${y}${s})`} preserveAspectRatio="xMidYMid slice" />
  </g>
);

/** Conteúdo do site (fundo das telas 1). */
const Site = ({ top }: { top: number }) => (
  <g>
    <rect x="10" y={top} width="200" height="420" fill="#F3F4F6" />
    <Logo x={92} y={top + 28} s={36} />
    <text x="110" y={top + 82} fontSize="13" fontWeight="800" fill="#111827" textAnchor="middle">Acesse sua conta</text>
    <rect x="28" y={top + 98} width="164" height="22" rx="7" fill="#fff" stroke="#E5E7EB" />
    <rect x="28" y={top + 128} width="164" height="22" rx="7" fill="#fff" stroke="#E5E7EB" />
    <rect x="28" y={top + 162} width="164" height="24" rx="12" fill="#7C3AED" />
    <text x="110" y={top + 178} fontSize="9.5" fontWeight="700" fill="#fff" textAnchor="middle">Entrar</text>
  </g>
);

const Dim = () => <rect x="10" y="10" width="200" height="420" fill="#000" opacity="0.35" />;

/* ---------------- Android / Chrome ---------------- */
const androidAddressBar = (highlightDots: boolean) => (
  <g>
    <rect x="10" y="36" width="200" height="40" fill="#fff" />
    <rect x="16" y="42" width="116" height="28" rx="14" fill="#F1F3F4" />
    <g fill="none" stroke="#5F6368" strokeWidth="1.4"><rect x="25" y="53" width="7" height="6" rx="1.2" /><path d="M26.5 53v-1.8a2 2 0 0 1 4 0V53" /></g>
    <text x="38" y="60" fontSize="10" fill="#202124">jakash.app</text>
    <rect x="140" y="47" width="17" height="17" rx="4" fill="none" stroke="#5F6368" strokeWidth="1.5" /><text x="148.5" y="59.5" fontSize="9" fontWeight="700" fill="#5F6368" textAnchor="middle">1</text>
    <g fill="#5F6368"><circle cx="192" cy="49" r="1.9" /><circle cx="192" cy="56" r="1.9" /><circle cx="192" cy="63" r="1.9" /></g>
    {highlightDots && <><Ring x={178} y={41} w={28} h={30} r={14} /><Tap x={192} y={56} /></>}
    <rect x="10" y="76" width="200" height="1" fill="#E5E7EB" />
  </g>
);

function AndroidStep1() {
  return <Phone kind="android"><Site top={77} />{androidAddressBar(true)}</Phone>;
}
function AndroidStep2() {
  const items = ["Nova guia", "Nova guia anônima", "Histórico", "Downloads", "Instalar app", "Compartilhar...", "Configurações"];
  return (
    <Phone kind="android"><Site top={77} />{androidAddressBar(false)}<Dim />
      <rect x="84" y="46" width="120" height="226" rx="12" fill="#fff" stroke="#E5E7EB" />
      {items.map((t, i) => {
        const y = 52 + i * 31;
        const hl = t === "Instalar app";
        return (
          <g key={t}>
            {hl && <><Ring x={88} y={y - 2} w={112} h={29} r={8} /></>}
            <rect x="96" y={y + 8} width="9" height="9" rx="2.5" fill={hl ? "#7C3AED" : "#9CA3AF"} />
            <text x="112" y={y + 16.5} fontSize="9.5" fontWeight={hl ? 800 : 500} fill={hl ? "#5B21B6" : "#202124"}>{t}</text>
          </g>
        );
      })}
      <Tap x={190} y={52 + 4 * 31 + 20} />
    </Phone>
  );
}
function AndroidStep3() {
  return (
    <Phone kind="android"><Site top={77} />{androidAddressBar(false)}<Dim />
      <rect x="26" y="150" width="168" height="132" rx="20" fill="#fff" />
      <Logo x={40} y={166} s={34} />
      <text x="84" y="181" fontSize="11" fontWeight="800" fill="#202124">Instalar app?</text>
      <text x="84" y="195" fontSize="8.5" fill="#5F6368">Jakash · jakash.app</text>
      <text x="40" y="228" fontSize="8.5" fill="#5F6368">Você poderá abrir o Jakash direto</text>
      <text x="40" y="240" fontSize="8.5" fill="#5F6368">da tela inicial do celular.</text>
      <text x="108" y="268" fontSize="10" fontWeight="700" fill="#7C3AED" textAnchor="end">Cancelar</text>
      <rect x="124" y="254" width="62" height="22" rx="11" fill="#7C3AED" />
      <text x="155" y="269" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle">Instalar</text>
      <Ring x={120} y={250} w={70} h={30} r={15} /><Tap x={182} y={278} />
    </Phone>
  );
}
function AndroidStep4() {
  return <Home kind="android" />;
}

/* ---------------- iPhone / Safari ---------------- */
const SHARE = (x: number, y: number, c = "#007AFF") => (
  <g fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={`M${x - 6} ${y - 3}h-1.5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-10a2 2 0 0 0-2-2H${x + 6}`} /><path d={`M${x} ${y + 6}V${y - 12}M${x - 4} ${y - 8}l4-4 4 4`} /></g>
);
const iosBars = (hlShare: boolean) => (
  <g>
    <rect x="10" y="344" width="200" height="86" fill="#F2F2F7" />
    <rect x="22" y="350" width="176" height="30" rx="11" fill="#E5E5EA" />
    <text x="110" y="369" fontSize="10.5" fill="#111827" textAnchor="middle">🔒 jakash.app</text>
    <g fill="none" stroke="#007AFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M36 398l-6 6 6 6" /><path d="M72 398l6 6-6 6" /><path d="M150 396h9v13l-4.5-3.5L150 409z" /><rect x="178" y="397" width="12" height="12" rx="2.5" /></g>
    {SHARE(114, 406)}
    {hlShare && <><Ring x={95} y={386} w={38} h={36} r={12} /><Tap x={114} y={405} /></>}
  </g>
);
function IosStep1() { return <Phone kind="ios"><Site top={36} />{iosBars(true)}</Phone>; }
function IosStep2() {
  const rows = ["Copiar", "Adicionar aos Favoritos", "Adicionar à Tela de Início", "Marcação"];
  return (
    <Phone kind="ios"><Site top={36} />{iosBars(false)}<Dim />
      <rect x="10" y="108" width="200" height="322" rx="16" fill="#F2F2F7" />
      <Logo x={22} y={122} s={30} />
      <text x="60" y="135" fontSize="10.5" fontWeight="700" fill="#111827">Jakash</text>
      <text x="60" y="148" fontSize="8.5" fill="#6B7280">jakash.app</text>
      <rect x="22" y="164" width="176" height="64" rx="10" fill="#fff" />
      {["AirDrop", "Mensagens", "Mail"].map((t, i) => <g key={t}><circle cx={48 + i * 56} cy="186" r="14" fill={["#DBEAFE", "#BBF7D0", "#BFDBFE"][i]} /><text x={48 + i * 56} y="216" fontSize="8" fill="#374151" textAnchor="middle">{t}</text></g>)}
      <rect x="22" y="240" width="176" height="124" rx="10" fill="#fff" />
      {rows.map((t, i) => {
        const y = 242 + i * 31; const hl = i === 2;
        return (
          <g key={t}>
            {hl && <Ring x={24} y={y} w={172} h={29} r={8} />}
            <text x="34" y={y + 19} fontSize="9.5" fontWeight={hl ? 800 : 500} fill={hl ? "#5B21B6" : "#111827"}>{t}</text>
            <rect x="172" y={y + 9} width="11" height="11" rx="3" fill="none" stroke={hl ? "#7C3AED" : "#9CA3AF"} strokeWidth="1.5" />
          </g>
        );
      })}
      <Tap x={190} y={242 + 2 * 31 + 24} />
    </Phone>
  );
}
function IosStep3() {
  return (
    <Phone kind="ios"><Site top={36} /><Dim />
      <rect x="10" y="60" width="200" height="370" rx="16" fill="#F2F2F7" />
      <text x="26" y="86" fontSize="10.5" fill="#007AFF">Cancelar</text>
            <text x="196" y="86" fontSize="10.5" fontWeight="700" fill="#007AFF" textAnchor="end">Adicionar</text>
      <rect x="132" y="70" width="70" height="22" rx="11" fill="#7C3AED" fillOpacity="0.1" stroke="#7C3AED" strokeWidth="2.2" /><Tap x={190} y={96} />
      <rect x="22" y="106" width="176" height="76" rx="10" fill="#fff" />
      <Logo x={32} y={118} s={44} />
      <text x="88" y="133" fontSize="10.5" fontWeight="700" fill="#111827">Jakash</text>
      <rect x="86" y="140" width="100" height="1" fill="#E5E7EB" />
      <text x="88" y="158" fontSize="8.5" fill="#6B7280">https://www.jakash.app/</text>
      <text x="26" y="204" fontSize="8" fill="#6B7280">Um ícone será adicionado à sua</text><text x="26" y="215" fontSize="8" fill="#6B7280">tela de início.</text>
    </Phone>
  );
}
function IosStep4() { return <Home kind="ios" />; }

function Home({ kind }: { kind: "android" | "ios" }) {
  const apps = ["#60A5FA", "#34D399", "#F59E0B", "#F472B6", "#A78BFA", "#FB7185", "#22D3EE", "#FBBF24"];
  return (
    <Phone kind={kind}>
      <rect x="10" y="10" width="200" height="420" fill="url(#bg)" />
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C7D2FE" /><stop offset="1" stopColor="#FBCFE8" /></linearGradient></defs>
      <rect x="10" y="10" width="200" height="420" fill="url(#bg)" />
      {apps.map((c, i) => <g key={i}><rect x={26 + (i % 4) * 46} y={70 + Math.floor(i / 4) * 66} width="36" height="36" rx="9" fill={c} opacity="0.75" /><rect x={30 + (i % 4) * 46} y={112 + Math.floor(i / 4) * 66} width="28" height="4" rx="2" fill="#fff" opacity="0.6" /></g>)}
      <Logo x={26} y={202} s={36} r={9} />
      <Ring x={20} y={196} w={48} h={56} r={12} />
      <text x="44" y="262" fontSize="8" fontWeight="700" fill="#111827" textAnchor="middle">Jakash</text>
      <rect x="22" y="368" width="176" height="46" rx="18" fill="#fff" opacity="0.35" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={32 + i * 44} y="376" width="30" height="30" rx="8" fill="#fff" opacity="0.6" />)}
    </Phone>
  );
}

type Step = { title: string; text: string; art: React.ReactNode };

const ANDROID: Step[] = [
  { title: "Abra no Chrome", text: "Entre em jakash.app no Google Chrome e toque nos 3 pontinhos, no canto de cima à direita.", art: <AndroidStep1 /> },
  { title: "Instalar app", text: "No menu, toque em “Instalar app”. Em alguns celulares aparece “Adicionar à tela inicial”.", art: <AndroidStep2 /> },
  { title: "Confirme", text: "Toque em “Instalar” na janelinha que abrir.", art: <AndroidStep3 /> },
  { title: "Pronto!", text: "O ícone do Jakash fica na tela inicial. Abra por ele, em tela cheia, como qualquer app.", art: <AndroidStep4 /> },
];
const IOS: Step[] = [
  { title: "Abra no Safari", text: "Entre em jakash.app no Safari (no iPhone só funciona por ele) e toque em Compartilhar, o quadrado com a seta pra cima.", art: <IosStep1 /> },
  { title: "Tela de Início", text: "Role a lista e toque em “Adicionar à Tela de Início”.", art: <IosStep2 /> },
  { title: "Adicionar", text: "Toque em “Adicionar”, no canto de cima à direita.", art: <IosStep3 /> },
  { title: "Pronto!", text: "O ícone do Jakash fica na tela inicial. Abra por ele, em tela cheia, como qualquer app.", art: <IosStep4 /> },
];

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid grid-cols-2 gap-3 sm:gap-4 mt-4">
      {steps.map((s, i) => (
        <li key={s.title} className="rounded-2xl border border-gray-100 dark:border-[#262626] bg-gray-50/60 dark:bg-[#121212] p-3 text-center">
          {s.art}
          <p className="mt-3 font-extrabold text-sm"><span className="inline-flex w-5 h-5 mr-1.5 items-center justify-center rounded-full bg-brand-dark text-white text-[11px]">{i + 1}</span>{s.title}</p>
          <p className="text-xs text-gray-500 mt-1">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function InstallGuide() {
  const { platform, inApp } = useInstall();
  const [tab, setTab] = useState<"android" | "ios">("android");
  useEffect(() => { setTab(platform === "ios-safari" || platform === "ios-other" ? "ios" : "android"); }, [platform]);
  const hint: Partial<Record<Platform, string>> = {
    "ios-other": "Você está em outro navegador. No iPhone, a instalação só funciona pelo Safari: copie o endereço e abra lá.",
    desktop: "No computador, procure o ícone de instalar na barra de endereço do Chrome ou Edge. O passo a passo abaixo é para o celular.",
  };
  return (
    <div id="como-instalar">
      <h2 className="font-extrabold text-lg">Instalar o Jakash no celular</h2>
      <p className="text-xs text-gray-500">Abre com um toque, em tela cheia, como um app.</p>
      {inApp && <p className="mt-2 text-sm rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 p-3">Você abriu por dentro de outro app (Instagram, WhatsApp...). Toque nos 3 pontinhos e escolha “Abrir no navegador” antes de instalar.</p>}
      {hint[platform] && <p className="mt-2 text-sm text-gray-500">{hint[platform]}</p>}
      <div className="mt-3 inline-flex rounded-full bg-gray-100 dark:bg-[#1E1E1E] p-1 text-sm font-bold" role="tablist">
        {([["android", "Android (Chrome)"], ["ios", "iPhone (Safari)"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-full transition-colors ${tab === k ? "bg-white dark:bg-[#2A2A2A] shadow-sm text-brand-dark dark:text-brand-soft" : "text-gray-500"}`}>{label}</button>
        ))}
      </div>
      <Steps steps={tab === "android" ? ANDROID : IOS} />
      <div className="mt-5 flex flex-col items-center gap-2">
        <InstallAppButton className="w-full sm:w-auto sm:min-w-[220px]" />
      </div>
    </div>
  );
}
