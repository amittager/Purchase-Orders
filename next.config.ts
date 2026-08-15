import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pins the workspace root to this project. Without it, Turbopack walks up
  // looking for a lockfile and can pick up an unrelated one elsewhere on
  // the machine (e.g. in a parent directory), which produces a spurious
  // "ignored package-lock.json" warning.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
