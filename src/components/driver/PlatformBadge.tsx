import { platformOf } from "@/lib/driverPlatforms";

// Selo da plataforma: cor da marca + iniciais (não é o logotipo oficial).
export function PlatformBadge({ platform, size = 32 }: { platform: string; size?: number }) {
  const p = platformOf(platform);
  const long = p.initials.length >= 3;
  return (
    <span aria-hidden="true" className="shrink-0 inline-flex items-center justify-center font-extrabold select-none"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: p.color, color: p.fg, fontSize: Math.round(size * (long ? 0.28 : 0.38)), letterSpacing: "-0.02em", border: p.color === "#000000" ? "1px solid rgba(255,255,255,0.15)" : undefined }}>
      {p.initials}
    </span>
  );
}
