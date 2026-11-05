import Link from "next/link";

export const authInput = "w-full bg-[#FAFAFA] border border-gray-200 rounded-lg px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00E676] focus:ring-1 focus:ring-[#00E676] transition-colors";
export const authBtn = "w-full h-12 bg-gradient-to-r from-brand-dark to-brand-accent hover:opacity-90 disabled:opacity-60 text-white font-bold text-lg rounded-full transition-opacity shadow-lg shadow-brand-dark/30";

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F3F4F6] p-6 font-sans">
      <Link href="/" className="flex items-center gap-3 mb-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/jacare.jpg" alt="Jakash" width={56} height={56} className="w-14 h-14 rounded-2xl shadow-sm object-cover" />
        <span className="font-bold text-[26px] text-gray-900 tracking-tight">Jakash</span>
      </Link>
      <div className="w-full max-w-[420px] bg-white border border-gray-100 p-8 sm:p-10 rounded-[20px] shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <h1 className="text-2xl font-bold mb-8 text-center text-gray-900">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function Notice({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  return <p role={kind === "error" ? "alert" : "status"} className={`text-sm rounded-lg px-3 py-2 ${kind === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>{children}</p>;
}

export function GoogleButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="w-full h-12 flex items-center justify-center gap-3 border border-gray-200 rounded-full bg-white hover:bg-gray-50 disabled:opacity-60 font-semibold text-gray-800 transition-colors">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
      Continuar com Google
    </button>
  );
}

export function AppleButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="w-full h-12 flex items-center justify-center gap-3 rounded-full bg-black hover:bg-gray-900 disabled:opacity-60 font-semibold text-white transition-colors">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.37 1.43c0 1.14-.46 2.22-1.2 3-.8.86-2.1 1.52-3.17 1.43-.14-1.1.4-2.25 1.12-3 .8-.84 2.17-1.47 3.25-1.43zM20.5 17.3c-.55 1.27-.82 1.84-1.53 2.96-1 1.56-2.4 3.5-4.13 3.52-1.54.02-1.94-1-4.03-.99-2.09.01-2.53 1.01-4.07.99-1.73-.02-3.06-1.77-4.06-3.33C-.2 16.1-.5 10.9 1.2 8.3c1.2-1.85 3.1-2.93 4.88-2.93 1.82 0 2.96 1 4.46 1 1.46 0 2.35-1 4.45-1 1.58 0 3.26.86 4.46 2.35-3.92 2.15-3.28 7.74.55 9.58z"/></svg>
      Continuar com Apple
    </button>
  );
}

export const Divider = () => (
  <div className="flex items-center gap-3 my-5 text-xs text-gray-400"><span className="flex-1 h-px bg-gray-200" />ou<span className="flex-1 h-px bg-gray-200" /></div>
);
