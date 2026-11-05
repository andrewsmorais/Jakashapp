"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { setDisplayCurrency, type CurrencyCode } from "@/lib/format";

type Language = "pt" | "en" | "es";

interface SettingsContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  t: (key: string) => string;
}

const translations = {
  pt: {
    "menu.dashboard": "Resumo",
    "menu.reports": "Relatórios",
    "menu.accounts": "Contas",
    "menu.cards": "Cartões",
    "menu.transactions": "Transações",
    "menu.invoices": "Faturas",
    "menu.settings": "Configurações",
    "menu.feedback": "Feedback",
    "menu.help": "Ajuda",
    "sidebar.upgrade.title": "Plano Pro",
    "sidebar.upgrade.desc": "Descubra os benefícios da conta PRO",
    "sidebar.upgrade.btn": "Fazer Upgrade",
    "dashboard.title": "Resumo Financeiro",
    "dashboard.balance.title": "Saldo Total",
    "dashboard.balance.vs": "Mês anterior",
    "dashboard.income.title": "Receitas",
    "dashboard.income.vs": "Mês anterior",
    "dashboard.expenses.title": "Despesas",
    "dashboard.expenses.vs": "Mês anterior",
    "dashboard.investments.title": "Investimentos",
    "dashboard.investments.vs": "Mês anterior",
    "dashboard.habits.title": "Hábitos de Consumo",
    "dashboard.habits.desc": "Acompanhe seus gastos por categoria",
    "dashboard.habits.income": "ENTRADAS",
    "dashboard.habits.expense": "SAÍDAS",
    "dashboard.habits.thisYear": "Este ano",
    "dashboard.category.title": "Por Categoria",
    "dashboard.category.desc": "Distribuição dos gastos",
    "dashboard.category.today": "Hoje",
    "dashboard.goals.title": "Metas",
    "dashboard.goals.desc": "Acompanhe seus objetivos",
    "dashboard.empty": "Aguardando sincronização...",
    "settings.title": "Configurações",
    "settings.appearance": "Aparência",
    "settings.theme.light": "Claro",
    "settings.theme.dark": "Escuro",
    "settings.language": "Idioma",
    "settings.language.pt": "Português (Brasil)",
    "settings.language.en": "Inglês",
    "settings.language.es": "Espanhol",
  },
  en: {
    "menu.dashboard": "Dashboard",
    "menu.reports": "Reports",
    "menu.accounts": "Accounts",
    "menu.cards": "Cards",
    "menu.transactions": "Transactions",
    "menu.invoices": "Invoices",
    "menu.settings": "Settings",
    "menu.feedback": "Feedback",
    "menu.help": "Help",
    "sidebar.upgrade.title": "Pro Plan",
    "sidebar.upgrade.desc": "Discover the benefits of PRO",
    "sidebar.upgrade.btn": "Upgrade Now",
    "dashboard.title": "Financial Overview",
    "dashboard.balance.title": "Total Balance",
    "dashboard.balance.vs": "vs Last Month",
    "dashboard.income.title": "Total Income",
    "dashboard.income.vs": "vs Last Month",
    "dashboard.expenses.title": "Total Expenses",
    "dashboard.expenses.vs": "vs Last Month",
    "dashboard.investments.title": "Investments",
    "dashboard.investments.vs": "vs Last Month",
    "dashboard.habits.title": "Spending Habits",
    "dashboard.habits.desc": "Track your category spending",
    "dashboard.habits.income": "INCOME",
    "dashboard.habits.expense": "EXPENSE",
    "dashboard.habits.thisYear": "This year",
    "dashboard.category.title": "By Category",
    "dashboard.category.desc": "Expense distribution",
    "dashboard.category.today": "Today",
    "dashboard.goals.title": "Goals",
    "dashboard.goals.desc": "Track your objectives",
    "dashboard.empty": "Waiting for sync...",
    "settings.title": "Settings",
    "settings.appearance": "Appearance",
    "settings.theme.light": "Light",
    "settings.theme.dark": "Dark",
    "settings.language": "Language",
    "settings.language.pt": "Portuguese (Brazil)",
    "settings.language.en": "English",
    "settings.language.es": "Spanish",
  },
  es: {
    "menu.dashboard": "Resumen",
    "menu.reports": "Reportes",
    "menu.accounts": "Cuentas",
    "menu.cards": "Tarjetas",
    "menu.transactions": "Transacciones",
    "menu.invoices": "Facturas",
    "menu.settings": "Ajustes",
    "menu.feedback": "Comentarios",
    "menu.help": "Ayuda",
    "sidebar.upgrade.title": "Plan Pro",
    "sidebar.upgrade.desc": "Descubre los beneficios PRO",
    "sidebar.upgrade.btn": "Mejorar Plan",
    "dashboard.title": "Resumen Financiero",
    "dashboard.balance.title": "Saldo Total",
    "dashboard.balance.vs": "Mes anterior",
    "dashboard.income.title": "Ingresos",
    "dashboard.income.vs": "Mes anterior",
    "dashboard.expenses.title": "Gastos",
    "dashboard.expenses.vs": "Mes anterior",
    "dashboard.investments.title": "Inversiones",
    "dashboard.investments.vs": "Mes anterior",
    "dashboard.habits.title": "Hábitos de Consumo",
    "dashboard.habits.desc": "Rastrea tus gastos por categoría",
    "dashboard.habits.income": "INGRESOS",
    "dashboard.habits.expense": "GASTOS",
    "dashboard.habits.thisYear": "Este año",
    "dashboard.category.title": "Por Categoría",
    "dashboard.category.desc": "Distribución de gastos",
    "dashboard.category.today": "Hoy",
    "dashboard.goals.title": "Metas",
    "dashboard.goals.desc": "Sigue tus objetivos",
    "dashboard.empty": "Esperando sincronización...",
    "settings.title": "Ajustes",
    "settings.appearance": "Apariencia",
    "settings.theme.light": "Claro",
    "settings.theme.dark": "Oscuro",
    "settings.language": "Idioma",
    "settings.language.pt": "Portugués (Brasil)",
    "settings.language.en": "Inglés",
    "settings.language.es": "Español",
  }
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const CURRENCY_CODES = ["BRL", "USD", "EUR", "GBP", "ARS", "CAD", "AUD"];

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("pt");
  const [currency, setCurrencyState] = useState<CurrencyCode>("BRL");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedLang = localStorage.getItem("app-language") as Language;
    if (savedLang && ["pt", "en", "es"].includes(savedLang)) {
      setLanguageState(savedLang);
    }
    const savedCur = localStorage.getItem("app-currency") as CurrencyCode;
    if (savedCur && CURRENCY_CODES.includes(savedCur)) {
      setCurrencyState(savedCur);
      setDisplayCurrency(savedCur);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("app-language", lang);
  };

  // Troca só o símbolo/formato exibido (sem conversão). Avisa as telas já abertas para reformatarem os valores.
  const setCurrency = (c: CurrencyCode) => {
    setCurrencyState(c);
    setDisplayCurrency(c);
    localStorage.setItem("app-currency", c);
    window.dispatchEvent(new Event("jakash:changed"));
  };

  const t = (key: string) => {
    // @ts-expect-error key is dynamic
    return translations[language][key] || key;
  };

  if (!mounted) {
    return null; // Prevents hydration mismatch
  }

  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false} themes={["light", "dark"]} storageKey="jakash-theme">
      <SettingsContext.Provider value={{ language, setLanguage, currency, setCurrency, t }}>
        {children}
      </SettingsContext.Provider>
    </NextThemesProvider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
