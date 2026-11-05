import type { Metadata } from "next";
import { AppLayout } from "@/components/AppLayout";
import { SettingsProvider } from "@/contexts/SettingsContext";

// Área logada: nunca deve aparecer em buscadores.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SettingsProvider>
      <AppLayout>
        {children}
      </AppLayout>
    </SettingsProvider>
  );
}
