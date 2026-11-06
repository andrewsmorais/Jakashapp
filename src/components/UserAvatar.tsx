/* eslint-disable @next/next/no-img-element */
// Foto do usuário, ou as iniciais do nome quando não há foto.
export function UserAvatar({ name, url, size = 48 }: { name: string; url: string | null; size?: number }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "J";
  const style = { width: size, height: size };
  return url
    ? <img src={url} alt={`Foto de ${name || "perfil"}`} style={style} className="rounded-full object-cover shrink-0" />
    : <div style={{ ...style, fontSize: Math.round(size * 0.36) }} className="rounded-full shrink-0 bg-brand-dark/10 dark:bg-[#262626] text-brand-dark dark:text-brand-soft font-extrabold flex items-center justify-center">{initials}</div>;
}
