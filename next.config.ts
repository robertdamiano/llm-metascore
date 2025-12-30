import type {NextConfig} from "next";

const nextConfig: NextConfig = {
  // Removed "output: export" to enable API routes
  env: {
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  },
};

export default nextConfig;
