import type { InputOption, PreRenderedChunk, RollupCache, RollupOptions, RollupWatcher } from "rollup";
import { rollup, watch } from "rollup";

import ts from "typescript";

import nodeResolvePlugin from "@rollup/plugin-node-resolve";
import jsonPlugin from "@rollup/plugin-json";

import type { Options as DtsOptions } from "rollup-plugin-dts";
import dtsPlugin from "rollup-plugin-dts";

import type { JscTarget, JsMinifyOptions, Options as SwcOptions } from "@swc/core";

import type { BundleFormat, Config, Declaration, DeclarationFormat, Format } from "~rosepack/config";
import type { PackageJson, TsConfig } from "~shared/types";

import { rosepackTmpConfigFile } from "~shared/constants";
import { deepMerge, normalizePath } from "~shared/utils";

import RosepackLogger from "~shared/logger";

import resolvePlugin from "./plugins/resolve";
import shebangPlugin from "./plugins/shebang";
import bannerPlugin from "./plugins/banner";
import definePlugin from "./plugins/define";
import shimsPlugin from "./plugins/shims";
import swcPlugin from "./plugins/swc";

import { isMainThread, parentPort } from "worker_threads";
import process from "process";
import path from "path";
import url from "url";
import fs from "fs";

class Rosetask {
  format: Format;

  config: Config;
  packageJson: PackageJson;
  tsConfig: TsConfig;

  logger: RosepackLogger;

  //
  watcher: RollupWatcher | undefined;

  //
  cache: RollupCache | undefined;

  get primary() {
    return this.format === this.config.output?.primary;
  }

  get input() {
    let input: InputOption;

    if ( typeof this.config.entry === "string" ) {
      input = this.config.entry;
    } else if ( Array.isArray(this.config.entry) ) {
      input = this.config.entry.filter((entry) => {
        if ( typeof entry === "string" ) {
          return true;
        }

        const formats = Array.isArray(entry.format) ? entry.format : [entry.format];

        return formats.includes(this.format as any);
      }).map((entry) => {
        if ( typeof entry === "string" ) {
          return entry;
        }

        return entry.input;
      }) as InputOption;
    } else {
      input = Object.entries(this.config.entry!).reduce((input: Record<string, string>, [name, entry]) => {
        if ( typeof entry === "string" ) {
          input[name] = entry;
        } else {
          const formats = Array.isArray(entry.format) ? entry.format : [entry.format];

          if ( formats.includes(this.format as any) ) {
            input[name] = entry.input;
          }
        }

        return input;
      }, {});
    }

    return input;
  }

  //

  commonRollupOptions = () => {
    const rollupOptions: RollupOptions = {
      input: this.input,
      treeshake: this.config.treeshake,
      output: {
        dir: this.config.output?.dir,
        sourcemap: this.config.sourcemap,
        //
        generatedCode: {
          preset: "es2015",
          arrowFunctions: true,
          constBindings: true,
          objectShorthand: true,
          reservedNamesAsProps: true,
          symbols: true,
        },
        compact: true,
        freeze: false,
        minifyInternalExports: false,
        hoistTransitiveImports: false,
        validate: false,
        exports: "auto",
      },
      plugins: [
        nodeResolvePlugin({
          rootDir: this.config.root,
          mainFields: [
            "module",
            "main",
            this.config.target !== "node" && "browser" as any,
          ],
          extensions: [".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx", ".json", ".node"],
          preferBuiltins: this.config.target === "node",
          browser: this.config.target === "browser",
        }),
        resolvePlugin(),
        jsonPlugin({
          preferConst: true,
          namedExports: true,
        }),
        definePlugin(),
        shimsPlugin(),
        bannerPlugin(),
        shebangPlugin(),
      ],
      watch: {
        chokidar: this.config.watchOptions,
      },
      cache: this.cache,
      onwarn: (warning) => {
        let { code, message } = warning;

        if ( !code ) {
          code = "UNKNOWN";
        }

        if ( this.config.ignoredWarnings ) {
          if ( this.config.ignoredWarnings.includes(code) ) {
            return;
          }
        }

        if ( code === "THIS_IS_UNDEFINED" ) {
          return;
        }

        if ( code === "MIXED_EXPORTS" ) {
          return;
        }

        if ( code === "PLUGIN_WARNING" ) {
          const { plugin, stack } = warning;

          return console.warn(`[plugin:${plugin}] ${message} - ${stack}`);
        }

        return console.warn(`${code}: ${message}`);
      },
      external: (source, importer) => {
        if ( importer === undefined ) {
          return false;
        }

        if ( path.isAbsolute(source) ) {
          return false;
        }

        if ( source.startsWith(".") ) {
          return false;
        }

        let moduleName = source.split("/")[0];

        if ( moduleName?.startsWith("@") ) {
          moduleName += `/${source.split("/")[1]}`;
        }

        moduleName = normalizePath(moduleName!);

        for ( const noExternalItem of (this.config.noExternal ?? []) ) {
          if ( typeof noExternalItem === "string" ) {
            if ( moduleName === noExternalItem ) {
              return false;
            }
          } else if ( noExternalItem instanceof RegExp ) {
            if ( moduleName.match(noExternalItem) ) {
              return false;
            }
          }
        }

        for ( const externalItem of (this.config.external ?? []) ) {
          if ( typeof externalItem === "string" ) {
            if ( moduleName === externalItem ) {
              return true;
            }
          } else if ( externalItem instanceof RegExp ) {
            if ( moduleName.match(externalItem) ) {
              return true;
            }
          }
        }

        return false;
      },
    };

    return rollupOptions;
  };

  commonSwcOptions = () => {
    let jscTarget: JscTarget;

    switch ( this.tsConfig.compilerOptions.target ) {
      case ts.ScriptTarget.ES3:
        jscTarget = "es3";
        break;
      case ts.ScriptTarget.ES5:
        jscTarget = "es5";
        break;
      case ts.ScriptTarget.ES2015:
        jscTarget = "es2015";
        break;
      case ts.ScriptTarget.ES2016:
        jscTarget = "es2016";
        break;
      case ts.ScriptTarget.ES2017:
        jscTarget = "es2017";
        break;
      case ts.ScriptTarget.ES2018:
        jscTarget = "es2018";
        break;
      case ts.ScriptTarget.ES2019:
        jscTarget = "es2019";
        break;
      case ts.ScriptTarget.ES2020:
        jscTarget = "es2020";
        break;
      case ts.ScriptTarget.ES2021:
        jscTarget = "es2021";
        break;
      case ts.ScriptTarget.ES2022:
        jscTarget = "es2022";
        break;
      case ts.ScriptTarget.JSON:
        jscTarget = "es5";
        break;
      default:
        jscTarget = "esnext";
    }

    let sourceMapsEnabled = false;

    if ( this.config.sourcemap ) {
      sourceMapsEnabled = true;
    }

    let minifyEnabled = false;
    let minifyOptions: JsMinifyOptions | undefined;

    if ( this.config.minify ) {
      minifyEnabled = true;

      if ( typeof this.config.minify === "object" ) {
        minifyOptions = this.config.minify;
      } else {
        minifyOptions = {
          keep_classnames: this.tsConfig.compilerOptions.experimentalDecorators,
        };
      }
    }

    const swcOptions: SwcOptions = {
      cwd: this.config.root,
      root: this.config.root,
      sourceRoot: this.config.root,
      outputPath: this.config.output?.dir,
      sourceMaps: sourceMapsEnabled,
      minify: minifyEnabled,
      jsc: {
        minify: minifyOptions,
        parser: {
          syntax: "ecmascript",
          jsx: this.tsConfig.compilerOptions.jsx !== ts.JsxEmit.None,
          decorators: this.tsConfig.compilerOptions.experimentalDecorators,
        },
        transform: {
          legacyDecorator: this.tsConfig.compilerOptions.experimentalDecorators,
          decoratorMetadata: this.tsConfig.compilerOptions.emitDecoratorMetadata,
          useDefineForClassFields: this.tsConfig.compilerOptions.useDefineForClassFields,
          treatConstEnumAsEnum: this.tsConfig.compilerOptions.preserveConstEnums,
        },
        target: jscTarget,
      },
      isModule: "unknown",
      configFile: false,
      swcrc: false,
    };

    return swcOptions;
  };

  replaceVars = (filename: string, vars: Record<string, string>) => {
    vars = deepMerge(vars, {
      format: this.format,
    });

    Object.entries(vars).forEach(([key, value]) => {
      filename = filename.replaceAll(`[${key}]`, value);
    });

    return filename;
  };

  entryName = (userEntryName: unknown, vars: { default: string; ext: string }) => {
    const defaultFileName = `${vars["default"]}.${vars["ext"]}`;

    if ( !userEntryName ) {
      return this.replaceVars(defaultFileName, vars);
    }

    if ( typeof userEntryName === "string" ) {
      return this.replaceVars(userEntryName, vars);
    }

    if ( typeof userEntryName === "function" ) {
      return (chunkInfo: PreRenderedChunk) => {
        const entryName = (userEntryName as any)({
          format: this.format as BundleFormat,
          primary: this.primary,
          chunkInfo,
        });

        if ( !entryName ) {
          return defaultFileName;
        }

        return this.replaceVars(entryName, vars);
      };
    }

    throw new Error("Invalid entryName option");
  };

  chunkName = (userChunkName: unknown, vars: { default: string; ext: string }) => {
    const defaultFileName = `${vars["default"]}.${vars["ext"]}`;

    if ( !userChunkName ) {
      return this.replaceVars(defaultFileName, vars);
    }

    if ( typeof userChunkName === "string" ) {
      return this.replaceVars(userChunkName, vars);
    }

    if ( typeof userChunkName === "function" ) {
      return (chunkInfo: PreRenderedChunk) => {
        const chunkName = (userChunkName as any)({
          format: this.format as BundleFormat,
          primary: this.primary,
          chunkInfo,
        });

        if ( !chunkName ) {
          return defaultFileName;
        }

        return this.replaceVars(chunkName, vars);
      };
    }

    throw new Error("Invalid chunkName option");
  };

  dtsRollup = async () => {
    let declaration: Declaration = {};

    if ( typeof this.config.declaration === "string" || Array.isArray(this.config.declaration) ) {
      declaration.entry = this.config.declaration;
    } else if ( typeof this.config.declaration === "object" ) {
      declaration = this.config.declaration;
    }

    let rollupOptions = this.commonRollupOptions();

    rollupOptions.input = declaration.entry ?? this.input;
    rollupOptions.output = deepMerge(rollupOptions.output, {
      dir: declaration.output?.dir ?? this.config.output?.dir,
      entryFileNames: this.entryName(declaration?.output?.entryName, {
        default: "[name]",
        ext: "d.ts",
      }),
      chunkFileNames: this.chunkName(declaration?.output?.chunkName, {
        default: "[hash]",
        ext: "d.ts",
      }),
      sourcemap: false,
    });
    rollupOptions.external = (source, importer) => {
      if ( importer === undefined ) {
        return false;
      }

      if ( path.isAbsolute(source) ) {
        return false;
      }

      if ( source.startsWith(".") ) {
        return false;
      }

      let moduleName = source.split("/")[0];

      if ( moduleName?.startsWith("@") ) {
        moduleName += `/${source.split("/")[1]}`;
      }

      moduleName = normalizePath(moduleName!);

      for ( const noExternalItem of (declaration.noExternal ?? []) ) {
        if ( typeof noExternalItem === "string" ) {
          if ( moduleName === noExternalItem ) {
            return false;
          }
        } else if ( noExternalItem instanceof RegExp ) {
          if ( moduleName.match(noExternalItem) ) {
            return false;
          }
        }
      }

      for ( const externalItem of (declaration.external ?? []) ) {
        if ( typeof externalItem === "string" ) {
          if ( moduleName === externalItem ) {
            return true;
          }
        } else if ( externalItem instanceof RegExp ) {
          if ( moduleName.match(externalItem) ) {
            return true;
          }
        }
      }

      for ( const noExternalItem of (this.config.noExternal ?? []) ) {
        if ( typeof noExternalItem === "string" ) {
          if ( moduleName === noExternalItem ) {
            return false;
          }
        } else if ( noExternalItem instanceof RegExp ) {
          if ( moduleName.match(noExternalItem) ) {
            return false;
          }
        }
      }

      for ( const externalItem of (this.config.external ?? []) ) {
        if ( typeof externalItem === "string" ) {
          if ( moduleName === externalItem ) {
            return true;
          }
        } else if ( externalItem instanceof RegExp ) {
          if ( moduleName.match(externalItem) ) {
            return true;
          }
        }
      }

      return false;
    };

    let dtsOptions: DtsOptions = {
      // compilerOptions: this.tsConfig.compilerOptions,
      respectExternal: declaration.respectExternal,
    };

    //

    if ( this.config.rollup ) {
      if ( typeof this.config.rollup === "object" ) {
        rollupOptions = deepMerge(rollupOptions, this.config.rollup);
      } else {
        const context = await this.config.rollup({
          format: this.format,
          primary: this.primary,
          config: this.config,
          rollupOptions: rollupOptions,
        });

        rollupOptions = deepMerge(rollupOptions, context.rollupOptions);
      }
    }

    if ( this.config.dts ) {
      if ( typeof this.config.dts === "object" ) {
        dtsOptions = deepMerge(dtsOptions, this.config.dts);
      } else {
        const context = await this.config.dts({
          format: this.format as DeclarationFormat,
          primary: this.primary,
          config: this.config,
          rollupOptions: rollupOptions,
          dtsOptions: dtsOptions,
        });

        dtsOptions = deepMerge(dtsOptions, context.dtsOptions);
      }
    }

    //

    (rollupOptions.plugins as any[]).push(dtsPlugin(dtsOptions));

    return rollupOptions;
  };

  amdRollup = async () => {
    let rollupOptions = deepMerge(this.commonRollupOptions(), {
      output: {
        entryFileNames: this.entryName(this.config.output?.entryName, {
          default: "[name]",
          ext: this.primary ? "js" : "amd.js",
        }),
        chunkFileNames: this.chunkName(this.config.output?.chunkName, {
          default: "[hash]",
          ext: this.primary ? "js" : "amd.js",
        }),
        format: "amd",
      },
    });

    if ( this.config.rollup ) {
      if ( typeof this.config.rollup === "object" ) {
        rollupOptions = deepMerge(rollupOptions, this.config.rollup);
      } else {
        const context = await this.config.rollup({
          format: this.format,
          primary: this.primary,
          config: this.config,
          rollupOptions: rollupOptions,
        });

        rollupOptions = deepMerge(rollupOptions, context.rollupOptions);
      }
    }

    let swcOptions = this.commonSwcOptions();

    if ( this.config.swc ) {
      if ( typeof this.config.swc === "object" ) {
        swcOptions = deepMerge(swcOptions, this.config.swc);
      } else {
        const context = await this.config.swc({
          format: this.format as BundleFormat,
          primary: this.primary,
          config: this.config,
          rollupOptions: rollupOptions,
          swcOptions: swcOptions,
        });

        swcOptions = deepMerge(swcOptions, context.swcOptions);
      }
    }

    (rollupOptions.plugins as any[]).push(swcPlugin({
      swcOptions,
    }));

    return rollupOptions;
  };

  cjsRollup = async () => {
    let rollupOptions = deepMerge(this.commonRollupOptions(), {
      output: {
        entryFileNames: this.entryName(this.config.output?.entryName, {
          default: "[name]",
          ext: this.primary ? "js" : "cjs",
        }),
        chunkFileNames: this.chunkName(this.config.output?.chunkName, {
          default: "[hash]",
          ext: this.primary ? "js" : "cjs",
        }),
        format: "cjs",
      },
    });

    if ( this.config.rollup ) {
      if ( typeof this.config.rollup === "object" ) {
        rollupOptions = deepMerge(rollupOptions, this.config.rollup);
      } else {
        const context = await this.config.rollup({
          format: this.format,
          primary: this.primary,
          config: this.config,
          rollupOptions: rollupOptions,
        });

        rollupOptions = deepMerge(rollupOptions, context.rollupOptions);
      }
    }

    let swcOptions = this.commonSwcOptions();

    if ( this.config.swc ) {
      if ( typeof this.config.swc === "object" ) {
        swcOptions = deepMerge(swcOptions, this.config.swc);
      } else {
        const context = await this.config.swc({
          format: this.format as BundleFormat,
          primary: this.primary,
          config: this.config,
          rollupOptions: rollupOptions,
          swcOptions: swcOptions,
        });

        swcOptions = deepMerge(swcOptions, context.swcOptions);
      }
    }

    (rollupOptions.plugins as any[]).push(swcPlugin({
      swcOptions,
    }));

    return rollupOptions;
  };

  esmRollup = async () => {
    let rollupOptions = deepMerge(this.commonRollupOptions(), {
      output: {
        entryFileNames: this.entryName(this.config.output?.entryName, {
          default: "[name]",
          ext: this.primary ? "js" : "mjs",
        }),
        chunkFileNames: this.chunkName(this.config.output?.chunkName, {
          default: "[hash]",
          ext: this.primary ? "js" : "mjs",
        }),
        format: "esm",
      },
    });

    if ( this.config.rollup ) {
      if ( typeof this.config.rollup === "object" ) {
        rollupOptions = deepMerge(rollupOptions, this.config.rollup);
      } else {
        const context = await this.config.rollup({
          format: this.format,
          primary: this.primary,
          config: this.config,
          rollupOptions: rollupOptions,
        });

        rollupOptions = deepMerge(rollupOptions, context.rollupOptions);
      }
    }

    let swcOptions = this.commonSwcOptions();

    if ( this.config.swc ) {
      if ( typeof this.config.swc === "object" ) {
        swcOptions = deepMerge(swcOptions, this.config.swc);
      } else {
        const context = await this.config.swc({
          format: this.format as BundleFormat,
          primary: this.primary,
          config: this.config,
          rollupOptions: rollupOptions,
          swcOptions: swcOptions,
        });

        swcOptions = deepMerge(swcOptions, context.swcOptions);
      }
    }

    (rollupOptions.plugins as any[]).push(swcPlugin({
      swcOptions,
    }));

    return rollupOptions;
  };

  iifeRollup = async () => {
    let rollupOptions = deepMerge(this.commonRollupOptions(), {
      output: {
        entryFileNames: this.entryName(this.config.output?.entryName, {
          default: "[name]",
          ext: this.primary ? "js" : "iife.js",
        }),
        chunkFileNames: this.chunkName(this.config.output?.chunkName, {
          default: "[hash]",
          ext: this.primary ? "js" : "iife.js",
        }),
        format: "iife",
      },
    });

    if ( this.config.rollup ) {
      if ( typeof this.config.rollup === "object" ) {
        rollupOptions = deepMerge(rollupOptions, this.config.rollup);
      } else {
        const context = await this.config.rollup({
          format: this.format,
          primary: this.primary,
          config: this.config,
          rollupOptions: rollupOptions,
        });

        rollupOptions = deepMerge(rollupOptions, context.rollupOptions);
      }
    }

    let swcOptions = this.commonSwcOptions();

    if ( this.config.swc ) {
      if ( typeof this.config.swc === "object" ) {
        swcOptions = deepMerge(swcOptions, this.config.swc);
      } else {
        const context = await this.config.swc({
          primary: this.primary,
          format: this.format as BundleFormat,
          config: this.config,
          rollupOptions: rollupOptions,
          swcOptions: swcOptions,
        });

        swcOptions = deepMerge(swcOptions, context.swcOptions);
      }
    }

    (rollupOptions.plugins as any[]).push(swcPlugin({
      swcOptions,
    }));

    return rollupOptions;
  };

  //

  umdRollup = async () => {
    let rollupOptions = deepMerge(this.commonRollupOptions(), {
      output: {
        entryFileNames: this.entryName(this.config.output?.entryName, {
          default: "[name]",
          ext: this.primary ? "js" : "umd.js",
        }),
        chunkFileNames: this.chunkName(this.config.output?.chunkName, {
          default: "[hash]",
          ext: this.primary ? "js" : "umd.js",
        }),
        format: "umd",
      },
    });

    if ( this.config.rollup ) {
      if ( typeof this.config.rollup === "object" ) {
        rollupOptions = deepMerge(rollupOptions, this.config.rollup);
      } else {
        const context = await this.config.rollup({
          format: this.format,
          primary: this.primary,
          config: this.config,
          rollupOptions: rollupOptions,
        });

        rollupOptions = deepMerge(rollupOptions, context.rollupOptions);
      }
    }

    let swcOptions = this.commonSwcOptions();

    if ( this.config.swc ) {
      if ( typeof this.config.swc === "object" ) {
        swcOptions = deepMerge(swcOptions, this.config.swc);
      } else {
        const context = await this.config.swc({
          format: this.format as BundleFormat,
          primary: this.primary,
          config: this.config,
          rollupOptions: rollupOptions,
          swcOptions: swcOptions,
        });

        swcOptions = deepMerge(swcOptions, context.swcOptions);
      }
    }

    (rollupOptions.plugins as any[]).push(swcPlugin({
      swcOptions,
    }));

    return rollupOptions;
  };

  systemRollup = async () => {
    let rollupOptions = deepMerge(this.commonRollupOptions(), {
      output: {
        entryFileNames: this.entryName(this.config.output?.entryName, {
          default: "[name]",
          ext: this.primary ? "js" : "system.js",
        }),
        chunkFileNames: this.chunkName(this.config.output?.chunkName, {
          default: "[hash]",
          ext: this.primary ? "js" : "system.js",
        }),
        format: "system",
      },
    });

    if ( this.config.rollup ) {
      if ( typeof this.config.rollup === "object" ) {
        rollupOptions = deepMerge(rollupOptions, this.config.rollup);
      } else {
        const context = await this.config.rollup({
          format: this.format,
          primary: this.primary,
          config: this.config,
          rollupOptions: rollupOptions,
        });

        rollupOptions = deepMerge(rollupOptions, context.rollupOptions);
      }
    }

    let swcOptions = this.commonSwcOptions();

    if ( this.config.swc ) {
      if ( typeof this.config.swc === "object" ) {
        swcOptions = deepMerge(swcOptions, this.config.swc);
      } else {
        const context = await this.config.swc({
          format: this.format as BundleFormat,
          primary: this.primary,
          config: this.config,
          rollupOptions: rollupOptions,
          swcOptions: swcOptions,
        });

        swcOptions = deepMerge(swcOptions, context.swcOptions);
      }
    }

    (rollupOptions.plugins as any[]).push(swcPlugin({
      swcOptions,
    }));

    return rollupOptions;
  };

  printEntries(input: InputOption) {
    let entries: string[];

    if ( input instanceof Array ) {
      entries = input.map((item) => {
        return normalizePath(path.relative(this.config.root!, item));
      });
    } else if ( typeof input === "object" ) {
      entries = Object.keys(input).map((key) => {
        return normalizePath(path.relative(this.config.root!, input[key] as string));
      });
    } else {
      entries = [normalizePath(path.relative(this.config.root!, input))];
    }

    if ( entries.length > 3 ) {
      console.info(`build ${this.logger.mark(`${entries.length} entries`)}`);
    } else {
      console.info(`build ${entries.map((entry) => {
        return this.logger.mark(entry);
      }).join(" ")}`);
    }
  }

  watch = (rollupOptions: RollupOptions) => {
    this.watcher = watch(rollupOptions);

    this.watcher.on("event", async (event) => {
      if ( event.code === "BUNDLE_START" ) {
        if ( this.config.onBuildStart ) {
          await this.config.onBuildStart(this.format);
        }

        const { input } = event;

        return this.printEntries(input!);
      }

      if ( event.code === "BUNDLE_END" ) {
        if ( this.config.onBuildEnd ) {
          await this.config.onBuildEnd(this.format);
        }

        const { duration, result } = event;

        this.cache = result.cache;

        return console.info(`build finished in ${this.logger.mark(`${duration}ms`)}`);
      }

      if ( event.code === "ERROR" ) {
        const { code } = event.error;

        if ( code === "PLUGIN_ERROR" ) {
          const { plugin } = event.error;

          return console.error(`[plugin:${plugin}] ${event.error}`);
        }

        return console.error(event.error);
      }

      if ( event.code === "END" ) {
        console.info("watching for changes ...");
      }
    });

    this.watcher.on("change", (file, change) => {
      const { event } = change;

      const relativePath = path.relative(this.config.root!, file);

      if ( event === "update" ) {
        console.info(`${this.logger.mark(relativePath)} changed`);
      } else if ( event === "delete" ) {
        console.info(`${this.logger.mark(relativePath)} removed`);
      } else if ( event === "create" ) {
        console.info(`${this.logger.mark(relativePath)} added`);
      }
    });

    this.watcher.on("close", () => {
      this.watcher = undefined;
    });
  };

  build = async (rollupOptions: RollupOptions) => {
    if ( this.config.onBuildStart ) {
      await this.config.onBuildStart(this.format);
    }

    const start = process.hrtime.bigint();

    this.printEntries(rollupOptions.input!);

    const build = await rollup(rollupOptions);

    this.cache = build.cache;

    await build.write((rollupOptions.output as any));

    const end = process.hrtime.bigint();
    const duration = Math.round((Number(end - start)) / 1000000);
    console.info(`finished in ${this.logger.mark(`${duration}ms`)}`);

    if ( this.config.onBuildEnd ) {
      await this.config.onBuildEnd(this.format);
    }

    process.exit(0);
  };

  //

  init = async () => {
    const userConfigFile = path.resolve(this.config.cacheDir!, rosepackTmpConfigFile);

    if ( !fs.existsSync(userConfigFile) ) {
      return;
    }

    const file = url.pathToFileURL(userConfigFile);

    file.hash = Date.now().toString();

    const userConfig: Config = await import( file.href ).then((configLoaded) => {
      const mod = configLoaded.rosepack || configLoaded.default;

      if ( typeof mod === "function" ) {
        return mod(this.config);
      }

      return mod;
    });

    this.config = deepMerge(this.config, {
      watchOptions: userConfig.watchOptions,
      //
      output: {
        entryName: userConfig.output?.entryName,
        chunkName: userConfig.output?.chunkName,
      },
      declaration: userConfig.declaration,
      //
      treeshake: userConfig.treeshake ?? this.config.treeshake,
      //
      onBuildEnd: userConfig.onBuildEnd,
      onBuildStart: userConfig.onBuildStart,
      //
      rollup: userConfig.rollup,
      swc: userConfig.swc,
      dts: userConfig.dts,
      //
      logger: userConfig.logger,
    });
  };

  start = async (payload: any) => {
    if ( this.watcher ) {
      await this.watcher.close();
    }

    if ( this.cache ) {
      this.cache = undefined;
    }

    this.format = payload.format;

    this.config = payload.config;
    this.packageJson = payload.packageJson;
    this.tsConfig = payload.tsConfig;

    await this.init();

    this.logger = new RosepackLogger(this.config);

    let rollupOptions: RollupOptions;

    switch ( this.format ) {
      case "dts":
        rollupOptions = await this.dtsRollup();
        break;
      case "amd":
        rollupOptions = await this.amdRollup();
        break;
      case "cjs":
        rollupOptions = await this.cjsRollup();
        break;
      case "esm":
        rollupOptions = await this.esmRollup();
        break;
      case "iife":
        rollupOptions = await this.iifeRollup();
        break;
      case "umd":
        rollupOptions = await this.umdRollup();
        break;
      case "system":
        rollupOptions = await this.systemRollup();
        break;
      default:
        throw new Error(`format ${this.format} is not supported`);
    }

    if ( this.config.watch ) {
      return this.watch(rollupOptions);
    }

    return this.build(rollupOptions);
  };
}

const rosetask = new Rosetask();

if ( !isMainThread ) {
  console.debug = (...args: any[]) => {
    parentPort?.postMessage({
      type: "debug",
      payload: args,
    });
  };

  console.warn = (...args: any[]) => {
    parentPort?.postMessage({
      type: "warn",
      payload: args,
    });
  };

  parentPort?.on("message", (message) => {
    const { type, payload } = message;

    if ( type === "start" ) {
      return rosetask.start(payload);
    }
  });
}

export default rosetask;