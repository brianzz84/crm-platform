process.env.TZ = 'Asia/Jakarta'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  // ESLint dan TypeScript strict check dijalankan terpisah via CI, bukan saat build
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // Izinkan gambar dari domain eksternal yang dipakai (logo tenant, dll)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },

  // Matikan powered-by header
  poweredByHeader: false,
}

export default nextConfig
