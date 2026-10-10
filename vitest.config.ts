import { defineConfig } from 'vitest/config';

// Two projects, run separately:
//   unit   `npm test`            fast, no build needed. Any `*.test.ts` under src/ is picked up, so a test
//                                sits next to the code it covers (src/scripts/pup-math.test.ts, ...).
//   smoke  `npm run test:smoke`  looks at dist/ and public/, so it needs `npm run build` first.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'smoke', include: ['tests/smoke/**/*.test.ts'], environment: 'node' } },
    ],
  },
});
