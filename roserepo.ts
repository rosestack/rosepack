import {defineRoserepo, Runner, Cache, Hooks} from "roserepo";

export default defineRoserepo({
  root: true,
  runner: {
    watch: Runner.many({
      parallel: true,
      throwOnError: false
    }),
    build: Runner.pipeline({
      parallel: true,
      throwOnError: true,
      dependency: "build",
      cache: Cache.file({
        include: [
          "dist/**/*",
          "source/**/*",
          "package.json",
          "tsconfig.json"
        ]
      })
    }),
    test: Runner.pipeline({
      parallel: false,
      throwOnError: true,
      self: "build",
      cache: Cache.file({
        include: [
          "dist/**/*",
          "source/**/*",
          "package.json",
          "tsconfig.json"
        ]
      })
    }),
    lint: Runner.many({
      parallel: true,
      throwOnError: true
    })
  },
  exclude: [
    "examples/**/*",
  ],
  hooks: [
    Hooks.preCommit({
      script: "test"
    })
  ]
});