import type {PluginImpl} from "rollup";

import Logger from "~shared/logger";

interface SizeOptions {
  logger: Logger;
}

const sizePlugin: PluginImpl<SizeOptions> = (config) => {
  const logger = config?.logger!;

  return {
    name: "rosepack:size",
    generateBundle: {
      order: "post",
      handler: async (options, bundle) => {
        let totalSize = 0;

        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== "chunk") {
            continue;
          }

          const size = new TextEncoder().encode(chunk.code).length;

          totalSize += size;

          logger.info(`Bundle ${logger.mark(chunk.fileName)} -> ${logger.mark(size)} bytes.`);
        }

        logger.info(`Total bundle size is ${logger.mark(totalSize)} bytes.`);
      }
    }
  };
};

export default sizePlugin;