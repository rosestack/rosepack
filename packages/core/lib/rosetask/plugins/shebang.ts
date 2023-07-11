import type { NormalizedOutputOptions, PluginImpl, RenderedChunk } from "rollup";

import MagicString from "magic-string";

import rosetask from "~/rosetask";

import fs from "fs/promises";
import path from "path";

const shebangPlugin: PluginImpl = () => {
  if ( rosetask.format === "dts" ) {
    return {
      name: "shebang",
    };
  }

  const shebangRegex = /^#!(.*)/;

  const shebangs: Map<string, string> = new Map();
  const chmods = new Set<string>();

  return {
    name: "shebang",
    transform: {
      order: "pre",
      handler(code: string, id: string) {
        const shebang = shebangRegex.exec(code);

        if ( shebang ) {
          console.debug(`[plugin:shebang]: detect shebang in ${ id }`);

          const magicString = new MagicString(code);
          magicString.remove(shebang.index, shebang[0].length);

          shebangs.set(id, shebang[0]);

          return {
            code: magicString.toString(),
            map: rosetask.config.sourcemap && magicString.generateMap({
              hires: true,
            }),
          };
        }

        return null as any;
      },
    },
    renderChunk: {
      order: "post",
      handler(code: string, chunk: RenderedChunk, options: NormalizedOutputOptions) {
        if ( !chunk.isEntry ) {
          return null as any;
        }

        if ( !chunk.facadeModuleId ) {
          return null as any;
        }

        if ( !shebangs.has(chunk.facadeModuleId) ) {
          return null as any;
        }

        console.debug(`[plugin:shebang]: adding shebang to ${ chunk.facadeModuleId }`);

        const shebang = shebangs.get(chunk.facadeModuleId);

        const absolutePath = path.join(rosetask.config.root!, options.dir!, chunk.fileName);
        chmods.add(absolutePath);

        const magicString = new MagicString(code);
        magicString.prepend(`${ shebang } \n\n`);

        return {
          code: magicString.toString(),
          map: rosetask.config.sourcemap && magicString.generateMap({
            hires: true,
          }),
        };
      },
    },
    writeBundle: {
      order: "post",
      handler: async() => {
        for ( const chmod of chmods ) {
          console.debug(`[plugin:shebang]: chmod +x ${ chmod }`);
          await fs.chmod(chmod, 0o755);
        }
      },
    },
  };
};

export default shebangPlugin;