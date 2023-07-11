import type { PluginImpl } from "rollup";

import ts from "typescript";

import rosetask from "~/rosetask";

import { normalizePath } from "~shared/utils";

import path from "path";

const resolvePlugin: PluginImpl = () => {
  return {
    name: "resolve",
    resolveId(id, importer) {
      if ( importer === undefined ) {
        return null;
      }

      if ( id.startsWith("\0") ) {
        return null;
      }

      if ( rosetask.config.target === "node" ) {
        if ( id.startsWith("node:") ) {
          return {
            external: true,
            id,
          };
        }
      }

      const moduleName = normalizePath(ts.sys.realpath?.(id)!);

      console.debug(`[plugin:resolve]: request ${ moduleName } from ${ importer }`);

      let compilerOptions = rosetask.tsConfig.compilerOptions;

      /**
       * TODO: i feel like this is wrong, need more testing with monorepo
       *
       */
      if ( !importer.startsWith(rosetask.config.root!) ) {
        const tsConfigPath = ts.findConfigFile(importer, ts.sys.fileExists);

        if ( tsConfigPath ) {
          const options = this.cache.get<ts.CompilerOptions>(tsConfigPath);

          if ( options ) {
            compilerOptions = options;
          } else {
            const { config } = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
            const { options } = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(tsConfigPath));
            compilerOptions = options;
            this.cache.set(tsConfigPath, options);
          }
        }
      }

      const { resolvedModule } = ts.resolveModuleName(moduleName,
        importer,
        compilerOptions,
        ts.sys);

      if ( !resolvedModule ) {
        return null;
      }

      if ( !resolvedModule.resolvedFileName ) {
        return null;
      }

      if ( resolvedModule.resolvedFileName.endsWith(".d.ts") ) {
        return null;
      }

      console.debug(`[plugin:resolve]: resolved ${ id } to ${ resolvedModule.resolvedFileName }`);

      return ts.sys.realpath?.(resolvedModule.resolvedFileName);
    },
  };
};

export default resolvePlugin;