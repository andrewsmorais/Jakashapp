"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native";

/**
 * true só dentro do app iOS. Começa false (igual ao servidor, sem erro de hidratação) e confirma depois de montar.
 * `checked` avisa quando a resposta já é definitiva (útil para não piscar preço/botão de compra antes de saber).
 */
export function useIsNative(): { native: boolean; checked: boolean } {
  const [state, setState] = useState({ native: false, checked: false });
  useEffect(() => { setState({ native: isNativeApp(), checked: true }); }, []);
  return state;
}
