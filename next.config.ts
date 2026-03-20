import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  basePath: "/ams",


  assetPrefix: isProd ? "/ams/" : undefined,

  trailingSlash: false,


  images: {
    unoptimized: true,
  },


  output: "standalone",
};

export default nextConfig;
