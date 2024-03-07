import ts from "typescript";

import {PluginImpl} from "rollup";

import {TsConfig} from "roserc";

import Logger from "~shared/logger";

const escapeRegex = (str: string) => {
  return str.replace(/[$^]/g, "\\$&");
};

interface ResolvePlugin {
  cwd: string;
  tsConfig?: TsConfig;
  logger: Logger;
}

const resolvePlugin: PluginImpl<ResolvePlugin> = (config) => {
  const {cwd, tsConfig, logger} = config!;

  const compilerOptions = tsConfig?.compilerOptions;

  if (!compilerOptions) {
    return {
      name: "rosepack:resolve"
    };
  }

  const moduleResolutionCache = ts.createModuleResolutionCache(cwd, (filename) => {
    return filename.replaceAll(/\\/g, "/");
  });

  return {
    name: "rosepack:resolve",
    resolveId(id, importer) {
      if (!importer) {
        return null;
      }

      if (id.startsWith("\0")) {
        return null;
      }

      if (id.startsWith(".")) {
        return null;
      }

      const hasMatchingPath = Object.keys(compilerOptions?.paths ?? {}).some((path) => (
        new RegExp("^" + escapeRegex(path.replace("*", ".+")) + "$").test(id)
      ));

      if (!hasMatchingPath) {
        return null;
      }

      logger.debug("[rosepack:resolve]", `Resolving ${id} from ${importer}`);

      const {resolvedModule} = ts.resolveModuleName(id, importer, compilerOptions!, ts.sys, moduleResolutionCache);

      if (!resolvedModule) {
        return null;
      }

      if (!resolvedModule.resolvedFileName) {
        return null;
      }

      if (resolvedModule.extension === ".d.ts") {
        return null;
      }

      logger.debug("[rosepack:resolve]", `Resolved ${id} to ${resolvedModule.resolvedFileName}`);

      return ts.sys.realpath!(resolvedModule.resolvedFileName);
    }
  };
};

export default resolvePlugin;