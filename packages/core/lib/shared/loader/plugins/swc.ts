import type { PluginImpl } from "rollup";

import { transform } from "@swc/core";

const swcPlugin: PluginImpl = () => {
  return {
    name: "swc",
    async transform( originalCode, id ) {
      const { code } = await transform( originalCode, {
        filename: id,
        jsc: {
          parser: {
            syntax: "typescript",
          },
          target: "esnext",
        },
        minify: false,
        sourceMaps: false,
        configFile: false,
        swcrc: false,
      });

      return {
        code,
      };
    },
  };
};

export default swcPlugin;