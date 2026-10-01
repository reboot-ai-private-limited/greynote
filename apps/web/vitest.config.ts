import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Node, not jsdom: pure logic is tested; component rendering is not worth the snapshot churn.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
