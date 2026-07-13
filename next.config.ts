import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@ai-sdk/openai", "ai"],
};

export default nextConfig;
