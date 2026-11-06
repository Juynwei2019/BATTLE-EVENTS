import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite"],
};
export default config;
