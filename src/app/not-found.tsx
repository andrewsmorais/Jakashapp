import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export const metadata = {
  title: 'Página Não Encontrada | Jakash',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-1)] font-sans">
      <Header />
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-12 rounded-[3rem] shadow-sm max-w-lg w-full border border-gray-100">
          <div className="w-24 h-24 bg-brand-dark/10 text-brand-dark rounded-full flex items-center justify-center text-4xl font-bold mx-auto mb-6">
            404
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Página não encontrada</h1>
          <p className="text-gray-500 mb-8 font-medium">
            A página que você está procurando não existe, foi movida ou está temporariamente indisponível.
          </p>
          <Link 
            href="/" 
            className="inline-flex items-center justify-center h-14 px-8 rounded-full bg-brand-dark text-white font-bold hover:opacity-90 transition-colors"
          >
            Voltar para o Início
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
