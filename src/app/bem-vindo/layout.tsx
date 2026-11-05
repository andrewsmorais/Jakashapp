import { SettingsProvider } from "@/contexts/SettingsContext";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>;
}
