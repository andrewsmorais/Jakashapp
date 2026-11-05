interface SectionBadgeProps {
  text: string;
  dark?: boolean;
}

export function SectionBadge({ text, dark = false }: SectionBadgeProps) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-6 ${
      dark 
        ? 'bg-white/10 text-white border border-white/20' 
        : 'bg-brand-dark/10 text-brand-dark border border-brand-dark/10'
    }`}>
      {text}
    </div>
  );
}
