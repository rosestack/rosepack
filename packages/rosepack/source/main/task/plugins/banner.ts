import type {PluginImpl, RenderedChunk} from "rollup";

import MagicString from "magic-string";

import Logger from "~shared/logger";

interface BannerOptions {
  logger: Logger;
  entryOnly?: boolean;
  header?: string;
  footer?: string;
}

const bannerPlugin: PluginImpl<BannerOptions> = (config) => {
  const {logger, header, footer, entryOnly} = config!;

  if (!header && !footer) {
    return {
      name: "rosepack:banner"
    };
  }

  return {
    name: "rosepack:banner",
    renderChunk: {
      order: "post",
      handler(code: string, chunk: RenderedChunk) {
        if (entryOnly && !chunk.isEntry) {
          return;
        }

        let filename = chunk.facadeModuleId;

        if (!filename) {
          filename = chunk.moduleIds[0] || chunk.fileName;
        }

        const magicString = new MagicString(code);

        if (header) {
          magicString.prepend(`${header} \n\n`);
          logger.debug("[bannerPlugin]", `Prepend header to ${filename}`);
        }

        if (footer) {
          magicString.append(`\n\n ${footer}`);
          logger.debug("[bannerPlugin]", `Append footer to ${filename}`);
        }

        return {
          code: magicString.toString(),
          map: magicString.generateMap({
            hires: true
          })
        };
      }
    }
  };
};

export default bannerPlugin;