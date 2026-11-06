// Pacote MEI: com um plano só, abre para quem assina (o bloqueio de quem não assina é feito no middleware).
export default function MeiLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
