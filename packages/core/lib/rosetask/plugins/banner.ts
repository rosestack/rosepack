import type { PluginImpl, RenderedChunk } from "rollup";

import rosetask from "~/rosetask";

import MagicString from "magic-string";

const bannerPlugin: PluginImpl = () => {
  const banner = rosetask.config.banner;

  if ( !banner ) {
    return {
      name: "banner",
    };
  }

  return {
    name: "banner",
    renderChunk: {
      order: "post",
      handler(code: string, chunk: RenderedChunk) {
        const { header, footer, entryOnly } = banner;

        if ( entryOnly && !chunk.isEntry ) {
          return;
        }

        let filename = chunk.facadeModuleId;

        if ( !filename ) {
          filename = chunk.moduleIds[0] || chunk.fileName;
        }

        console.debug(`[plugin:banner]: adding banner to ${ filename }`);

        const magicString = new MagicString(code);

        if ( header ) {
          magicString.prepend(`${ header } \n\n`);
        }

        if ( footer ) {
          magicString.append(`\n\n ${ footer }`);
        }

        return {
          code: magicString.toString(),
          map: magicString.generateMap({ hires: true }),
        };
      },
    },
  };
};

export default bannerPlugin;