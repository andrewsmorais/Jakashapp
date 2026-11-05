import { Button } from "@/components/ui/button";

interface CTAButtonProps {
  text: string;
  size?: "default" | "sm" | "lg";
  className?: string;
  href?: string;
}

// Teste grátis = criar a conta no próprio app (7 dias, sem cartão). Link externo só quando passado em `href`.
export function CTAButton({ text, size = "default", className = "", href }: CTAButtonProps) {
  const finalHref = href || "/cadastro";
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
