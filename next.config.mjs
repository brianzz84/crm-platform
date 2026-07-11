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

  // VAPID public key di-hardcode karena Railway tidak inject env saat build time
  env: {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BGQKiAIcCA4kEst0IIOLCACmMOiEz2rcFeVOE04I9PBCddTJfJWeZvmbunHqR9GO6UrbZZbh9gmQzbjZONSCfP8',
  },
}

export default nextConfig
