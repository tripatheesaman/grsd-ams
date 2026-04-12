import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/ams",

  trailingSlash: false,

  images: {
    unoptimized: true,
  },

  output: "standalone",
};

export default nextConfig;