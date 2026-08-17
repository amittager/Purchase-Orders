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
  experimental: {
    serverActions: {
      // Server Actions cap request bodies at 1MB by default — too small
      // for the quote-file upload in createOrder (actions/orders.ts),
      // which allows up to 15MB (MAX_FILE_BYTES). Matches that limit with
      // a little headroom for the rest of the multipart form.
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
