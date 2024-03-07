import type {PluginImpl} from "rollup";

import {dataToEsm} from "@rollup/pluginutils";

import Logger from "~shared/logger";

const files = new RegExp(/\.(txt|md)$/);

interface RawPlugin {
  logger: Logger;
}

const rawPlugin: PluginImpl<RawPlugin> = (config) => {
  const logger = config?.logger!;

  return {
    name: "rosepack:raw",
    transform: {
      order: "pre",
      handler: (code, id) => {
        if (!files.test(id)) {
          return null;
        }

        logger.debug("[rosepack:raw]", "transform", id);

        return {
          code: dataToEsm(code, {
            namedExports: true,
            preferConst: true,
            compact: false
          }),
          map: null
        };
      }
    }
  };
};

export default rawPlugin;