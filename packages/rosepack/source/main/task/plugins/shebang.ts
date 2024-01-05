import type {NormalizedOutputOptions, PluginImpl, RenderedChunk} from "rollup";

import MagicString from "magic-string";

import {Format} from "~shared/config";

import fs from "fs/promises";

import path from "path";
import Logger from "~shared/logger";

interface ShebangPlugin {
  cwd: string;
  format: Format;
  logger: Logger;
}

const shebangPlugin: PluginImpl<ShebangPlugin> = (config) => {
  const {cwd, format, logger} = config!;

  if (format === "dts") {
    return {
      name: "rosepack:shebang"
    };
  }

  const shebangRegex = /^#!(.*)/;

  const shebangs: Map<string, string> = new Map();
  const chmods = new Set<string>();

  return {
    name: "rosepack:shebang",
    transform: {
      order: "pre",
      handler(code: string, id: string) {
        const shebang = shebangRegex.exec(code);

        if (shebang) {
          logger.debug("[shebangPlugin]", "shebang", id);

          const magicString = new MagicString(code);

          magicString.remove(shebang.index, shebang[0].length);

          shebangs.set(id, shebang[0]);

          return {
            code: magicString.toString(),
            map: magicString.generateMap({
              hires: true
            })
          };
        }

        return null as any;
      }
    },
    renderChunk: {
      order: "post",
      handler(code: string, chunk: RenderedChunk, options: NormalizedOutputOptions) {
        if (!chunk.isEntry) {
          return null as any;
        }

        if (!chunk.facadeModuleId) {
          return null as any;
        }

        if (!shebangs.has(chunk.facadeModuleId)) {
          return null as any;
        }

        const shebang = shebangs.get(chunk.facadeModuleId);

        const absolutePath = path.join(cwd, options.dir!, chunk.fileName);

        chmods.add(absolutePath);

        const magicString = new MagicString(code);
        magicString.prepend(`${shebang} \n\n`);

        logger.debug("[shebangPlugin]", "shebang prepend", chunk.fileName);

        return {
          code: magicString.toString(),
          map: magicString.generateMap({
            hires: true
          })
        };
      }
    },
    writeBundle: {
      order: "post",
      handler: async () => {
        for (const chmod of chmods) {
          await fs.chmod(chmod, 0o755);
          logger.debug("[shebangPlugin]", "chmod", chmod);
        }
      }
    }
  };
};

export default shebangPlugin;