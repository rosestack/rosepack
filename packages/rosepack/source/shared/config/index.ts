import {PreRenderedChunk, TreeshakingPreset, TreeshakingOptions, RollupOptions} from "rollup";

import {Options} from "@swc/core";

import {WatchOptions} from "chokidar";

import {Pattern} from "rosetil";

import {PackageJson, TsConfig} from "roserc";

import {LoggerConfig} from "~shared/logger";

type Mode = "development" | "production";

type Target = "node" | "browser";

type Format = "dts" | "esm" | "cjs" | "amd" | "iife" | "umd" | "sys";

type InputWithFormat = {
  input: string;
  format: Format | Format[];
};

type NameContext<Format> = {
  format: Format;
  primary: boolean;
  chunkInfo: PreRenderedChunk;
};

type Input = string | (string | InputWithFormat)[] | {
  [name: string]: string | InputWithFormat;
};

type Output = {
  dir?: string;
  file?: string;
  name?: string;
  //
  entryName?: string | ((context: NameContext<Format>) => (string | null | undefined));
  chunkName?: string | ((context: NameContext<Format>) => (string | null | undefined));
  //
  treeshake?: boolean | TreeshakingPreset | TreeshakingOptions;
  sourcemap?: boolean | "inline" | "hidden";
  minify?: boolean;
  //
  banner?: {
    entryOnly?: boolean;
    header?: string;
    footer?: string;
  };
} & {
  [format in Extract<Format, "esm">]?: {
    shims?: boolean;
  };
};

type Clean = {
  target?: string;
  include?: Pattern;
  exclude?: Pattern;
};

type Copy = {
  from?: string;
  to?: string;
  include?: Pattern;
  exclude?: Pattern;
};

type Package = string | {
  name: string | string[];
  include?: Pattern;
  exclude?: Pattern;
};

interface CliConfig {
  watch?: boolean;
  mode?: Mode;
  target?: Target;
  format?: Format | Format[];
  primary?: boolean | Exclude<Format, "dts">;
}

interface Config {
  cwd?: string;
  mode?: Mode;
  target?: Target;
  //
  format?: Format | Format[];
  primary?: boolean | Exclude<Format, "dts">;
  parallel?: boolean;
  //
  run?: boolean;
  //
  watch?: boolean;
  watchList?: {
    config?: boolean;
    packageJson?: boolean;
    tsConfig?: boolean;
    dotEnv?: boolean;
    packages?: Package | Package[];
  };
  watchOptions?: Omit<WatchOptions, "cwd">;
  //
  define?: Record<string, string | number | boolean>;
  defineEnv?: Record<string, string | number | boolean>;
  defineRuntime?: {
    mode?: boolean;
    target?: boolean;
    version?: boolean;
  };
  loadDotEnv?: boolean | string | string[];
  createEnv?: boolean;
  //
  input?: Input;
  output?: Output;
  //
  external?: Pattern;
  noExternal?: Pattern;
  externalDeps?: boolean | string[];
  externalDevDeps?: boolean | string[];
  externalPeerDeps?: boolean | string[];
  //
  clean?: boolean | string | string[] | Clean | Clean[];
  copy?: boolean | string | string[] | Copy | Copy[];
  //
  beforeBuild?: () => Promise<void>;
  beforeFormatBuild?: (format: Format) => Promise<void>;
  afterBuild?: () => Promise<void>;
  afterFormatBuild?: (format: Format) => Promise<void>;
  //
  logger?: LoggerConfig;
  //
  rollupOptions?: RollupOptions;
  swcOptions?: Options;
}

interface TaskConfig {
  packageJson: PackageJson;
  tsConfig?: TsConfig;
  //
  cwd: string;
  mode: Mode;
  target: Target;
  format: Format;
  primary: boolean;
  //
  watch?: boolean;
  watchOptions?: Omit<WatchOptions, "cwd">;
  //
  run?: boolean;
  //
  define?: Record<string, string | number | boolean>;
  defineEnv?: Record<string, string | number | boolean>;
  defineRuntime?: {
    mode?: boolean;
    target?: boolean;
    version?: boolean;
  };
  //
  input?: Input;
  output?: Output;
  //
  external?: Pattern;
  noExternal?: Pattern;
  externalDeps?: string[];
  externalDevDeps?: string[];
  externalPeerDeps?: string[];
  //
  beforeFormatBuild?: (format: Format) => Promise<void>;
  afterFormatBuild?: (format: Format) => Promise<void>;
  //
  logger?: LoggerConfig;
  //
  rollupOptions?: RollupOptions;
  swcOptions?: Options;
}

export type {
  Format
};

export type {
  CliConfig,
  TaskConfig,
  Config
};