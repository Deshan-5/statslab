/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    /**
     * remotePatterns declares which external origins next/image is allowed to
     * proxy and optimise. Without this, any <Image src="https://…"> from an
     * external host throws a runtime error.
     *
     * We also set unoptimized=true on the avatar <Image> for Google / GitHub
     * URLs (they already serve WebP), so Next.js never actually proxies those —
     * but the pattern still needs to be listed or the runtime validator rejects
     * the src prop before reaching our component logic.
     */
    remotePatterns: [
      // Google user content (OAuth avatars)
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
      // GitHub avatars
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      // Gravatar (NextAuth fallback)
      {
        protocol: "https",
        hostname: "www.gravatar.com",
      },
      // Unsplash (used in any demo / placeholder images across the app)
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },

  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "sharp$": false,
      "onnxruntime-node$": false,
    };
    config.experiments = {
      ...config.experiments,
      topLevelAwait: true,
      asyncWebAssembly: true,
    };
    return config;
  },
};

export default nextConfig;
