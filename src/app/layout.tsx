import type { Metadata, Viewport } from "next";
import { PWARegister } from "@/components/PWA";
import { RefCapture } from "@/components/Referral";
import { NativeBridge } from "@/components/NativeBridge";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.jakash.app"),
  title: "Jakash | Organize seu dinheiro com IA",
  description: "Organize seu dinheiro no dia a dia: lançamentos, contas a pagar, cartões, dívidas e objetivos, com assistente de IA dentro do app. 7 dias grátis, sem cartão.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  openGraph: {
    title: "Jakash | Organize seu dinheiro com IA",
    description: "Organize seu dinheiro no dia a dia, com assistente de IA dentro do app. 7 dias grátis, sem cartão.",
    url: "https://www.jakash.app",
    siteName: "Jakash",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Jakash: organize seu dinheiro com IA" }],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jakash | Organize seu dinheiro com IA",
    description: "Organize seu dinheiro no dia a dia, com assistente de IA dentro do app.",
    images: ["/og-image.jpg"],
  },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Jakash", statusBarStyle: "default" },
  applicationName: "Jakash",
  formatDetection: { telephone: false },
  authors: [{ name: "Jakash", url: "https://www.jakash.app" }],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#5B5BF0" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{var a=localStorage.getItem('jakash-accent');if(a)document.documentElement.dataset.accent=a}catch(e){}" }} />
      </head>
      <body className={`${jakarta.variable} font-sans antialiased overflow-x-hidden selection:bg-primary selection:text-white`}>
        <PWARegister />
        <RefCapture />
        <NativeBridge />
        {children}
      </body>
    </html>
  );
}
