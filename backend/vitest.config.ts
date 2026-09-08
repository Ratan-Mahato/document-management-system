import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Env vars must exist before src/config/env.ts is imported (it validates at
    // module load and calls process.exit(1) on failure), so set them here.
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    // Prisma/S3 are mocked per-suite; no global setup/teardown needed.
    clearMocks: true,
    restoreMocks: true,
  },
});
