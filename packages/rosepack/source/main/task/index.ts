import {merge, normalize, createFilter} from "rosetil";

import ts from "typescript";

import {RollupOptions, RollupWatcher, RollupCache, InputOption, PreRenderedChunk, rollup, watch, RollupBuild} from "rollup";

import {JscTarget} from "@swc/core";

import dtsPlugin from "rollup-plugin-dts";

import nodeResolvePlugin from "@rollup/plugin-node-resolve";
import commonjsPlugin from "@rollup/plugin-commonjs";
import jsonPlugin from "@rollup/plugin-json";

import resolvePlugin from "./plugins/resolve";
import definePlugin from "./plugins/define";
import shimsPlugin from "./plugins/shims";
import bannerPlugin from "./plugins/banner";
import shebangPlugin from "./plugins/shebang";
import rawPlugin from "./plugins/raw";
import sizePlugin from "./plugins/size";
import swcPlugin from "./plugins/swc";

import Logger, {colors} from "~shared/logger";

import {TaskConfig} from "~shared/config";

import {builtinModules} from "module";

import path from "path";

class Task {
  private logger: Logger;

  private bundler?: RollupBuild;

  private watcher?: RollupWatcher;

  private cache?: RollupCache;

  private createLogger = () => {
    this.logger = new Logger(this.config.logger, this.config.format);
  };

  constructor(public config: TaskConfig) {
    this.createLogger();
  }

  private resolveInput = () => {
    let input: InputOption;

    if (typeof this.config.input === "string") {
      input = this.config.input;
    } else if (Array.isArray(this.config.input)) {
      input = this.config.input.filter((input) => {
        if (typeof input === "string") {
          return true;
        }

        const formats = Array.isArray(input.format) ? input.format : [input.format];

        return formats.includes(this.config.format);
      }).map((input) => {
        if (typeof input === "string") {
          return input;
        }

        return input.input;
      });
    } else {
      input = Object.entries(this.config.input!).reduce((inputs: Record<string, string>, [name, input]) => {
        if (typeof input === "string") {
          inputs[name] = input;
        } else {
          const formats = Array.isArray(input.format) ? input.format : [input.format];

          if (formats.includes(this.config.format)) {
            inputs[name] = input.input;
          }
        }

        return inputs;
      }, {});
    }

    return input;
  };

  //

  private replaceVars = (filename: string, vars: Record<string, string>) => {
    vars = merge(vars, {
      format: this.config.format
    });

    Object.entries(vars).forEach(([key, value]) => {
      filename = filename.replaceAll(`[${key}]`, value);
    });

    return filename;
  };

  private entryName = (userEntryName: unknown, vars: { default: string; ext: string }) => {
    const defaultFileName = `${vars["default"]}.${vars["ext"]}`;

    if (!userEntryName) {
      return this.replaceVars(defaultFileName, vars);
    }

    if (typeof userEntryName === "string") {
      return this.replaceVars(userEntryName, vars);
    }

    if (typeof userEntryName === "function") {
      return (chunkInfo: PreRenderedChunk) => {
        const entryName = (userEntryName as any)({
          format: this.config.format,
          primary: this.config.primary,
          chunkInfo
        });

        if (!entryName) {
          return defaultFileName;
        }

        return this.replaceVars(entryName, vars);
      };
    }

    throw new Error("Invalid entryName option");
  };

  private chunkName = (userChunkName: unknown, vars: { default: string; ext: string }) => {
    const defaultFileName = `${vars["default"]}.${vars["ext"]}`;

    if (!userChunkName) {
      return this.replaceVars(defaultFileName, vars);
    }

    if (typeof userChunkName === "string") {
      return this.replaceVars(userChunkName, vars);
    }

    if (typeof userChunkName === "function") {
      return (chunkInfo: PreRenderedChunk) => {
        const chunkName = (userChunkName as any)({
          format: this.config.format,
          primary: this.config.primary,
          chunkInfo
        });

        if (!chunkName) {
          return defaultFileName;
        }

        return this.replaceVars(chunkName, vars);
      };
    }

    throw new Error("Invalid chunkName option");
  };

  //

  private commonRollup = () => {
    const ignoreWarnings = [
      "EMPTY_BUNDLE",
      "THIS_IS_UNDEFINED",
      "MIXED_EXPORTS"
    ];

    const notExternal = createFilter({
      include: this.config.output?.noExternal,
      exclude: this.config.output?.external,
      default: true
    });

    const deps: string[] = [];

    if (Array.isArray(this.config.output?.externalDeps)) {
      deps.push(...this.config.output?.externalDeps);
    }

    if (Array.isArray(this.config.output?.externalDevDeps)) {
      deps.push(...this.config.output?.externalDevDeps);
    }

    if (Array.isArray(this.config.output?.externalPeerDeps)) {
      deps.push(...this.config.output?.externalPeerDeps);
    }

    notExternal.include(deps);

    if (this.config.output?.file) {
      delete this.config.output?.dir;
    }

    return merge(this.config.output?.rollupOptions ?? {}, {
      input: this.resolveInput(),
      output: {
        dir: this.config.output?.dir,
        file: this.config.output?.file,
        name: this.config.output?.name,
        sourcemap: this.config.output?.sourcemap,
        //
        generatedCode: {
          preset: "es2015",
          arrowFunctions: true,
          constBindings: true,
          objectShorthand: true,
          reservedNamesAsProps: true,
          symbols: true
        },
        esModule: this.config.tsConfig?.compilerOptions?.esModuleInterop,
        compact: !!this.config.output?.minify,
        freeze: false,
        minifyInternalExports: false,
        hoistTransitiveImports: false,
        validate: false,
        exports: "auto"
      },
      cache: this.cache,
      watch: {
        chokidar: this.config.watchOptions
      },
      plugins: [
        // @ts-ignore
        nodeResolvePlugin({
          rootDir: this.config.cwd,
          extensions: [".js", ".mjs", "cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx", ".json", ".node"],
          preferBuiltins: this.config.target === "node",
          browser: this.config.target === "browser"
        }),
        resolvePlugin({
          cwd: this.config.cwd,
          tsConfig: this.config.tsConfig,
          logger: this.logger
        }),
        // @ts-ignore
        jsonPlugin({
          preferConst: true
        }),
        definePlugin({
          define: this.config.define,
          defineEnv: this.config.defineEnv,
          logger: this.logger
        }),
        rawPlugin({
          logger: this.logger
        }),
        shimsPlugin({
          format: this.config.format,
          esmShims: this.config.output?.esm?.shims ?? true,
          logger: this.logger
        }),
        bannerPlugin({
          entryOnly: this.config.output?.banner?.entryOnly,
          footer: this.config.output?.banner?.footer,
          header: this.config.output?.banner?.header,
          logger: this.logger
        }),
        shebangPlugin({
          logger: this.logger,
          cwd: this.config.cwd,
          format: this.config.format
        }),
        sizePlugin({
          logger: this.logger
        })
      ],
      onLog: (level, log) => {
        let format = log.message;

        if (log.plugin) {
          format = `[plugin:${log.plugin}] ${format}`;
        }

        if (log.stack) {
          format = `${format}\n${log.stack}`;
        }

        switch (level) {
          case "info":
            return this.logger.info(format);
          case "warn":
            return this.logger.warn(format);
          case "debug":
            return this.logger.debug(format);
        }
      },
      onwarn: (warning) => {
        let {code, message} = warning;

        if (!code) {
          code = "UNKNOWN";
        }

        this.logger.debug("[warning]", this.logger.mark(code), message);

        if (ignoreWarnings.includes(code)) {
          return;
        }

        if (code === "PLUGIN_WARNING") {
          const {plugin, stack} = warning;

          return this.logger.warn(`${colors.warn(`[plugin:${plugin}]`)} ${message}`, stack);
        }

        if (code === "MISSING_NAME_OPTION_FOR_IIFE_EXPORT") {
          return this.logger.warn(`${colors.warn(code)}: Define a name for ${this.config.format} in ${this.logger.mark("output.name")}`);
        }

        return this.logger.warn(`${colors.warn(code)}: ${message}`);
      },
      external: (source, importer) => {
        if (!importer) {
          return false;
        }

        if (path.isAbsolute(source)) {
          return false;
        }

        if (source.startsWith(".")) {
          return false;
        }

        let moduleName = source.split("/")[0];

        moduleName ??= source;

        if (moduleName?.startsWith("@")) {
          moduleName += `/${source.split("/")[1]}`;
        }

        if (this.config.target === "node") {
          if (moduleName.startsWith("node:") || builtinModules.includes(moduleName)) {
            return false;
          }
        }

        if (moduleName === "rosepack") {
          return false;
        }

        const result = !notExternal(moduleName);

        this.logger.debug(`${colors.debug("external")} ${colors.debug(source)} ${colors.debug("->")} ${colors.debug(result)}`);

        return result;
      }
    });
  };

  private commonSwc = () => {
    let jscTarget: JscTarget;

    switch (this.config.tsConfig?.compilerOptions?.target) {
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

    if (this.config.output?.sourcemap) {
      sourceMapsEnabled = true;
    }

    return merge(this.config.output?.swcOptions ?? {}, {
      cwd: this.config.cwd,
      root: this.config.cwd,
      sourceRoot: this.config.cwd,
      outputPath: this.config.output?.dir,
      minify: this.config.output?.minify,
      sourceMaps: sourceMapsEnabled,
      jsc: {
        externalHelpers: false,
        minify: {
          keep_classnames: true
        },
        transform: {
          legacyDecorator: this.config.tsConfig?.compilerOptions?.experimentalDecorators,
          decoratorMetadata: this.config.tsConfig?.compilerOptions?.emitDecoratorMetadata,
          useDefineForClassFields: this.config.tsConfig?.compilerOptions?.useDefineForClassFields,
          treatConstEnumAsEnum: this.config.tsConfig?.compilerOptions?.preserveConstEnums
        },
        target: jscTarget
      },
      isModule: "unknown",
      configFile: false,
      swcrc: false
    });
  };

  //

  private dtsRollup = () => {
    return merge(this.commonRollup(), {
      output: {
        format: "esm",
        entryFileNames: this.entryName(this.config.output?.entryName, {
          default: "[name]",
          ext: "d.ts"
        }),
        chunkFileNames: this.chunkName(this.config.output?.chunkName, {
          default: "[hash]",
          ext: "d.ts"
        }),
        sourcemap: false
      },
      plugins: [
        // @ts-ignore
        dtsPlugin({
          respectExternal: true,
          compilerOptions: {
            ...this.config.tsConfig?.compilerOptions,
            target: ts.ScriptTarget.ESNext,
            declaration: true,
            noEmit: false,
            emitDeclarationOnly: true,
            noEmitOnError: true,
            checkJs: false,
            declarationMap: false,
            skipLibCheck: true,
            preserveSymlinks: false
          }
        })
      ]
    });
  };

  private esmRollup = () => {
    return merge(this.commonRollup(), {
      output: {
        format: "esm",
        entryFileNames: this.entryName(this.config.output?.entryName, {
          default: "[name]",
          ext: this.config.primary ? "js" : "mjs"
        }),
        chunkFileNames: this.chunkName(this.config.output?.chunkName, {
          default: "[hash]",
          ext: this.config.primary ? "js" : "mjs"
        })
      },
      onLog: (level, log) => {
        console.log(level, log);
      },
      plugins: [
        // @ts-ignore
        commonjsPlugin({
          transformMixedEsModules: true
        }),
        swcPlugin({
          logger: this.logger,
          tsConfig: this.config.tsConfig,
          options: merge(this.commonSwc(), {
            module: {
              type: "es6"
            }
          })
        })
      ]
    });
  };

  private cjsRollup = () => {
    return merge(this.commonRollup(), {
      output: {
        format: "cjs",
        entryFileNames: this.entryName(this.config.output?.entryName, {
          default: "[name]",
          ext: this.config.primary ? "js" : "cjs"
        }),
        chunkFileNames: this.chunkName(this.config.output?.chunkName, {
          default: "[hash]",
          ext: this.config.primary ? "js" : "cjs"
        })
      },
      plugins: [
        swcPlugin({
          logger: this.logger,
          tsConfig: this.config.tsConfig,
          options: merge(this.commonSwc(), {
            module: {
              type: "commonjs"
            }
          })
        })
      ]
    });
  };

  private amdRollup = () => {
    return merge(this.commonRollup(), {
      output: {
        format: "amd",
        entryFileNames: this.entryName(this.config.output?.entryName, {
          default: "[name]",
          ext: this.config.primary ? "js" : "amd.js"
        }),
        chunkFileNames: this.chunkName(this.config.output?.chunkName, {
          default: "[hash]",
          ext: this.config.primary ? "js" : "amd.js"
        })
      },
      plugins: [
        swcPlugin({
          logger: this.logger,
          tsConfig: this.config.tsConfig,
          options: merge(this.commonSwc(), {
            module: {
              type: "amd"
            }
          })
        })
      ]
    });
  };

  private iifeRollup = () => {
    return merge(this.commonRollup(), {
      output: {
        format: "iife",
        entryFileNames: this.entryName(this.config.output?.entryName, {
          default: "[name]",
          ext: this.config.primary ? "js" : "iife.js"
        }),
        chunkFileNames: this.chunkName(this.config.output?.chunkName, {
          default: "[hash]",
          ext: this.config.primary ? "js" : "iife.js"
        })
      },
      plugins: [
        swcPlugin({
          logger: this.logger,
          tsConfig: this.config.tsConfig,
          options: this.commonSwc()
        })
      ]
    });
  };

  private umdRollup = () => {
    return merge(this.commonRollup(), {
      output: {
        format: "iife",
        entryFileNames: this.entryName(this.config.output?.entryName, {
          default: "[name]",
          ext: this.config.primary ? "js" : "umd.js"
        }),
        chunkFileNames: this.chunkName(this.config.output?.chunkName, {
          default: "[hash]",
          ext: this.config.primary ? "js" : "umd.js"
        })
      },
      plugins: [
        swcPlugin({
          logger: this.logger,
          tsConfig: this.config.tsConfig,
          options: merge(this.commonSwc(), {
            module: {
              type: "umd"
            }
          })
        })
      ]
    });
  };

  private systemRollup = () => {
    return merge(this.commonRollup(), {
      output: {
        format: "systemjs",
        entryFileNames: this.entryName(this.config.output?.entryName, {
          default: "[name]",
          ext: this.config.primary ? "js" : "sys.js"
        }),
        chunkFileNames: this.chunkName(this.config.output?.chunkName, {
          default: "[hash]",
          ext: this.config.primary ? "js" : "sys.js"
        })
      },
      plugins: [
        swcPlugin({
          logger: this.logger,
          tsConfig: this.config.tsConfig,
          options: merge(this.commonSwc(), {
            module: {
              type: "systemjs"
            }
          })
        })
      ]
    });
  };

  //

  private printEntries(input: InputOption) {
    let entries: string[];

    if (input instanceof Array) {
      entries = input.map((item) => {
        return normalize(path.relative(this.config.cwd, item));
      });
    } else if (typeof input === "object") {
      entries = Object.values(input).map((item) => {
        return normalize(path.relative(this.config.cwd, item));
      });
    } else {
      entries = [normalize(path.relative(this.config.cwd, input))];
    }

    if (entries.length > 3) {
      this.logger.info(`Build ${this.logger.mark(`${entries.length} entries`)}`);
    } else {
      this.logger.info(`Build ${entries.map((input) => this.logger.mark(input)).join(", ")}`);
    }
  }

  private build = async (rollupOptions: RollupOptions) => {
    const timer = this.logger.timer();

    this.printEntries(rollupOptions.input!);

    this.bundler = await rollup(rollupOptions);

    await this.bundler.write(rollupOptions.output as any);

    this.logger.info(`Finished in ${this.logger.mark(`${timer.end()}ms`)}`);

    this.cache = this.bundler.cache;

    if (!this.bundler?.closed) {
      await this.bundler.close();
    }
  };

  private watch = async (rollupOptions: RollupOptions) => {
    let isResolved = false;

    return new Promise<void>(async (resolve) => {
      this.watcher = watch(rollupOptions);

      this.watcher.on("event", async (event) => {
        if (event.code === "BUNDLE_START") {
          const {input} = event;
          return this.printEntries(input!);
        }

        if (event.code === "BUNDLE_END") {
          const {duration, result} = event;

          this.cache = result.cache;

          this.logger.info(`Build finished in ${this.logger.mark(`${duration}ms`)}`);

          if (!isResolved) {
            isResolved = true;
            resolve();
          }
        }

        if (event.code === "ERROR") {
          const {code} = event.error;

          if (code === "PLUGIN_ERROR") {
            const {plugin} = event.error;

            return this.logger.error(`[plugin:${plugin}] ${event.error}`);
          }

          return this.logger.error(event.error);
        }

        if (event.code === "END") {
          this.logger.info("Watching for changes ...");
        }
      });

      this.watcher.on("change", (file, change) => {
        const {event} = change;

        const relativePath = path.relative(this.config.cwd!, file);

        if (event === "update") {
          this.logger.info(`${this.logger.mark(relativePath)} changed`);
        } else if (event === "delete") {
          this.logger.info(`${this.logger.mark(relativePath)} removed`);
        } else if (event === "create") {
          this.logger.info(`${this.logger.mark(relativePath)} added`);
        }
      });

      this.watcher.on("close", () => {
        this.watcher = undefined;
      });
    });
  };

  //

  stop = async () => {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
  };

  run = async () => {
    if (this.bundler) {
      await this.bundler.close();
    }

    if (this.watcher) {
      await this.watcher.close();
    }

    if (this.cache) {
      delete this.cache;
    }

    let rollupOptions: RollupOptions;

    switch (this.config.format) {
      case "dts":
        rollupOptions = this.dtsRollup();
        break;
      case "esm":
        rollupOptions = this.esmRollup();
        break;
      case "cjs":
        rollupOptions = this.cjsRollup();
        break;
      case "amd":
        rollupOptions = this.amdRollup();
        break;
      case "iife":
        rollupOptions = this.iifeRollup();
        break;
      case "umd":
        rollupOptions = this.umdRollup();
        break;
      case "sys":
        rollupOptions = this.systemRollup();
        break;
      default:
        throw new Error(`Format ${this.logger.mark(this.config.format)} is not supported`);
    }

    if (this.config.beforeFormatBuild) {
      await this.config.beforeFormatBuild(this.config.format);
    }

    if (this.config.watch) {
      await this.watch(rollupOptions);
    } else {
      await this.build(rollupOptions);
    }

    if (this.config.afterFormatBuild) {
      await this.config.afterFormatBuild(this.config.format);
    }
  };
}

export default Task;