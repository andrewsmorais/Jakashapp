"use client";

import { useEffect, useState } from "react";
import { Card, Toggle } from "@/components/ui/page";
import { canLockDevice, getBioLockEnabled, setBioLockEnabled, unlockWithBiometrics } from "@/lib/biometricLock";

// Configurações › Bloqueio com Face ID (só no app iOS). Desligado por padrão; vale só neste aparelho.
export function BiometricLockSetting() {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { setOn(getBioLockEnabled()); }, []);

  async function change(v: boolean) {
    setMsg(null);
    if (!v) { setBioLockEnabled(false); setOn(false); return; }
    if (!(await canLockDevice())) { setMsg("Ative o Face ID ou um código de acesso no iPhone para usar o bloqueio."); return; }
    // Confirma uma vez, para a pessoa não ficar trancada para fora por engano.
    if (!(await unlockWithBiometrics())) { setMsg("Não foi possível confirmar. O bloqueio continua desligado."); return; }
    setBioLockEnabled(true);
    setOn(true);
  }

  return (
    <Card>
      <Toggle checked={on} onChange={(v) => void change(v)} label="Bloqueio com Face ID"
        hint="Pede Face ID (ou o código do iPhone) ao abrir o app e ao voltar depois de 5 minutos fora." />
      {msg && <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">{msg}</p>}
    </Card>
  );
}
