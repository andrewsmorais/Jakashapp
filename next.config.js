/** @type {import('next').NextConfig} */
const nextConfig = {
  // O app não usa next/image: sem otimizador, /_next/image não vira proxy de imagens de qualquer site (custo na Vercel).
  images: { unoptimized: true },
}
module.exports = nextConfig
