"use client";

import { useEffect } from "react";

// Abre o app sozinho; o botão serve de plano B (o iOS só abre o link com um toque em alguns casos).
export function OpenApp({ link }: { link: string }) {
  useEffect(() => {
    const t = setTimeout(() => { window.location.href = link; }, 150);
    return () => clearTimeout(t);
  }, [link]);
  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 mb-3">Login concluído</h1>
      <p className="text-gray-600 mb-6">Voltando para o Jakash. Se o app não abrir sozinho, toque no botão.</p>
      <a href={link} className="inline-flex w-full h-12 items-center justify-center rounded-full bg-gradient-to-r from-brand-dark to-brand-accent text-white font-bold text-lg">Abrir o Jakash</a>
    </>
  );
}
