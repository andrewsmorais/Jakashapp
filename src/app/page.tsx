"use client";

import { useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Link from "next/link";
import { CTAButton } from "@/components/CTAButton";
import { FAQItem } from "@/components/FAQItem";
import { SectionBadge } from "@/components/SectionBadge";
import { PLANS, PLAN_FEATURES, PLAN_TAGLINE, planPrice, type PlanId } from "@/lib/plans";
import { FAQS, homeJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import {
  CalendarDays, StickyNote, Calculator, 
  CheckCircle2, Lock
} from "lucide-react";

// Preços e listas NÃO ficam aqui: vêm de lib/plans (planPrice, PLAN_FEATURES), a mesma fonte da cobrança.
const LANDING_PLANS: { id: PlanId; title: string; subtitle: string; highlight?: boolean; features: string[] }[] = [
  { id: "cpf", title: PLANS.cpf.name, subtitle: PLAN_TAGLINE.cpf, highlight: true, features: PLAN_FEATURES.cpf },
  { id: "mei", title: PLANS.mei.name, subtitle: PLAN_TAGLINE.mei, features: PLAN_FEATURES.mei },
];

export default function LandingPage() {
  // Intersection Observer for fade-in animations on scroll
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

    document.querySelectorAll('.fade-in-section').forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col min-h-screen font-sans bg-[var(--bg-1)]">
      <JsonLd data={homeJsonLd()} />
      <Header />

      <main>
        {/* 2. HERO SECTION (Light/White) */}
        <section className="relative pt-32 pb-24 px-6 bg-white overflow-hidden rounded-b-[3rem] shadow-sm">
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[800px] h-[800px] bg-brand-accent/5 blur-[120px] rounded-full pointer-events-none"></div>
          
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12 relative z-10">
            <div className="lg:w-1/2 flex flex-col items-start fade-in-section">
              <div className="inline-flex items-center gap-2 bg-brand-dark/5 border border-brand-dark/10 px-4 py-1.5 rounded-full text-sm font-bold text-brand-dark mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-accent opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-accent"></span>
                </span>
                Turma fundadora — 7 dias grátis
              </div>
              
              <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 tracking-tight mb-6 leading-[1.1]">
                Organize seu dinheiro <span className="text-brand-dark italic">todo dia</span>, com uma assistente de IA dentro do app
              </h1>
              
              <p className="text-lg md:text-xl text-gray-500 mb-10 leading-relaxed max-w-xl font-medium">
                Lançamentos, contas a pagar, cartões e parcelas, lista de compras, dívidas, objetivos, MEI separado e família. Tudo num lugar só, com a Jaki, a assistente de IA do app, para tirar dúvidas sobre as suas finanças.
              </p>
              
              <CTAButton text="Testar 7 dias grátis →" size="lg" className="h-16 px-10 text-lg w-full sm:w-auto" />
              <p className="text-sm text-gray-400 font-medium mt-4">Sem precisar cadastrar cartão de crédito</p>
              <Link href="/login" className="mt-3 inline-flex items-center justify-center h-12 px-8 rounded-full border-2 border-brand-dark text-brand-dark font-bold hover:bg-brand-dark/5 transition-colors w-full sm:w-auto">
                Já tenho conta: entrar no app
              </Link>
            </div>

            <div className="lg:w-1/2 w-full relative h-[600px] fade-in-section">
              {/* Fake Phone Mockup */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[650px] bg-white border-[8px] border-gray-100 rounded-[3rem] shadow-2xl animate-float z-10 flex flex-col overflow-hidden ring-1 ring-gray-200">
                 <div className="w-32 h-6 bg-gray-100 absolute top-0 left-1/2 -translate-x-1/2 rounded-b-3xl z-20"></div>
                 {/* Avisos do app */}
                 <div className="flex-1 bg-[#F5F5F5] p-4 flex flex-col gap-4 pt-16">
                    {/* Floating Notifications */}
                    <div className="bg-white border border-gray-100 p-3 rounded-2xl shadow-sm relative -left-8 w-[110%]">
                      <div className="flex items-center gap-2 mb-1"><div className="w-5 h-5 bg-brand-dark rounded-full flex items-center justify-center text-white text-[10px] font-bold">J</div><span className="text-xs text-gray-400 font-bold">Jakash - agora</span></div>
                      <p className="text-sm text-gray-700 font-medium">Sua conta de luz vence amanhã: <span className="font-bold text-brand-dark">R$ 187,40</span></p>
                    </div>

                    <div className="bg-white border border-gray-100 p-3 rounded-2xl shadow-sm relative left-4 w-[100%]">
                      <div className="flex items-center gap-2 mb-1"><div className="w-5 h-5 bg-brand-dark rounded-full flex items-center justify-center text-white text-[10px] font-bold">J</div><span className="text-xs text-gray-400 font-bold">Jakash - há 12 min</span></div>
                      <p className="text-sm text-gray-700 font-medium">Lançamento salvo: Mercado, <span className="font-bold text-brand-dark">R$ 45,00</span> em Alimentação</p>
                    </div>

                    <div className="bg-white border border-gray-100 p-3 rounded-2xl shadow-sm relative -left-4 w-[105%]">
                      <div className="flex items-center gap-2 mb-1"><div className="w-5 h-5 bg-brand-dark rounded-full flex items-center justify-center text-white text-[10px] font-bold">J</div><span className="text-xs text-gray-400 font-bold">Jakash - há 1h</span></div>
                      <p className="text-sm text-gray-700 font-medium">Entrada registrada: Salário, <span className="font-bold text-emerald-600">R$ 4.200,00</span></p>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. SEÇÃO "QUEM FAZ" (Light/Gray) */}
        <section className="py-24 px-6 bg-[var(--bg-1)] text-gray-900">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16 fade-in-section">
            <div className="lg:w-1/2">
              <SectionBadge text="✓ QUEM FAZ" />
              <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                O Gestor de Finanças Automáticas da <span className="text-brand-dark">Jakash</span>
              </h2>
              <p className="text-lg text-gray-500 font-medium mb-8 leading-relaxed">
                No mercado desde 2019, Jakash cuida do Imposto de Renda de quem investe. Agora, traz essa experiência para o seu dia a dia: o Jakash organiza suas contas sem nunca movimentar o seu dinheiro.
              </p>
              <div className="flex flex-wrap gap-4 text-sm font-bold">
                <span className="bg-white shadow-sm border border-gray-100 px-4 py-2 rounded-full">Indicada pela B3</span>
                <span className="bg-white shadow-sm border border-gray-100 px-4 py-2 rounded-full">Prêmio Reclame Aqui 2025</span>
                <span className="bg-white shadow-sm border border-gray-100 px-4 py-2 rounded-full">+400 mil downloads</span>
              </div>
            </div>
            
            <div className="lg:w-1/2 w-full grid grid-cols-2 gap-4">
              <div className="bg-white border border-gray-100 shadow-sm p-8 rounded-[24px] flex items-center justify-center font-extrabold text-2xl h-32 text-brand-dark">
                jakash
              </div>
              <div className="bg-white border border-gray-100 shadow-sm p-8 rounded-[24px] flex items-center justify-center font-bold text-xl h-32 text-gray-900">
                Contas e<br/>cartões
              </div>
              <div className="bg-white border border-gray-100 shadow-sm p-8 rounded-[24px] flex items-center justify-center font-bold text-lg text-center h-32 text-gray-900">
                Assistente<br/>de IA no app
              </div>
              <div className="bg-white border border-gray-100 shadow-sm p-8 rounded-[24px] flex flex-col items-center justify-center h-32 text-gray-400">
                <Lock size={24} className="mb-2" />
                <span className="font-bold text-gray-900">Só leitura</span>
              </div>
            </div>
          </div>
        </section>

        {/* 4. SEÇÃO "SOLUÇÃO" (White) */}
        <section id="funcionalidades" className="py-24 px-6 bg-white text-gray-900 rounded-[3rem] shadow-sm relative z-10">
          <div className="max-w-7xl mx-auto fade-in-section">
            <SectionBadge text="✓ SOLUÇÃO" />
            <h2 className="text-4xl md:text-5xl font-bold mb-16 max-w-2xl">
              Por que usar o Jakash para organizar o seu dinheiro?
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-[var(--bg-1)] p-10 rounded-[2rem] hover:-translate-y-2 transition-transform duration-300">
                <div className="w-16 h-16 bg-white text-brand-dark rounded-2xl flex items-center justify-center mb-8 shadow-sm">
                  <CalendarDays size={32} />
                </div>
                <h3 className="text-xl font-bold mb-4">Lembretes de contas e vencimentos</h3>
                <p className="text-gray-500 font-medium leading-relaxed">Contas a pagar, boletos e faturas de cartão no painel, com lembrete por aviso no aparelho ou e-mail para você não pagar juros.</p>
              </div>
              
              <div className="bg-[var(--bg-1)] p-10 rounded-[2rem] hover:-translate-y-2 transition-transform duration-300">
                <div className="w-16 h-16 bg-white text-brand-dark rounded-2xl flex items-center justify-center mb-8 shadow-sm">
                  <StickyNote size={32} />
                </div>
                <h3 className="text-xl font-bold mb-4">Fim das planilhas de gastos</h3>
                <p className="text-gray-500 font-medium leading-relaxed">Isso só funciona no primeiro dia. Depois, o mês fica em aberto. Deixe o app categorizar para você.</p>
              </div>
              
              <div className="bg-[var(--bg-1)] p-10 rounded-[2rem] hover:-translate-y-2 transition-transform duration-300">
                <div className="w-16 h-16 bg-white text-brand-dark rounded-2xl flex items-center justify-center mb-8 shadow-sm">
                  <Calculator size={32} />
                </div>
                <h3 className="text-xl font-bold mb-4">Todas as suas contas num lugar só</h3>
                <p className="text-gray-500 font-medium leading-relaxed">Abrir cada app de banco, somar, comparar. Cadastre suas contas e cartões e veja saldos e gastos juntos.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. SEÇÃO "AUTOMAÇÃO" (Light/Gray) */}
        <section className="py-32 px-6 bg-[var(--bg-1)] text-gray-900 overflow-hidden">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16 fade-in-section">
            <div className="lg:w-1/2">
              <SectionBadge text="✓ AUTOMAÇÃO" />
              <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                Organização financeira no dia a dia, <br/>
                <span className="text-brand-dark">sem complicação.</span>
              </h2>
              <p className="text-lg text-gray-500 font-medium mb-10 leading-relaxed">
                Cadastre suas contas a pagar e seus cartões. O Jakash lembra você antes do vencimento, por aviso no aparelho ou e-mail. Você só decide.
              </p>
              <CTAButton text="Testar 7 dias grátis →" />
            </div>
            
            <div className="lg:w-1/2 w-full relative h-[500px]">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-full max-w-[400px] h-[500px] bg-brand-dark rounded-[3rem] shadow-2xl overflow-hidden p-8 text-white">
                <div className="pt-6">
                  <p className="text-xs text-white/50 uppercase tracking-widest mb-2 font-bold">Saldo Geral</p>
                  <p className="text-5xl font-bold text-white mb-10">R$ 4.280,50</p>
                  
                  <div className="space-y-4">
                    <div className="bg-white/10 p-5 rounded-2xl flex justify-between items-center backdrop-blur-md">
                      <div className="flex items-center gap-4"><div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-brand-dark font-bold">Nu</div><span className="font-bold text-lg">Nubank</span></div>
                      <span className="font-bold">R$ 1.250,00</span>
                    </div>
                    <div className="bg-white/10 p-5 rounded-2xl flex justify-between items-center backdrop-blur-md">
                      <div className="flex items-center gap-4"><div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">It</div><span className="font-bold text-lg">Itaú</span></div>
                      <span className="font-bold">R$ 3.030,50</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute top-[60%] right-[60%] bg-white p-5 rounded-3xl shadow-xl border border-gray-100 animate-float flex gap-4 w-72 z-20">
                <div className="w-10 h-10 rounded-full bg-brand-accent/20 text-brand-dark flex items-center justify-center shrink-0 text-lg">🔔</div>
                <div>
                  <p className="font-bold text-gray-900">Aviso Importante</p>
                  <p className="text-sm font-medium text-gray-500 mt-1">Sua fatura vence amanhã!</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6. SEÇÃO "DADOS" (White) */}
        <section className="py-24 px-6 bg-white text-gray-900 rounded-t-[3rem] shadow-sm relative z-10">
          <div className="max-w-7xl mx-auto flex flex-col-reverse lg:flex-row items-center gap-16 fade-in-section">
            <div className="lg:w-1/2 w-full flex justify-center items-center py-10">
              <div className="relative w-[350px] h-[350px]">
                {/* Central Logo */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-brand-dark rounded-[24px] flex items-center justify-center text-white font-serif italic font-light text-4xl shadow-2xl z-20">
                  L
                </div>
                {/* Connecting lines & nodes */}
                <svg className="absolute inset-0 w-full h-full text-gray-200" viewBox="0 0 350 350">
                  <circle cx="175" cy="175" r="120" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5,5" className="animate-spin-slow" style={{ animationDuration: '30s' }}/>
                  <line x1="175" y1="175" x2="175" y2="55" stroke="currentColor" strokeWidth="2" />
                  <line x1="175" y1="175" x2="280" y2="115" stroke="currentColor" strokeWidth="2" />
                  <line x1="175" y1="175" x2="280" y2="235" stroke="currentColor" strokeWidth="2" />
                  <line x1="175" y1="175" x2="175" y2="295" stroke="currentColor" strokeWidth="2" />
                  <line x1="175" y1="175" x2="70" y2="235" stroke="currentColor" strokeWidth="2" />
                  <line x1="175" y1="175" x2="70" y2="115" stroke="currentColor" strokeWidth="2" />
                </svg>
                {/* Bank Nodes */}
                <div className="absolute top-[35px] left-[155px] w-10 h-10 bg-purple-600 rounded-full border-4 border-white shadow-md"></div>
                <div className="absolute top-[95px] left-[260px] w-10 h-10 bg-orange-500 rounded-full border-4 border-white shadow-md"></div>
                <div className="absolute top-[215px] left-[260px] w-10 h-10 bg-red-600 rounded-full border-4 border-white shadow-md"></div>
                <div className="absolute top-[275px] left-[155px] w-10 h-10 bg-yellow-400 rounded-full border-4 border-white shadow-md"></div>
                <div className="absolute top-[215px] left-[50px] w-10 h-10 bg-blue-600 rounded-full border-4 border-white shadow-md"></div>
                <div className="absolute top-[95px] left-[50px] w-10 h-10 bg-brand-accent rounded-full border-4 border-white shadow-md"></div>
              </div>
            </div>

            <div className="lg:w-1/2">
              <SectionBadge text="✓ DADOS" />
              <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                Registro rápido, <span className="text-brand-dark">sem planilha</span>
              </h2>
              <p className="text-lg text-gray-500 font-medium mb-8 leading-relaxed">
                Você lança o que gastou ou recebeu e o Jakash organiza: categoria, data e valor no lugar certo, com saldo, limites e objetivos sempre atualizados.
              </p>
              <ul className="space-y-4 mb-10">
                {[
                  'Lançamentos rápidos pelo app',
                  'Importação de extrato em OFX, CSV, planilha ou PDF',
                  'Categorias e subcategorias que você edita',
                  'Painel com saldo, limites e objetivos'
                ].map((item, i) => (
                   <li key={i} className="flex items-center gap-3 font-bold text-gray-800">
                    <div className="w-6 h-6 rounded-full bg-brand-accent/20 flex items-center justify-center shrink-0">
                       <CheckCircle2 size={16} className="text-brand-dark" />
                    </div>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <CTAButton text="Testar 7 dias grátis →" />
            </div>
          </div>
        </section>

        {/* 7. SEÇÃO "CONVERSA" (Dark Green Gradient) */}
        <section className="py-32 px-6 bg-gradient-to-br from-brand-dark to-[#2A1F8F] text-white relative overflow-hidden">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16 relative z-10 fade-in-section">
            <div className="lg:w-1/2">
              <SectionBadge text="✓ CONVERSA" dark />
              <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                A <span className="text-brand-accent italic">Inteligência Artificial</span> que responde sobre o seu dinheiro
              </h2>
              <p className="text-lg text-white/70 font-medium mb-8 leading-relaxed">
                Com os gastos lançados e categorizados, o Chat IA do Jakash responde às suas perguntas: quanto gastei com delivery, quanto ainda sobra do limite, o que vence nesta semana.
              </p>
              <ul className="space-y-4 mb-10">
                {[
                  'Pergunte à Jaki no Chat IA do app, em qualquer plano',
                  'Insights mensais sobre as suas finanças',
                  'Exemplo: "Quanto gastei com delivery?"'
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-lg font-medium">
                    <CheckCircle2 size={24} className="text-brand-accent shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <CTAButton text="Testar 7 dias grátis →" className="bg-white text-brand-dark hover:bg-gray-100" />
            </div>

            <div className="lg:w-1/2 w-full relative">
              <div className="w-full aspect-[4/3] rounded-[2rem] overflow-hidden relative">
                {/* Simulated Image Background */}
                <div className="absolute inset-0 bg-brand-dark/50 bg-[url('https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&q=80&w=1000')] bg-cover bg-center mix-blend-overlay"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#2A1F8F] to-transparent"></div>
                
                {/* Floating Chat Bubble */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-white p-6 rounded-3xl shadow-2xl animate-float text-gray-900">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-brand-dark flex items-center justify-center text-white font-bold text-xs">J</div>
                    <span className="font-bold text-sm text-gray-500">Jaki - agora</span>
                  </div>
                  <p className="text-gray-900 text-[15px] font-medium leading-relaxed">
                    Você gastou R$ 312 em delivery este mês. Ainda está abaixo do orçamento: sobram R$ 88 para usar. 🍔
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 9. SEÇÃO "INÍCIO" (Light) */}
        <section id="como-funciona" className="py-32 px-6 bg-[var(--bg-1)] text-gray-900 text-center">
          <div className="max-w-6xl mx-auto fade-in-section">
            <SectionBadge text="✓ INÍCIO" />
            <h2 className="text-4xl md:text-5xl font-bold mb-20">
              Como funciona o <span className="text-brand-dark">Jakash</span> em 3 passos
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
              <div className="bg-white rounded-[2rem] p-8 flex flex-col items-center shadow-sm">
                <div className="h-32 flex items-center justify-center mb-6">
                  <div className="bg-gray-50 px-6 py-3 rounded-full font-mono font-bold text-lg border border-gray-100 flex items-center gap-3 text-gray-700">
                    <div className="w-8 h-8 rounded-full bg-brand-dark text-white flex items-center justify-center">J</div>
                    Crie sua conta
                  </div>
                </div>
                <h3 className="font-bold text-xl mb-2 text-brand-dark">Passo 1</h3>
                <p className="text-gray-500 font-medium">Cadastro rápido, com 7 dias grátis e sem cartão.</p>
              </div>

              <div className="bg-white rounded-[2rem] p-8 flex flex-col items-center shadow-sm">
                <div className="h-32 flex items-center justify-center mb-6 relative w-full">
                   <div className="w-14 h-14 bg-brand-dark rounded-[16px] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center text-white font-serif italic text-2xl font-light shadow-md">L</div>
                   <div className="w-full flex justify-between absolute top-1/2 -translate-y-1/2 px-4">
                     <div className="w-10 h-10 rounded-full bg-purple-600 shadow-sm"></div>
                     <div className="w-10 h-10 rounded-full bg-orange-500 shadow-sm"></div>
                   </div>
                </div>
                <h3 className="font-bold text-xl mb-2 text-brand-dark">Passo 2</h3>
                <p className="text-gray-500 font-medium">Cadastre suas contas e defina seus limites e objetivos.</p>
              </div>

              <div className="bg-white rounded-[2rem] p-8 flex flex-col items-center shadow-sm">
                <div className="h-32 flex items-center justify-center mb-6">
                  <div className="w-20 h-20 rounded-full bg-brand-accent/20 text-brand-dark flex items-center justify-center">
                    <CheckCircle2 size={40} />
                  </div>
                </div>
                <h3 className="font-bold text-xl mb-2 text-brand-dark">Passo 3</h3>
                <p className="text-gray-500 font-medium">Pronto! Lance seus gastos e acompanhe tudo no painel.</p>
              </div>
            </div>
            
            <CTAButton text="Testar 7 dias grátis →" size="lg" className="h-14 px-12 text-lg" />
          </div>
        </section>

        {/* 10. SEÇÃO "PLANOS" (White) — preços vêm de lib/plans (mesma fonte da cobrança) */}
        <section id="planos" className="py-24 px-6 bg-white text-gray-900 text-center rounded-t-[3rem] shadow-[0_-10px_40px_rgba(0,0,0,0.02)] relative z-10">
          <div className="max-w-6xl mx-auto fade-in-section">
            <SectionBadge text="✓ PLANOS" />
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Escolha o plano <span className="text-brand-dark">do seu jeito</span>
            </h2>
            <p className="text-gray-500 font-medium mb-12">7 dias grátis em qualquer plano, sem cadastrar cartão. Cancele quando quiser.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch text-left max-w-4xl mx-auto">
              {LANDING_PLANS.map((p) => (
                <div key={p.id} className={`relative flex flex-col bg-white rounded-[2rem] p-8 shadow-xl ${p.highlight ? "border-2 border-brand-dark" : "border-2 border-brand-dark/10"}`}>
                  {p.highlight && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold text-white bg-brand-dark px-4 py-1 rounded-full uppercase tracking-widest">Para começar</span>
                  )}
                  <p className="text-xl font-extrabold">{p.title}</p>
                  <p className="text-sm text-gray-500 mb-5">{p.subtitle}</p>
                  <p className="mb-6">
                    <span className="text-5xl font-black text-gray-900">{planPrice(p.id)}</span>
                    <span className="text-gray-400 font-medium"> /mês</span>
                  </p>
                  <ul className="space-y-3 mb-8 font-medium text-gray-600 flex-1">
                    {p.features.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-brand-accent flex items-center justify-center shrink-0 text-white mt-0.5">
                          <CheckCircle2 size={12} />
                        </div>
                        <span className="text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <CTAButton text="Começar teste grátis" className="w-full h-14" />
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-1 text-xs text-gray-400 font-bold">
              <p>Cancele quando quiser, sem multa</p>
              <p>Pagamento seguro via Asaas</p>
            </div>
          </div>
        </section>

        {/* 11. SEÇÃO "RESPOSTAS" (Light/Gray) */}
        <section id="faq" className="py-24 px-6 bg-[var(--bg-1)] text-gray-900">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-16 fade-in-section">
            <div className="md:w-1/3">
              <SectionBadge text="✓ RESPOSTAS" />
              <h2 className="text-3xl font-bold leading-tight sticky top-32 text-gray-900">
                O que as pessoas perguntam antes de conectar
              </h2>
            </div>
            <div className="md:w-2/3">
              {FAQS.map((f, i) => (
                <FAQItem key={f.q} isOpenDefault={i === 0} question={f.q} answer={f.a} />
              ))}
            </div>
          </div>
        </section>

        {/* 12. SEÇÃO FINAL CTA (Dark Green) */}
        <section className="py-32 px-6 bg-brand-dark text-white text-center rounded-t-[3rem] shadow-2xl relative z-20">
          <div className="max-w-3xl mx-auto fade-in-section">
            <h2 className="text-5xl md:text-6xl font-extrabold mb-6 tracking-tight">
              7 dias grátis, sem cadastrar cartão
            </h2>
            <p className="text-xl text-white/70 mb-12 font-medium">
              Depois, a partir de {planPrice("cpf")}/mês. Cancele quando quiser, sem multa.
            </p>
            <CTAButton text="Comece agora, é grátis →" size="lg" className="h-16 px-12 text-xl bg-brand-accent text-white hover:opacity-90" />
            <p className="mt-12 text-sm text-white/50 font-bold">Jakash, feito no Brasil 🇧🇷</p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
