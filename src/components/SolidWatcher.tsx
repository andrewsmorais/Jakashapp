"use client";

import { useEffect } from "react";
import { applySolid, watchSolid } from "@/lib/solid";

// Mantém o "Reduzir transparência" em dia: aplica ao abrir e quando o iPhone avisa que o ajuste mudou.
export function SolidWatcher() {
  useEffect(() => { applySolid(); return watchSolid(); }, []);
  return null;
}
