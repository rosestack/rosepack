import { rollup } from "rollup";

import jsonPlugin from "@rollup/plugin-json";

import ts from "typescript";

import type { Config } from "~rosepack/config";

import type { PackageJson, TsConfig } from "~shared/types";

import { packageJsonFile, rosepackConfigFile, rosepackTmpConfigFile, tsConfigFile } from "~shared/constants";

import RosepackError, { ErrorCode } from "~shared/error";

import swcPlugin from "./plugins/swc";

import path from "path";
import url from "url";
import fs from "fs";

const loadConfig = async ( config: Config ): Promise<Config> => {
  const filepath = path.join( config.root, rosepackConfigFile );

  if ( !fs.existsSync( filepath )) {
    return {};
  }

  try {
    const build = await rollup({
      input: filepath,
      plugins: [
        jsonPlugin(),
        swcPlugin(),
      ],
      onwarn: () => {
        return null;
      },
      external: ( id: string ) => {
        if ( id.startsWith( "." )) {
          return false;
        }

        return !path.isAbsolute( id );
      },
    });

    const configFile = path.join( config.cacheDir, rosepackTmpConfigFile );

    await build.write({
      freeze: false,
      sourcemap: false,
      file: configFile,
      exports: "named",
      format: "esm",
    });

    await build.close();

    const file = url.pathToFileURL( configFile );

    file.hash = Date.now().toString();

    const configLoaded = await import( file.href );

    const mod = configLoaded.rosepack || configLoaded.default;

    if ( !mod ) {
      throw new RosepackError( ErrorCode.Config, "no default export founds" );
    }

    if ( typeof mod === "function" ) {
      return await mod( config );
    }

    if ( typeof mod !== "object" ) {
      return mod;
    }

    if ( !mod ) {
      throw new RosepackError( ErrorCode.Config, `invalid default export, receved ${ typeof mod }` );
    }

    return mod;
  } catch ( error: unknown ) {
    throw RosepackError.from( ErrorCode.Config, error );
  }
};

const loadPackageJson = ( root: string ): PackageJson => {
  const filepath = path.join( root, packageJsonFile );

  if ( !fs.existsSync( filepath )) {
    throw new RosepackError( ErrorCode.PackageJson, `${ packageJsonFile } is not exists` );
  }

  try {
    const stringifyJson = fs.readFileSync( filepath, "utf-8" );

    return JSON.parse( stringifyJson );
  } catch ( error ) {
    if ( error instanceof RosepackError ) {
      throw error;
    }

    throw RosepackError.from( ErrorCode.PackageJson, `failed to parse ${ packageJsonFile }, cause: ${ error }` );
  }
};

const loadTsConfig = ( root: string ): TsConfig => {
  const filepath = path.join( root, tsConfigFile );

  if ( !fs.existsSync( filepath )) {
    throw new RosepackError( ErrorCode.TsConfig, `${ tsConfigFile } is not exists` );
  }

  try {
    const { config, error } = ts.readConfigFile( filepath, ts.sys.readFile );

    if ( error ) {
      throw new RosepackError( ErrorCode.TsConfig, ts.formatDiagnostic( error, {
        getCanonicalFileName: (fileName) => {
          return fileName;
        },
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => {
          return ts.sys.newLine;
        },
      }));
    }

    const parsedTsFile = ts.parseJsonConfigFileContent( config, ts.sys, root );

    return {
      compilerOptions: parsedTsFile.options,
      include: parsedTsFile.raw.include || [],
      exclude: parsedTsFile.raw.exclude || [],
    };
  } catch ( error ) {
    if ( error instanceof RosepackError ) {
      throw error;
    }

    throw RosepackError.from( ErrorCode.TsConfig, `failed to parse ${ tsConfigFile }, cause: ${ error }` );
  }
};

export {
  loadConfig,
  loadPackageJson,
  loadTsConfig,
};