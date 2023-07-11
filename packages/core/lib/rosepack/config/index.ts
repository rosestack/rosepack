import type { PreRenderedChunk, RollupOptions, TreeshakingOptions, TreeshakingPreset } from "rollup";
import type { FilterPattern } from "@rollup/pluginutils";

import type { JsMinifyOptions, Options as SwcOptions } from "@swc/core";
import type { Options as DtsOptions } from "rollup-plugin-dts";

import type { WatchOptions } from "chokidar";

//

type Format = "dts" | "amd" | "cjs" | "esm" | "iife" | "umd" | "system";

type DeclarationFormat = "dts";

type BundleFormat = Exclude<Format, DeclarationFormat>;

//

interface Context {
  root?: string;
  cacheDir?: string;
  //
  target?: "node" | "browser";
  mode?: "development" | "production";
}

interface Watch {
  watch?: boolean;
  watchList?: {
    config?: boolean;
    packageJson?: boolean;
    tsConfig?: boolean;
    dotEnv?: boolean;
  };
  watchOptions?: WatchOptions;
}

interface Define {
  define?: Record<string, string | number | boolean>;
  defineEnv?: Record<string, string | number | boolean>;
  defineDotEnv?: boolean | string | string[];
  defineRuntime?: {
    mode?: boolean;
    target?: boolean;
    version?: boolean;
  };
}

//

type NameContext<Format> = {
  format: Format;
  primary: boolean;
  chunkInfo: PreRenderedChunk;
};

type Entry = {
  input: string;
  format: BundleFormat | BundleFormat[];
};

interface BundleRollup {
  entry?: string | (string | Entry)[] | {
    [name: string]: string | Entry;
  };
  output?: {
    dir?: string;
    //
    format?: BundleFormat | BundleFormat[];
    primary?: BundleFormat;
    //
    entryName?: string | ((context: NameContext<BundleFormat>) => (string | null | undefined));
    chunkName?: string | ((context: NameContext<BundleFormat>) => (string | null | undefined));
  } & {
    [format in Extract<BundleFormat, "esm">]?: {
      shims?: boolean;
    };
  };
}

type Declaration = {
  entry?: string | string[] | Record<string, string>;
  output?: {
    dir?: string;
    //
    entryName?: string | ((context: NameContext<DeclarationFormat>) => (string | null | undefined));
    chunkName?: string | ((context: NameContext<DeclarationFormat>) => (string | null | undefined));
  };
  //
  external?: (FilterPattern)[];
  noExternal?: (FilterPattern)[];
  respectExternal?: boolean;
};

interface DeclarationRollup {
  declaration?: boolean | string | string[] | Declaration;
  declarationOnly?: boolean;
}

interface CommonRollup {
  banner?: {
    header?: string;
    footer?: string;
    entryOnly?: boolean;
  };
  treeshake?: boolean | TreeshakingPreset | TreeshakingOptions;
  sourcemap?: boolean | "inline" | "hidden";
  minify?: boolean | JsMinifyOptions;
}

//

type Clean = {
  target?: string;
  include?: FilterPattern;
  exclude?: FilterPattern;
};

type Copy = {
  from?: string;
  to?: string;
  include?: FilterPattern;
  exclude?: FilterPattern;
};

interface Utils {
  clean?: boolean | string | string[] | Clean | Clean[];
  copy?: boolean | string | string[] | Copy | Copy[];
}

//

interface External {
  external?: (FilterPattern)[];
  noExternal?: (FilterPattern)[];
  externalDeps?: boolean;
  externalDevDeps?: boolean;
  externalPeerDeps?: boolean;
}

//

interface Hook {
  onBuildStart?: (format: BundleFormat | DeclarationFormat) => (Promise<void> | void);
  onBuildEnd?: (format: BundleFormat | DeclarationFormat) => (Promise<void> | void);
}

//
type LogLevel = "info" | "warn" | "error" | "debug";

type Logger = {
  info?: (...messages: any[]) => void;
  warn?: (...messages: any[]) => void;
  error?: (error: unknown) => void;
  debug?: (...messages: any[]) => void;
  //
  format?: (format: Format) => {
    info: (...messages: any[]) => void;
    warn: (...messages: any[]) => void;
    error: (error: unknown) => void;
    debug: (...messages: any[]) => void;
  };
  //
  mark?: (...messages: any) => string;
  line?: () => void;
};

type RollupWarnings = (
  "ADDON_ERROR" |
  "ALREADY_CLOSED" |
  "AMBIGUOUS_EXTERNAL_NAMESPACES" |
  "ANONYMOUS_PLUGIN_CACHE" |
  "ASSET_NOT_FINALISED" |
  "ASSET_NOT_FOUND" |
  "ASSET_SOURCE_ALREADY_SET" |
  "ASSET_SOURCE_MISSING" |
  "BAD_LOADER" |
  "CANNOT_CALL_NAMESPACE" |
  "CANNOT_EMIT_FROM_OPTIONS_HOOK" |
  "CHUNK_NOT_GENERATED" |
  "CHUNK_INVALID" |
  "CIRCULAR_DEPENDENCY" |
  "CIRCULAR_REEXPORT" |
  "CYCLIC_CROSS_CHUNK_REEXPORT" |
  "DEPRECATED_FEATURE" |
  "DUPLICATE_PLUGIN_NAME" |
  "EMPTY_BUNDLE" |
  "EVAL" |
  "EXTERNAL_SYNTHETIC_EXPORTS" |
  "FILE_NAME_CONFLICT" |
  "FILE_NOT_FOUND" |
  "ILLEGAL_IDENTIFIER_AS_NAME" |
  "ILLEGAL_REASSIGNMENT" |
  "INCONSISTENT_IMPORT_ASSERTIONS" |
  "INPUT_HOOK_IN_OUTPUT_PLUGIN" |
  "INVALID_CHUNK" |
  "INVALID_EXPORT_OPTION" |
  "INVALID_EXTERNAL_ID" |
  "INVALID_OPTION" |
  "INVALID_PLUGIN_HOOK" |
  "INVALID_ROLLUP_PHASE" |
  "INVALID_SETASSETSOURCE" |
  "INVALID_TLA_FORMAT" |
  "MISSING_EXPORT" |
  "MISSING_GLOBAL_NAME" |
  "MISSING_IMPLICIT_DEPENDANT" |
  "MISSING_NAME_OPTION_FOR_IIFE_EXPORT" |
  "MISSING_NODE_BUILTINS" |
  "MISSING_OPTION" |
  "MIXED_EXPORTS" |
  "MODULE_LEVEL_DIRECTIVE" |
  "NAMESPACE_CONFLICT" |
  "NO_TRANSFORM_MAP_OR_AST_WITHOUT_CODE" |
  "PARSE_ERROR" |
  "PLUGIN_ERROR" |
  "SHIMMED_EXPORT" |
  "SOURCEMAP_BROKEN" |
  "SOURCEMAP_ERROR" |
  "SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT" |
  "THIS_IS_UNDEFINED" |
  "UNEXPECTED_NAMED_IMPORT" |
  "UNKNOWN_OPTION" |
  "UNRESOLVED_ENTRY" |
  "UNRESOLVED_IMPORT" |
  "UNUSED_EXTERNAL_IMPORT" |
  "VALIDATION_ERROR"
  );

type WarningList = RollupWarnings[] & string[];

interface Logging {
  logger?: Logger;
  //
  logTime?: boolean;
  logName?: string;
  logSymbol?: string;
  //
  logLevel?: "silent" | {
    [level in LogLevel]?: boolean;
  };
  //
  ignoredWarnings?: WarningList;
}

//

type RollupContext = {
  primary: boolean;
  config: Config;
  format: BundleFormat | DeclarationFormat;
  rollupOptions: RollupOptions;
};

type SwcContext = {
  primary: boolean;
  config: Config;
  format: BundleFormat;
  rollupOptions: RollupOptions;
  swcOptions: SwcOptions;
};

type DtsContext = {
  primary: boolean;
  config: Config;
  format: DeclarationFormat;
  rollupOptions: RollupOptions;
  dtsOptions: DtsOptions;
};

interface Advanced {
  rollup?: RollupOptions | ((context: RollupContext) => (Promise<RollupContext> | RollupContext));
  swc?: SwcOptions | ((context: SwcContext) => (Promise<SwcContext> | SwcContext));
  dts?: DtsOptions | ((context: DtsContext) => (Promise<DtsContext> | DtsContext));
}

//

type Config = (
  Context &
  Watch &
  Define &
  BundleRollup &
  DeclarationRollup &
  CommonRollup &
  Utils &
  External &
  Hook &
  Logging &
  Advanced
  );

export type {
  Config,
  //
  Format,
  BundleFormat,
  Declaration,
  DeclarationFormat,
  //
  Clean,
  Copy,
  //
  Logger,
  LogLevel,
  //
  RollupContext,
  SwcContext,
  DtsContext,
};