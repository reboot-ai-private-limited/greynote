import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

const config: NextConfig = {
  // A self-contained server.js + the traced node_modules — what the Docker runtime stage copies.
  // Lint runs as its own turbo task (`pnpm lint`), not inside `next build`.
  eslint: { ignoreDuringBuilds: true },
  output: 'standalone',
  // Trace from the repo root so workspace packages are included in the standalone output.
  outputFileTracingRoot: repoRoot,
  // @greynote/contracts ships TypeScript source (no build step).
  transpilePackages: ['@greynote/contracts'],
  // Zones, HQs and Areas became one tree page; keep the old URLs working.
  async redirects() {
    return ['/zones', '/hqs', '/areas'].map((source) => ({ source, destination: '/territory', permanent: false }));
  },
  webpack(webpackConfig) {
    // contracts is NodeNext, so it imports its own files with `.js` suffixes that point at .ts.
    webpackConfig.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return webpackConfig;
  },
};

export default config;
