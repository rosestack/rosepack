import MagicString from "magic-string";

import type {Plugin, PluginImpl} from "rollup";

import {normalizePath} from "@rollup/pluginutils";

import {Format} from "~shared/config";
import Logger from "~shared/logger";

const useEsmShims = (code: string, id: string, logger: Logger) => {
  const file = "rosepack/helper/shims/esm.js";

  if (id.endsWith(file)) {
    return null;
  }

  if (code.includes(file)) {
    return null;
  }

  const exports: string[] = [
    "__dirname",
    "__filename",
    "require"
  ];

  if (exports.every((mod) => code.match(new RegExp(mod)) === null)) {
    return null;
  }

  const magicString = new MagicString(code);

  magicString.prepend(`import {${exports.join(",")}} from "${file}"; \n`);

  logger.debug("[rosepack:shims]", "shims injected for", id);

  return {
    moduleSideEffects: true,
    code: magicString.toString(),
    map: magicString.generateMap({
      hires: true
    })
  };
};

interface ShimsPlugin {
  logger: Logger;
  format: Format;
  esmShims: boolean;
}

const shimsPlugin: PluginImpl<ShimsPlugin> = (config): Plugin => {
  const {format, esmShims, logger} = config!;

  if (esmShims && format !== "esm") {
    return {
      name: "rosepack:shims"
    };
  }

  logger.debug("[rosepack:shims]", "shims enabled");

  return {
    name: "rosepack:shims",
    transform: {
      order: "pre",
      handler: (code: string, id: string) => {
        id = normalizePath(id);

        if (id.includes("node_modules")) {
          return null;
        }

        if (esmShims && format === "esm") {
          return useEsmShims(code, id, logger);
        }

        return null;
      }
    }
  };
};

export default shimsPlugin;