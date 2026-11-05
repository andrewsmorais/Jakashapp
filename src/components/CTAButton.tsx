import { Button } from "@/components/ui/button";
import { APP_STORE_URL } from "@/lib/links";

interface CTAButtonProps {
  text: string;
  size?: "default" | "sm" | "lg";
  className?: string;
  href?: string;
}

// A página não vende nem cadastra: o botão leva para a App Store (ou para o `href` passado).
export function CTAButton({ text, size = "default", className = "", href }: CTAButtonProps) {
  const finalHref = href || APP_STORE_URL;
  const external = /^https?:\/\//.test(finalHref);

  return (
    <a href={finalHref} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="inline-block group">
      <Button
        size={size}
        className={`bg-brand-dark text-white font-bold rounded-full hover:opacity-90 hover:scale-105 hover:shadow-lg hover:shadow-brand-dark/30 transition-all duration-300 ${className}`}
      >
        {text}
      </Button>
    </a>
  );
}
