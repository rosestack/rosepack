import {defineConfig} from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    coverage: {
      include: [
        "source/**/*.ts",
      ],
      reporter: [
        "html",
      ],
    },
  },
  plugins: [
    tsconfigPaths(),
  ],
});