"use client";

// Etiqueta de quem lançou (só aparece na gestão compartilhada; `name` vem de usePartnership().nameOf).
export function WhoBadge({ name }: { name: string }) {
  if (!name) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-[#262626] px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:text-gray-400">
      {name}
    </span>
  );
}
