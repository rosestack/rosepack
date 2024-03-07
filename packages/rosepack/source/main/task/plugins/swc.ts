import {merge} from "rosetil";

import {TsConfig} from "roserc";

import type {PluginImpl} from "rollup";

import {ParserConfig, transform} from "@swc/core";
import {Options} from "@swc/types";

import Logger from "~shared/logger";

import path from "path";

interface SwcPlugin {
  logger: Logger;
  options: Options;
  tsConfig?: TsConfig;
}

const parserConfig = (id: string, tsConfig?: TsConfig): ParserConfig => {
  const isTypescript = (/(ts|tsx)$/).test(id);

  if (isTypescript) {
    return {
      syntax: "typescript",
      tsx: id.endsWith("x"),
      decorators: tsConfig?.compilerOptions?.experimentalDecorators
    };
  }

  return {
    syntax: "ecmascript",
    jsx: id.endsWith("x"),
    decorators: tsConfig?.compilerOptions?.experimentalDecorators
  };
};

const swcPlugin: PluginImpl<SwcPlugin> = (config) => {
  const {logger, options, tsConfig} = config!;

  const extensions = [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx"];

  return {
    name: "rosepack:swc",
    transform: {
      order: "pre",
      handler: async (originalCode: string, id: string) => {
        const ext = path.extname(id);

        if (!extensions.includes(ext)) {
          return null;
        }

        logger.debug("[rosepack:swc]", "Transforming", id);

        const {code, map} = await transform(originalCode, merge(options ?? {}, {
          filename: id,
          jsc: {
            parser: parserConfig(id, tsConfig)
          }
        }));

        return {
          code,
          map
        };
      }
    },
    renderChunk: {
      order: "pre",
      handler: async (originalCode: string, {fileName}) => {
        const ext = path.extname(fileName);

        if (!extensions.includes(ext)) {
          return null;
        }

        logger.debug("[rosepack:swc]", "Rendering", fileName);

        const {code, map} = await transform(originalCode, merge(options ?? {}, {
          filename: fileName,
          jsc: {
            parser: parserConfig(fileName, tsConfig)
          }
        }));

        return {
          code,
          map
        };
      }
    }
  };
};

export default swcPlugin;