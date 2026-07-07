process.env.TZ = 'Asia/Jakarta'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone untuk deployment yang lebih efisien
  output: 'standalone',

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
