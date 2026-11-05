"use client";

import { useEffect, useState } from "react";

// "Esconder valores" (olho): preferência só deste navegador.
export function useHideValues() {
  const [hide, setHide] = useState(false);

  useEffect(() => {
    try { setHide(localStorage.getItem("jakash:hide") === "1"); } catch { /* sem storage */ }
  }, []);

  const toggle = () => {
    setHide((h) => {
      try { localStorage.setItem("jakash:hide", h ? "0" : "1"); } catch { /* sem storage */ }
      return !h;
    });
  };

  const money = (formatted: string) => (hide ? "R$ ••••" : formatted);
  return { hide, toggle, money };
}
