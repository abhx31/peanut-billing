import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Load exceljs from node_modules at runtime instead of bundling it.
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
