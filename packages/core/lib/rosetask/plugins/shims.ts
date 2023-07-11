import MagicString from "magic-string";
import type { Plugin, PluginImpl } from "rollup";

import rosetask from "~/rosetask";

import { normalizePath } from "~shared/utils";

const canBeShimmed = ["esm"];

const useEsmShims = (code: string, id: string) => {
  const file = "rosepack/helper/shims/esm.js";

  if ( id.endsWith(file) ) {
    return null;
  }

  if ( code.includes(file) ) {
    return null;
  }

  const exports: string[] = [
    "__dirname",
    "__filename",
    "require",
  ];

  if ( exports.every((mod) => {
    return code.match(new RegExp(mod)) === null;
  }) ) {
    return null;
  }

  console.debug(`[plugin:shims]: inject to ${ id }`);

  const magicString = new MagicString(code);

  magicString.prepend(`import {${ exports.join(",") }} from "${ file }"; \n`);

  return {
    moduleSideEffects: true,
    code: magicString.toString(),
    map: rosetask.config.sourcemap && magicString.generateMap({
      hires: true,
    }),
  };
};

const shimsPlugin: PluginImpl = (): Plugin => {
  if ( !canBeShimmed.includes(rosetask.format) ) {
    return null as any;
  }

  if ( rosetask.format === "esm" ) {
    if ( !rosetask.config.output?.esm?.shims ) {
      return null as any;
    }
  }

  return {
    name: "shims",
    transform: {
      order: "pre",
      handler: (code: string, id: string) => {
        id = normalizePath(id);

        if ( rosetask.format === "esm" ) {
          return useEsmShims(code, id);
        }

        return null as any;
      },
    },
  };
};

export default shimsPlugin;