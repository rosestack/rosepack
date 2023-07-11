import { defineRosepack } from "rosepack-dev";

export default defineRosepack({
  define: {
    __DEFINE__: "define",
  },
  defineEnv: {
    DEFINE_ENV: "defineEnv",
  },
  defineDotEnv: true,
  defineRuntime: {
    version: true,
    target: true,
    mode: true,
  },
  //
  clean: true,
  minify: false,
  //
  onBuildStart: (format) => {
    console.log("onBuildStart", format);
  },
  onBuildEnd: (format) => {
    console.log("onBuildEnd", format);
  },
});