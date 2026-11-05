import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: "#F5F5F5",
          dark: "#0A0A0A",
          card: "#FFFFFF",
          cardDark: "#1A1A1A",
        },
        primary: {
          DEFAULT: "rgb(var(--brand-accent) / <alpha-value>)",
          dark: "rgb(var(--brand-dark) / <alpha-value>)",
        },
        text: {
          DEFAULT: "#000000",
          light: "#FFFFFF",
          secondary: "#666666",
          secondaryDark: "#A0A0A0",
        },
        brand: {
          dark: 'rgb(var(--brand-dark) / <alpha-value>)',
          accent: 'rgb(var(--brand-accent) / <alpha-value>)',
          vivid: 'rgb(var(--brand-vivid) / <alpha-value>)',
          soft: 'rgb(var(--brand-soft) / <alpha-value>)',
          bg: '#EEF0FB',
          card: '#FFFFFF',
          textMuted: '#9CA3AF'
        }
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'sans-serif'],
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      }
    },
  },
  plugins: [],
};
export default config;
