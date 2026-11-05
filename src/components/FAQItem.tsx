"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FAQItemProps {
  question: string;
  answer: string;
  isOpenDefault?: boolean;
}

export function FAQItem({ question, answer, isOpenDefault = false }: FAQItemProps) {
  const [isOpen, setIsOpen] = useState(isOpenDefault);

  return (
    <div className="border border-gray-200 bg-white rounded-[24px] overflow-hidden mb-4 shadow-sm hover:shadow-md transition-shadow">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 text-left focus:outline-none"
        aria-expanded={isOpen}
      >
        <span className="font-bold text-lg text-gray-900">{question}</span>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${isOpen ? 'bg-brand-dark text-white' : 'bg-gray-100 text-gray-500'}`}>
          <ChevronDown className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} size={20} />
        </div>
      </button>
      <div 
        className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="p-6 pt-0 text-gray-500 font-medium leading-relaxed mt-2">
          {answer}
        </div>
      </div>
    </div>
  );
}
