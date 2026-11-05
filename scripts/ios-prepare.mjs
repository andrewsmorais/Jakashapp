// Prepara os plugins do Capacitor para o build iOS com Swift Package Manager.
// O plugin @capacitor-community/apple-sign-in (7.1.0) ainda declara "capacitor-swift-pm from 7.0.0", que no SPM
// significa "7.x" e entra em conflito com o Capacitor 8 do app ("exact 8.5.x"). O código Swift do plugin é só
// ASAuthorizationController e funciona igual; basta liberar a faixa de versão. Rode DEPOIS de `npm ci` e ANTES de `npx cap sync ios`.
// Pode rodar quantas vezes quiser (se já estiver ajustado, não faz nada).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const file = 'node_modules/@capacitor-community/apple-sign-in/Package.swift';
if (!existsSync(file)) {
  console.error(`[ios-prepare] ${file} não encontrado. Rode "npm ci" antes.`);
  process.exit(1);
}
const src = readFileSync(file, 'utf8');
const old = 'capacitor-swift-pm.git", from: "7.0.0")';
if (src.includes(old)) {
  writeFileSync(file, src.replace(old, 'capacitor-swift-pm.git", from: "8.0.0")'));
  console.log('[ios-prepare] apple-sign-in: capacitor-swift-pm liberado para 8.x');
} else if (src.includes('from: "8.0.0"')) {
  console.log('[ios-prepare] apple-sign-in já está ajustado');
} else {
  console.error('[ios-prepare] formato inesperado em', file, '- confira a dependência capacitor-swift-pm.');
  process.exit(1);
}

// Plugin de voz (@capgo/capacitor-speech-recognition 8.x): já traz Package.swift para o Capacitor 8 ("from 8.0.0"), nada a ajustar.
// Só avisa se algum dia vier com a faixa antiga, para não descobrir isso no Codemagic.
const speech = 'node_modules/@capgo/capacitor-speech-recognition/Package.swift';
if (existsSync(speech)) {
  const sp = readFileSync(speech, 'utf8');
  if (/capacitor-swift-pm\.git", (from|exact): "7\./.test(sp)) {
    console.error('[ios-prepare] speech-recognition declara Capacitor 7 no Package.swift: atualize o plugin para a versão 8.x.');
    process.exit(1);
  }
  console.log('[ios-prepare] speech-recognition: Package.swift compatível com o Capacitor 8');
}
