import type {PluginImpl, Plugin} from "rollup";

import MagicString from "magic-string";

import Logger from "~shared/logger";

import * as util from "util";

const escapeRegExp = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const toRegex = (value: string) => {
  return new RegExp(`(?<!(const|var|let)\\s*)(?<!["|'\`])(${ escapeRegExp( value ) })(?!\\s*=\\s*[^=])`, "g");
};

interface DefinePlugin {
  logger: Logger;
  define?: Record<string, unknown>;
  defineEnv?: Record<string, unknown>;
}

const definePlugin: PluginImpl<DefinePlugin> = (config): Plugin => {
  const {logger, define, defineEnv} = config!;

  const debugVars: string[] = [];

  const vars: { key: RegExp; value: string }[] = [];

  Object.entries(define ?? {}).forEach(([key, value]) => {
    debugVars.push(`${key} => ${value}`);

    return vars.push({
      key: toRegex(key),
      value: JSON.stringify(value)
    });
  });

  Object.entries(defineEnv ?? {}).forEach(([key, value]) => {
    debugVars.push(`ENV ${key} => ${value}`);

    return vars.push({
      key: toRegex(`process.env.${key}`),
      value: JSON.stringify(value)
    });
  });

  logger.debug("[rosepack:define]", util.inspect(debugVars, {
    depth: Infinity,
    colors: true
  }));

  return {
    name: "rosepack:define",
    transform: {
      order: "pre",
      handler: (code: string, id: string) => {
        const magicString = new MagicString(code);

        for (const {key, value} of vars) {
          magicString.replaceAll(key, value);
        }

        if (!magicString.hasChanged()) {
          return null;
        }

        logger.debug("[rosepack:define]", `Replaced for ${id}`);

        return {
          code: magicString.toString(),
          map: magicString.generateMap({
            hires: true
          })
        };
      },
    }
  };
};

export default definePlugin;