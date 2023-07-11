import type { CreateFilter } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import type { FSWatcher } from "chokidar";
import { watch } from "chokidar";
import dotenv from "dotenv";
import glob from "fast-glob";
import fs from "fs";
import { builtinModules } from "module";
import path from "path";
import { rimraf } from "rimraf";
import url from "url";
import util from "util";

import { Worker } from "worker_threads";

import { packageJsonFile, rosepackConfigFile, tsConfigFile, rosepackEnvFile } from "~shared/constants";

import RosepackError, { ErrorCode } from "~shared/error";
import { loadConfig, loadPackageJson, loadTsConfig } from "~shared/loader";

import RosepackLogger from "~shared/logger";

import type { PackageJson, TsConfig } from "~shared/types";
import { cacheFinder, deepClone, deepMerge, normalizePath, rootFinder } from "~shared/utils";

import type { Config, Format } from "./config";

interface Task {
  state: "idle" | "pending" | "running" | "done" | "error";
  format: Format;
  worker: Worker;
}

class Rosetask {
  private readonly priorityConfig: Config;

  logger: RosepackLogger;

  config: Config;
  packageJson: PackageJson;
  tsConfig: TsConfig;

  constructor(priorityConfig: Config) {
    this.priorityConfig = priorityConfig;
  }

  //

  private resolveClean = (target?: string, include?: any, exclude?: any) => {
    target = target ?? this.config.output?.dir;

    if ( !target ) {
      throw new RosepackError(ErrorCode.Config, `invalid ${ this.logger.mark("clean") } config`);
    }

    let filter: ReturnType<CreateFilter> | undefined;

    if ( include || exclude ) {
      filter = createFilter(include, exclude);
    }

    return {
      target: normalizePath(target),
      filter,
    };
  };

  private clean = (main: boolean) => {
    if ( !this.config.clean ) {
      return;
    }

    let cleans: { target: string; filter?: ReturnType<CreateFilter> }[] = [];

    if ( typeof this.config.clean === "boolean" ) {
      cleans = [
        this.resolveClean(this.config.output?.dir),
      ];
    } else if ( typeof this.config.clean === "string" ) {
      cleans = [
        this.resolveClean(this.config.clean),
      ];
    } else if ( Array.isArray(this.config.clean) ) {
      cleans = this.config.clean.map((item) => {
        if ( typeof item === "string" ) {
          return this.resolveClean(item);
        }

        return this.resolveClean(item.target, item.include, item.exclude);
      });
    } else if ( typeof this.config.clean === "object" ) {
      cleans = [
        this.resolveClean(this.config.clean.target, this.config.clean.include, this.config.clean.exclude),
      ];
    } else {
      const error = new RosepackError(ErrorCode.Config, `invalid ${ this.logger.mark("clean") } config`);

      if ( main ) {
        throw error;
      }

      return this.logger.error(error);
    }

    const promises = cleans.map((clean) => {
      return rimraf(clean.target, {
        glob: {
          dot: true,
          follow: false,
        },
        filter: (path) => {
          if ( clean.filter ) {
            return clean.filter(path);
          }

          return true;
        },
      });
    });

    return Promise.all(promises).catch((error) => {
      const rosepackError = new RosepackError(ErrorCode.Clean, error);

      if ( main ) {
        throw rosepackError;
      }

      return this.logger.error(rosepackError);
    });
  };

  //

  private resolveCopy = (from?: string, to?: string, include?: any, exclude?: any) => {
    let absoluteFrom = from ?? "public";
    let absoluteTo = to ?? path.join(this.config.root!, this.config.output?.dir!);

    if ( !path.isAbsolute(absoluteFrom) ) {
      absoluteFrom = path.resolve(this.config.root!, absoluteFrom);
    }

    if ( !path.isAbsolute(absoluteTo) ) {
      absoluteTo = path.resolve(this.config.root!, absoluteTo);
    }

    const filter = createFilter(include, exclude);

    return {
      from: normalizePath(absoluteFrom),
      to: normalizePath(absoluteTo),
      filter,
    };
  };

  private copy = (main: boolean) => {
    if ( !this.config.copy ) {
      return;
    }

    let copies: { from: string; to: string; filter: ReturnType<CreateFilter> }[] = [];

    if ( typeof this.config.copy === "boolean" ) {
      copies = [
        this.resolveCopy(),
      ];
    } else if ( typeof this.config.copy === "string" ) {
      copies = [
        this.resolveCopy(this.config.copy),
      ];
    } else if ( Array.isArray(this.config.copy) ) {
      copies = this.config.copy.map((item) => {
        if ( typeof item === "string" ) {
          return this.resolveCopy(item);
        }

        return this.resolveCopy(item.from, item.to, item.include, item.exclude);
      });
    } else if ( typeof this.config.copy === "object" ) {
      copies = [
        this.resolveCopy(this.config.copy.from, this.config.copy.to, this.config.copy.include, this.config.copy.exclude),
      ];
    } else {
      const error = new RosepackError(ErrorCode.Config, `invalid ${ this.logger.mark("copy") } config`);

      if ( main ) {
        throw error;
      }

      return this.logger.error(error);
    }

    const promises = copies.map((copy) => {
      const { from, to, filter } = copy;

      return new Promise<void>(async (resolve, reject) => {
        try {
          if ( glob.isDynamicPattern(from) ) {
            let files = await glob(from, {
              absolute: true,
              followSymbolicLinks: false,
              onlyFiles: true,
              dot: true,
            });

            if ( filter ) {
              files = files.filter(filter);
            }

            for ( const file of files ) {
              const parentDir = path.dirname(file);
              const relativePath = path.relative(parentDir, file);
              const absolutePath = path.join(to, relativePath);

              await fs.promises.mkdir(path.dirname(absolutePath), {
                recursive: true,
              });
              await fs.promises.copyFile(file, absolutePath);

              this.logger.debug(`[copy] copied ${ relativePath } to ${ absolutePath }`);
            }

            return resolve();
          }
          if ( !fs.existsSync(from) ) {
            return resolve();
          }

          let files = await glob(normalizePath(path.join(from, "**/*")), {
            absolute: true,
            followSymbolicLinks: false,
            onlyFiles: true,
            dot: true,
          });

          if ( filter ) {
            files = files.filter(filter);
          }

          for ( const file of files ) {
            const relativePath = path.relative(from, file);
            const absolutePath = path.join(to, relativePath);

            await fs.promises.mkdir(path.dirname(absolutePath), {
              recursive: true,
            });
            await fs.promises.copyFile(file, absolutePath);

            this.logger.debug(`[copy] copied ${ relativePath } to ${ absolutePath }`);
          }

          return resolve();
        } catch ( error ) {
          reject(error);
        }
      });
    });

    return Promise.all(promises).catch((error) => {
      const rosepackError = new RosepackError(ErrorCode.Copy, error);

      if ( main ) {
        throw rosepackError;
      }

      return this.logger.error(rosepackError);
    });
  };

  //

  tasks: Task[] = [];

  private get taskFile() {
    return url.fileURLToPath(new URL(`./rosetask.${ __FORMAT__ }.js`, import.meta.url).href);
  }

  private get deserializedConfig() {
    const config = deepClone(this.config);

    if ( typeof config.watchOptions === "object" ) {
      delete config.watchOptions;
    }

    delete config.output?.entryName;
    delete config.output?.chunkName;

    if ( typeof config.treeshake === "object" ) {
      delete config.treeshake;
    }

    delete config.onBuildStart;
    delete config.onBuildEnd;

    delete config.rollup;
    delete config.swc;
    delete config.dts;

    delete config.logger;

    return config;
  }

  private createTask = (format: Format) => {
    const worker = new Worker(this.taskFile, {
      stdin: false,
      stdout: true,
      stderr: true,
      env: {
        ...process.env,
        FORCE_COLOR: "true",
      },
    });

    this.tasks.push({
      state: "idle",
      format,
      worker,
    });

    worker.stdout.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      this.logger.format(format).info(message);
    });

    worker.stderr.on("data", (data: Buffer) => {
      const message = data.toString().trim();
      this.logger.format(format).error(message);
    });

    worker.on("message", (message) => {
      const { type, payload } = message;

      if ( type === "debug" ) {
        return this.logger.format(format).debug(...payload);
      }

      if ( type === "warn" ) {
        return this.logger.format(format).warn(...payload);
      }
    });

    worker.once("error", (error) => {
      this.logger.format(format).error(error);
    });

    worker.once("online", () => {
      this.tasks = this.tasks.map((task) => {
        if ( task.format === format ) {
          task.state = "pending";
        }

        return task;
      });
    });

    worker.once("exit", (code) => {
      this.tasks = this.tasks.map((task) => {
        if ( task.format === format ) {
          task.state = code === 0 ? "done" : "error";
        }

        return task;
      });
    });
  };

  private createTasks = async () => {
    const isExist = this.tasks.some((task) => {
      return task.format === "dts";
    });

    if ( this.config.declaration ) {
      if ( !isExist ) {
        this.createTask("dts");
      }
    } else if ( isExist ) {
      const task = this.tasks.find((task) => {
        return task.format === "dts";
      });

      if ( task ) {
        await task.worker.terminate();
        this.tasks = this.tasks.filter((task) => {
          return task.format !== "dts";
        });
      }
    }

    if ( this.config.declarationOnly ) {
      const tasks = this.tasks.filter((task) => {
        return task.format !== "dts";
      });

      for ( const task of tasks ) {
        await task.worker.terminate();
      }

      this.tasks = this.tasks.filter((task) => {
        return task.format === "dts";
      });
    } else {
      const formats = Array.isArray(this.config.output?.format) ? this.config.output?.format : [
        this.config.output?.format,
      ];

      for ( const format of formats! ) {
        const isExist = this.tasks.some((task) => {
          return task.format === format;
        });

        if ( !isExist ) {
          await this.createTask(format!);
        }
      }

      const tasksToTerminate = this.tasks.filter((task) => {
        if ( task.format === "dts" ) {
          return false;
        }

        return !formats?.includes(task.format);
      });

      for ( const taskToTerminate of tasksToTerminate ) {
        await taskToTerminate.worker.terminate();
      }

      this.tasks = this.tasks.filter((task) => {
        return !tasksToTerminate.some((taskToTerminate) => {
          return taskToTerminate.format === task.format;
        });
      });
    }
  };

  private runTasks = () => {
    return new Promise<void>((resolve) => {
      for ( const task of this.tasks ) {
        task.worker.postMessage({
          type: "start",
          payload: {
            format: task.format,
            config: this.deserializedConfig,
            packageJson: this.packageJson,
            tsConfig: this.tsConfig,
          },
        });

        if ( this.config.watch ) {
          continue;
        }

        task.worker.once("exit", () => {
          const didFinished = this.tasks.every((task) => {
            return task.state === "done" || task.state === "error";
          });

          if ( didFinished ) {
            return resolve();
          }
        });
      }
    });
  };

  //

  //

  private watcher: FSWatcher | undefined;

  private get defaultConfig(): Config {
    const root = rootFinder(process.cwd());
    const cacheDir = cacheFinder(root);

    return {
      root,
      cacheDir,
      //
      target: "node",
      mode: null as any,
      //
      watch: false,
      watchList: {
        config: true,
        packageJson: true,
        tsConfig: true,
        dotEnv: true,
      },
      watchOptions: undefined,
      //
      define: {},
      defineEnv: {},
      defineDotEnv: false,
      defineRuntime: {
        mode: true,
        target: false,
        version: false,
      },
      //
      entry: "source/index.ts",
      output: {
        dir: "dist",
        //
        format: null as any,
        primary: null as any,
      },
      //
      declaration: false,
      declarationOnly: false,
      //
      banner: undefined,
      treeshake: "recommended",
      sourcemap: null as any,
      minify: null as any,
      //
      clean: false,
      copy: false,
      //
      external: [],
      noExternal: [],
      externalDeps: null as any,
      externalPeerDeps: null as any,
      externalDevDeps: false,
      //
      logger: undefined,
      logTime: false,
      logSymbol: "❁",
      logName: "Rosepack",
      logLevel: {
        info: true,
        warn: true,
        error: true,
        debug: false,
      },
      ignoredWarnings: [],
      //
      onBuildEnd: undefined,
      onBuildStart: undefined,
      //
      rollup: undefined,
      swc: undefined,
      dts: undefined,
    };
  }

  init = async (main: boolean) => {
    this.config = deepMerge(this.defaultConfig, this.priorityConfig);

    this.logger = new RosepackLogger(this.config);

    const watcherList: string[] = [];

    try {
      const userConfig = await loadConfig(this.config);
      this.config = deepMerge(this.defaultConfig, userConfig, this.priorityConfig);
      this.logger.init(this.config);
    } catch ( error ) {
      if ( main ) {
        throw error;
      }

      this.logger.error(error);
    } finally {
      if ( this.config.watchList?.config ) {
        watcherList.push(path.resolve(this.config.root!, rosepackConfigFile));
      }
    }

    try {
      this.packageJson = loadPackageJson(this.config.root!);
    } catch ( error ) {
      if ( main ) {
        throw error;
      }

      this.logger.error(error);
    } finally {
      if ( this.config.watchList?.packageJson ) {
        watcherList.push(path.resolve(this.config.root!, packageJsonFile));
      }
    }

    try {
      this.tsConfig = loadTsConfig(this.config.root!);
    } catch ( error ) {
      if ( main ) {
        throw error;
      }

      this.logger.error(error);
    } finally {
      if ( this.config.watchList?.tsConfig ) {
        watcherList.push(path.resolve(this.config.root!, tsConfigFile));
      }
    }

    //

    if ( this.config.mode === null ) {
      if ( Reflect.has(process.env, "NODE_ENV") ) {
        this.config.mode = Reflect.get(process.env, "NODE_ENV") === "development" ? "development" : "production";
      } else {
        this.config.mode = this.config.watch ? "development" : "production";
      }
    }

    if ( this.config.target === "node" ) {
      this.config.external?.push(...builtinModules);

      if ( this.config.externalDeps === null ) {
        this.config.externalDeps = true;
      }

      if ( this.config.externalPeerDeps === null ) {
        this.config.externalPeerDeps = true;
      }
    }

    //

    const define = [];
    const defineEnv = [];

    this.config.define = this.config.define ?? {};
    this.config.defineEnv = this.config.defineEnv ?? {};

    if ( this.config.defineDotEnv ) {
      let dotEnvPaths = [
        ".env",
        ".env.local",
      ];

      if ( this.config.mode === "development" ) {
        dotEnvPaths.push(".env.dev", ".env.dev.local");
        dotEnvPaths.push(".env.development", ".env.development.local");
      } else {
        dotEnvPaths.push(".env.prod", ".env.prod.local");
        dotEnvPaths.push(".env.production", ".env.production.local");
      }

      if ( this.config.defineDotEnv !== true ) {
        dotEnvPaths = Array.isArray(this.config.defineDotEnv) ? this.config.defineDotEnv : [this.config.defineDotEnv];
      }

      dotEnvPaths = dotEnvPaths.map((dotEnv) => {
        if ( path.isAbsolute(dotEnv) ) {
          return dotEnv;
        }

        return path.resolve(this.config.root!, dotEnv);
      });

      for ( const dotEnvPath of dotEnvPaths ) {
        if ( fs.existsSync(dotEnvPath) ) {
          try {
            const env = dotenv.config({
              path: dotEnvPath,
            });

            if ( !env.parsed ) {
              throw new Error(`Failed to load ${ this.logger.mark(dotEnvPath) }`);
            }

            Object.entries(env.parsed).forEach(([ key, value ]) => {
              Reflect.set(this.config.defineEnv!, key, value);
            });
          } catch ( error ) {
            const rosepackError = new RosepackError(ErrorCode.Config, `Failed to load ${ this.logger.mark(dotEnvPath) }`);

            if ( main ) {
              throw rosepackError;
            }

            this.logger.error(rosepackError);
          }
        }
      }

      if ( this.config.watchList?.dotEnv ) {
        watcherList.push(...dotEnvPaths);
      }
    }

    for ( const [ key, value ] of Object.entries(this.config.define) ) {
      define.push(`declare var ${ key }: ${ typeof value };`);
    }

    for ( const [ key, value ] of Object.entries(this.config.defineEnv) ) {
      defineEnv.push(`readonly ${ key }: ${ typeof value };`);
    }

    if ( this.config.defineRuntime ) {
      if ( this.config.defineRuntime?.version ) {
        if ( !this.packageJson.version ) {
          const error = new RosepackError(ErrorCode.Config, `${ this.logger.mark(packageJsonFile) } has no ${ this.logger.mark("version") } field`);

          if ( main ) {
            throw error;
          }

          this.logger.error(error);
        } else {
          Reflect.set(this.config.define, "__VERSION__", this.packageJson.version);
          define.push("declare var __VERSION__: string;");

          Reflect.set(this.config.defineEnv, "VERSION", this.packageJson.version);
          defineEnv.push("readonly VERSION: string;");
        }
      }

      if ( this.config.defineRuntime?.mode ) {
        Reflect.set(this.config.defineEnv, "MODE", this.config.mode);
        defineEnv.push("readonly MODE: \"development\" | \"production\";");

        Reflect.set(this.config.defineEnv, "NODE_ENV", this.config.mode);
        defineEnv.push("readonly NODE_ENV: \"development\" | \"production\";");

        Reflect.set(this.config.define, "__MODE__", this.config.mode);
        define.push("declare var __MODE__: \"development\" | \"production\";");

        Reflect.set(this.config.define, "__DEV__", this.config.mode === "development");
        define.push("declare var __DEV__: boolean;");

        Reflect.set(this.config.define, "__PROD__", this.config.mode === "production");
        define.push("declare var __PROD__: boolean;");
      }

      if ( this.config.defineRuntime?.target ) {
        Reflect.set(this.config.define, "__NODE__", this.config.target === "node");
        define.push("declare var __NODE__: boolean;");

        Reflect.set(this.config.define, "__BROWSER__", this.config.target === "browser");
        define.push("declare var __BROWSER__: boolean;");
      }
    }

    const envTemplate = path.resolve(__dirname, "../helper/rosepack.d.ts");
    const envFile = path.resolve(this.config.root!, rosepackEnvFile);

    let env = await fs.promises.readFile(envTemplate, "utf-8");

    env = env.replace("// {{ DEFINE }}", define.join("\n"));
    env = env.replace("// {{ DEFINE_ENV }}", defineEnv.join("\n"));

    await fs.promises.writeFile(envFile, env);

    //

    if ( this.config.output?.format === null ) {
      if ( this.packageJson.type === "module" ) {
        this.config.output.format = "esm";
      } else {
        this.config.output.format = "cjs";
      }
    }

    if ( this.config.output?.primary === null ) {
      const formats = Array.isArray(this.config.output.format) ? this.config.output.format : [
        this.config.output.format,
      ];

      this.config.output.primary = formats[0];
    }

    //

    if ( this.config.banner ) {
      if ( this.config.banner.header ) {
        let header = this.config.banner.header;

        if ( fs.existsSync(header) ) {
          this.config.banner.header = await fs.promises.readFile(header, "utf-8");
        } else {
          header = path.resolve(this.config.root!, header);

          if ( fs.existsSync(header) ) {
            this.config.banner.header = await fs.promises.readFile(header, "utf-8");
          }
        }
      }

      if ( this.config.banner.footer ) {
        let footer = this.config.banner.footer;

        if ( fs.existsSync(footer) ) {
          this.config.banner.footer = await fs.promises.readFile(footer, "utf-8");
        } else {
          footer = path.resolve(this.config.root!, footer);

          if ( fs.existsSync(footer) ) {
            this.config.banner.footer = await fs.promises.readFile(footer, "utf-8");
          }
        }
      }
    }

    if ( this.config.sourcemap === null ) {
      this.config.sourcemap = this.config.mode === "development";
    }

    if ( this.config.minify === null ) {
      this.config.minify = this.config.mode === "production";
    }

    //

    if ( this.config.externalDeps ) {
      this.config.external?.push(...Object.keys(this.packageJson.dependencies ?? {}));
    }

    if ( this.config.externalDevDeps ) {
      this.config.external?.push(...Object.keys(this.packageJson.devDependencies ?? {}));
    }

    if ( this.config.externalPeerDeps ) {
      this.config.external?.push(...Object.keys(this.packageJson.peerDependencies ?? {}));
    }

    //

    if ( !this.config.watch ) {
      return;
    }

    if ( this.watcher ) {
      await this.watcher.close();
      this.watcher = undefined;
    }

    this.watcher = watch(watcherList, {
      ignoreInitial: true,
    });

    this.watcher.on("change", (file) => {
      this.logger.info(`${ this.logger.mark(path.relative(this.config.root!, file)) } changed`);

      return this.start(false);
    });

    this.watcher.on("unlink", (file) => {
      this.logger.info(`${ this.logger.mark(path.relative(this.config.root!, file)) } removed`);

      return this.start(false);
    });

    this.watcher.on("add", (file) => {
      this.logger.info(`${ this.logger.mark(path.relative(this.config.root!, file)) } added`);

      return this.start(false);
    });

    this.watcher.on("error", (error) => {
      this.logger.error(RosepackError.from(ErrorCode.Config, error));
    });
  };

  start = async (main = true) => {
    if ( !main ) {
      this.logger.info("restarting ...");
    }

    await this.init(main);

    if ( main ) {
      this.logger.debug("config ", util.inspect(this.config, {
        depth: null,
        colors: true,
      }));
      this.logger.debug("packageJson ", util.inspect(this.packageJson, {
        depth: null,
        colors: true,
      }));
      this.logger.debug("tsConfig ", util.inspect(this.tsConfig), "\n");
    }

    await this.createTasks();

    if ( main ) {
      this.logger.info(`version ${ this.logger.mark(`v${ process.env.VERSION }`) }`);
      this.logger.info(`mode ${ this.logger.mark(this.config.mode) }`);
      this.logger.info(`target ${ this.logger.mark(this.config.target) }`);
      this.logger.info(`formats ${ this.tasks.map((task) => {
        return this.logger.mark(task.format);
      }).join(" ") }`);
      this.logger.info(`watching ${ this.logger.mark(this.config.watch) }`, "\n");
    }

    await this.clean(main);
    await this.copy(main);

    await this.runTasks();

    if ( this.config.watch ) {
      return this.logger.info("watching ...");
    }

    this.logger.line();

    if ( !this.tasks.every((task) => {
      return task.state === "done";
    }) ) {
      throw new RosepackError(ErrorCode.Tasks, "Failed!");
    }
  };
}

const defineRosepack = (config: Config | ((config: Config) => Config)) => {
  return config;
};

export type {
  Config,
};

export {
  defineRosepack,
};

export default Rosetask;