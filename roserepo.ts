import { defineRoserepo, Runner } from "roserepo";

export default defineRoserepo({
  root: true,
  monorepo: {
    runner: {
      dev: Runner.many({
        parallel: true,
      }),
      build: Runner.many({
        parallel: false,
        throwOnError: true,
      }),
      lint: Runner.many({
        parallel: false,
        throwOnError: true,
      }),
    },
    upgrade: {
      excludeDependencies: [
        "chalk",
      ],
    },
  },
});