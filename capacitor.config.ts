import type { CapacitorConfig } from '@capacitor/cli';

// App iOS do Jakash: uma casca nativa que carrega o site de verdade (https://www.jakash.app).
// Tudo que muda no site vale na hora no app, sem nova versão na App Store.
// A pasta ios-shell só tem a página de "sem conexão" (fallback quando o site não abre).
const config: CapacitorConfig = {
  appId: 'com.jakash.app',
  appName: 'Jakash',
  webDir: 'ios-shell',
  server: {
    // Quem já está logado é levado para /dashboard pelo middleware (src/middleware.ts).
    url: 'https://www.jakash.app/login',
    // Só estes domínios abrem dentro do app; qualquer outro (wa.me, WhatsApp, e-mail...) abre fora.
    allowNavigation: ['www.jakash.app', 'jakash.app', '*.jakash.app'],
    errorPath: 'index.html',
  },
  // O site reconhece o app por este trecho do User-Agent (src/lib/native.ts).
  appendUserAgent: 'JakashApp/1 (iOS)',
  ios: {
    appendUserAgent: 'JakashApp/1 (iOS)',
    contentInset: 'automatic',
    backgroundColor: '#EEF0FB',
    scheme: 'Jakash',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#EEF0FB',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DEFAULT',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
