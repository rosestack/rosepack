import { defineRosepack } from "rosepack";

export default defineRosepack({
  defineRuntime: {
    version: true,
  },
  entry: {
    bin: {
      input: "lib/bin/index.ts",
      format: "esm",
    },
    rosepack: "lib/rosepack/index.ts",
    rosetask: "lib/rosetask/index.ts",
  },
  output: {
    format: [
      "esm",
      "cjs",
    ],
    entryName: "[name].[format].js",
    chunkName: "[hash].[format].js",
    esm: {
      shims: true,
    },
  },
  declaration: {
    entry: "lib/rosepack/index.ts",
  },
  clean: true,
  ignoredWarnings: [
    "CIRCULAR_DEPENDENCY",
  ],
});