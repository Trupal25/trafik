import type { NextConfig } from "next";
import path from "node:path";

const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  // MapLibre GL ships ESM + WebGL workers; listing it here covers any
  // transpilation edge cases under Turbopack.
  transpilePackages: ["maplibre-gl", "react-map-gl"],
  // Multiple lockfiles exist above this project (user-wide package-lock.json);
  // pin the workspace root so Turbopack resolves modules correctly and stays quiet.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
