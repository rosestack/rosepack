import MagicString from "magic-string";
import type { PluginImpl, Plugin } from "rollup";

import util from "util";

import rosetask from "~/rosetask";

const escapeRegExp = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const toRegex = (value: string) => {
  return new RegExp(`(?<!(const|var|let)\\s*)(?<!["|'|\`])(${ escapeRegExp( value ) })(?!\\s*=\\s*[^=])`, "g");
};

const definePlugin: PluginImpl = (): Plugin => {
  const vars: { key: RegExp; value: string }[] = [
    {
      key: toRegex("__FORMAT__"),
      value: JSON.stringify(rosetask.format),
    }, {
      key: toRegex("__PRIMARY__"),
      value: JSON.stringify(rosetask.primary),
    },
  ];

  Object.entries(rosetask.config.define ?? {}).forEach(([ key, value ]) => {
    return vars.push({
      key: toRegex(key),
      value: JSON.stringify(value),
    });
  });

  Object.entries(rosetask.config.defineEnv ?? {}).forEach(([ key, value ]) => {
    return vars.push({
      key: toRegex(`process.env.${ key }`),
      value: JSON.stringify(value),
    });
  });

  console.debug(`[plugin:define]: ${ util.inspect(vars, {
    depth: Infinity,
    colors: true,
  }) }`);

  const handler = (code: string) => {
    const magicString = new MagicString(code);

    for ( const { key, value } of vars ) {
      magicString.replaceAll(key, value);
    }

    return {
      code: magicString.toString(),
      map: magicString.generateMap({
        hires: true,
      }),
    };
  };

  return {
    name: "define",
    transform: {
      order: "pre",
      handler,
    },
    renderChunk: {
      order: "pre",
      handler,
    },
  };
};

export default definePlugin;