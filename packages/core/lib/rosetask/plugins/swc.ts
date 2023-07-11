import type { PluginImpl } from "rollup";

import ts from "typescript";

import type { Options as SwcOptions } from "@swc/core";
import { transform } from "@swc/core";

import rosetask from "~/rosetask";

import { deepMerge } from "~shared/utils";

import path from "path";

interface Options {
  swcOptions: SwcOptions;
}

const swcPlugin: PluginImpl<Options> = (options) => {
  const extensions = [ ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx" ];

  return {
    name: "swc",
    transform: {
      order: "post",
      handler: async(originalCode: string, id: string) => {
        const ext = path.extname(id);

        if ( !extensions.includes(ext) ) {
          return null;
        }

        const isTypescript = (/(ts|tsx)$/).test(ext);

        const { code, map } = await transform(originalCode, deepMerge(options?.swcOptions, {
          filename: id,
          jsc: {
            parser: {
              syntax: isTypescript ? "typescript" : "ecmascript",
              tsx: rosetask.tsConfig.compilerOptions.jsx !== ts.JsxEmit.None,
            },
          },
        }));

        return {
          code,
          map,
        };
      },
    },
  };
};

export default swcPlugin;