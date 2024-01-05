import glob from "fast-glob";
import {FSWatcher, watch} from "chokidar";
import {rimraf} from "rimraf";

import {find, merge, createFilter, normalize, Filter} from "rosetil";

import {loadPackage, PackageJson, loadTsConfig, TsConfig, loadConfig, loadDotenv} from "roserc";

import Task from "~main/task";

import Logger from "~shared/logger";

import {Config} from "~shared/config";

import util from "util";
import path from "path";
import fs from "fs";

class Rosepack {
  private config: Config;
  private userConfig?: Config;
  private defaultConfig: Config = {
    cwd: process.cwd(),
    target: "node",
    mode: null as any,
    format: null as any,
    primary: true,
    parallel: true,
    //
    watch: null as any,
    watchList: {
      config: true,
      packageJson: true,
      tsConfig: true,
      dotEnv: true
    },
    watchOptions: {
      ignored: [
        "**/node_modules/**"
      ]
    },
    //
    input: null as any,
    output: {
      dir: null as any,
      name: null as any,
      //
      treeshake: "recommended",
      sourcemap: null as any,
      minify: null as any,
      //
      external: [],
      externalDeps: null as any,
      externalDevDeps: null as any,
      externalPeerDeps: null as any,
      //
      esm: {
        shims: true
      }
    },
    //
    define: {},
    defineEnv: {},
    defineRuntime: {
      mode: true
    },
    loadDotEnv: true,
    createEnv: false,
    //
    clean: null as any,
    copy: false,
    //
    logger: {
      level: "info"
    }
  };

  logger: Logger;

  tasks: Task[];

  private watcher?: FSWatcher;
  private watcherList: string[];

  private packageJson: PackageJson;
  private tsConfig?: TsConfig;

  constructor(public cliConfig: Config) {
    this.resolveConfig();
  }

  private createLogger = () => {
    this.logger = new Logger(this.config.logger);
  };

  private resolveConfig = () => {
    this.config = merge(this.defaultConfig, this.userConfig ?? {}, this.cliConfig);

    if (this.packageJson) {
      if (this.config.input === null) {
        const possibleInput = [
          "src/(main|index).(js|mjs|cjs|ts)",
          "source/(main|index).(js|mjs|cjs|ts)",
          "(main|index).(js|mjs|cjs|ts)"
        ];

        let input = "source/main.ts";

        for (const pattern of possibleInput) {
          const matches = glob.sync(pattern, {
            cwd: this.config.cwd
          });

          if (matches.length > 0) {
            input = matches[0]!;
            break;
          }
        }

        this.config.input = input;
      }

      if (this.config.output?.dir === null) {
        if (this.tsConfig?.compilerOptions?.outDir) {
          this.config.output.dir = path.relative(this.config.cwd!, this.tsConfig.compilerOptions.outDir);
        } else {
          if (this.packageJson.main) {
            this.config.output.dir = path.dirname(this.packageJson.main);
          } else {
            this.config.output.dir = "dist";
          }
        }
      }

      //

      if (this.config.mode === null) {
        if (Reflect.has(process.env, "NODE_ENV")) {
          this.config.mode = Reflect.get(process.env, "NODE_ENV") === "development" ? "development" : "production";
        } else {
          this.config.mode = this.config.watch ? "development" : "production";
        }
      }

      if (this.config.format === null) {
        if (this.packageJson.type === "module") {
          this.config.format = ["esm"];
        } else {
          this.config.format = ["cjs"];
        }

        if (this.packageJson.types) {
          this.config.format.push("dts");
        }
      }

      if (this.config.primary && typeof this.config.primary !== "string") {
        const formats = (Array.isArray(this.config.format) ? this.config.format : [
          this.config.format
        ]).filter((format) => {
          return format !== "dts";
        });

        if (formats.includes("esm") && this.packageJson.type === "module") {
          this.config.primary = "esm";
        } else if (formats.includes("cjs") && this.packageJson.type !== "module") {
          this.config.primary = "cjs";
        } else {
          this.config.primary = formats.at(0) as any;
        }
      }

      //

      if (this.config.output?.name === null) {
        this.config.output.name = this.packageJson.name;
      }

      //

      if (this.config.output?.sourcemap === null) {
        this.config.output.sourcemap = this.config.mode === "development";
      }

      if (this.config.output?.minify === null) {
        this.config.output.minify = this.config.mode === "production";
      }

      //

      if (this.config.output?.externalDeps === null) {
        this.config.output.externalDeps = this.config.target === "node";
      }

      if (this.config.output?.externalPeerDeps === null) {
        this.config.output.externalPeerDeps = this.config.target === "node";
      }

      if (this.config.output?.externalDevDeps === null) {
        this.config.output.externalDevDeps = this.config.target === "node";
      }

      if (this.config.output?.externalDeps) {
        this.config.output.externalDeps = Object.keys(this.packageJson.dependencies ?? {});
      }

      if (this.config.output?.externalDevDeps) {
        this.config.output.externalDevDeps = Object.keys(this.packageJson.devDependencies ?? {});
      }

      if (this.config.output?.externalPeerDeps) {
        this.config.output.externalPeerDeps = Object.keys(this.packageJson.peerDependencies ?? {});
      }

      //

      if (this.config.clean === null) {
        this.config.clean = this.config.mode === "production";
      }
    }

    this.createLogger();
  };

  private loadFiles = async (main: boolean) => {
    try {
      try {
        this.packageJson = await loadPackage(this.config.cwd!);
      } catch (error) {
        throw new Error(`Failed to load ${this.logger.mark("package.json")}, cause: ${error}`);
      }

      const tsConfigFile = await find({
        cwd: this.config.cwd,
        name: "tsconfig.json",
        traversal: "none"
      });

      if (tsConfigFile) {
        try {
          this.tsConfig = await loadTsConfig(this.config.cwd!);
        } catch (error) {
          throw new Error(`Failed to load ${this.logger.mark("tsconfig.json")}, cause: ${error}`);
        }
      }

      const userConfigFile = await find({
        cwd: this.config.cwd,
        name: "rosepack",
        extension: "ts",
        traversal: "none"
      });

      if (userConfigFile) {
        this.userConfig = await loadConfig<Config>(userConfigFile, {
          external: "rosepack"
        });

        if (typeof this.userConfig === "function") {
          this.userConfig = (this.userConfig as Function)(this.config);
        }
      }

      this.resolveConfig();
    } catch (error) {
      if (main) {
        throw error;
      }

      this.logger.error(error);
    }

    if (this.config.watchList?.packageJson) {
      this.watcherList.push(path.resolve(this.config.cwd!, "package.json"));
    }

    if (this.config.watchList?.tsConfig) {
      this.watcherList.push(path.resolve(this.config.cwd!, "tsconfig.json"));
    }

    if (this.config.watchList?.config) {
      this.watcherList.push(path.resolve(this.config.cwd!, "rosepack.ts"));
    }

    if (this.config.watchList?.packages !== undefined) {
      const packages = Array.isArray(this.config.watchList.packages) ? this.config.watchList.packages : [
        this.config.watchList.packages
      ];

      for (const pkg of packages) {
        const name = typeof pkg === "string" ? pkg : pkg.name;

        let names = Array.isArray(name) ? name : [name];

        names = names.map((name) => {
          if (glob.isDynamicPattern(name)) {
            return name;
          }

          return name + "/**";
        });

        const include = typeof pkg === "string" ? undefined : pkg.include;
        const exclude = typeof pkg === "string" ? undefined : pkg.exclude;

        const files = await glob(names, {
          cwd: path.resolve(this.config.cwd!, "node_modules"),
          followSymbolicLinks: true,
          absolute: false,
          dot: false,
          ignore: [
            "**/node_modules/**"
          ]
        });

        const filter = createFilter({
          include,
          exclude
        });

        const filteredFiles = files.filter(filter).map((file) => {
          return fs.realpathSync(path.resolve(this.config.cwd!, "node_modules", file));
        });

        this.watcherList.push(...filteredFiles.filter((location) => {
          return !location.startsWith(this.config.cwd!);
        }));
      }
    }
  };

  private loadEnv = async (main: boolean) => {
    const define = [];
    const defineEnv = [];

    this.config.define = this.config.define ?? {};
    this.config.defineEnv = this.config.defineEnv ?? {};

    if (this.config.loadDotEnv) {
      let dotEnvPaths = [
        ".env",
        ".env.local"
      ];

      if (this.config.mode === "development") {
        dotEnvPaths.push(".env.dev", ".env.dev.local");
        dotEnvPaths.push(".env.development", ".env.development.local");
      } else {
        dotEnvPaths.push(".env.prod", ".env.prod.local");
        dotEnvPaths.push(".env.production", ".env.production.local");
      }

      if (this.config.loadDotEnv !== true) {
        dotEnvPaths = Array.isArray(this.config.loadDotEnv) ? this.config.loadDotEnv : [this.config.loadDotEnv];
      }

      dotEnvPaths = dotEnvPaths.map((dotEnv) => {
        if (path.isAbsolute(dotEnv)) {
          return dotEnv;
        }

        return path.resolve(this.config.cwd!, dotEnv);
      });

      for (const dotEnvPath of dotEnvPaths) {
        if (fs.existsSync(dotEnvPath)) {
          try {
            const env = await loadDotenv(dotEnvPath);

            Object.entries(env).forEach(([key, value]) => {
              Reflect.set(this.config.defineEnv!, key, value);
            });
          } catch (error) {
            const rosepackError = new Error(`Failed to load ${this.logger.mark(dotEnvPath)}`);

            if (main) {
              throw rosepackError;
            }

            this.logger.error(rosepackError);
          }
        }
      }

      if (this.config.watchList?.dotEnv) {
        this.watcherList.push(...dotEnvPaths);
      }
    }

    for (const [key, value] of Object.entries(this.config.define)) {
      define.push(`declare var ${key}: ${typeof value};`);
    }

    for (const [key, value] of Object.entries(this.config.defineEnv)) {
      defineEnv.push(`readonly ${key}: ${typeof value};`);
    }

    if (this.config.defineRuntime) {
      if (this.config.defineRuntime?.mode) {
        Reflect.set(this.config.defineEnv, "NODE_ENV", this.config.mode);
        defineEnv.push("readonly NODE_ENV: \"development\" | \"production\";");

        Reflect.set(this.config.define, "__MODE__", this.config.mode);
        define.push("declare var __MODE__: \"development\" | \"production\";");

        Reflect.set(this.config.define, "__DEV__", this.config.mode === "development");
        define.push("declare var __DEV__: boolean;");

        Reflect.set(this.config.define, "__PROD__", this.config.mode === "production");
        define.push("declare var __PROD__: boolean;");
      }

      if (this.config.defineRuntime?.target) {
        Reflect.set(this.config.define, "__NODE__", this.config.target === "node");
        define.push("declare var __NODE__: boolean;");

        Reflect.set(this.config.define, "__BROWSER__", this.config.target === "browser");
        define.push("declare var __BROWSER__: boolean;");
      }

      if (this.config.defineRuntime?.version) {
        if (!this.packageJson.version) {
          const error = new Error(`${this.logger.mark("package.json")} has no ${this.logger.mark("version")} field`);

          if (main) {
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
    }

    if (this.config.createEnv) {
      const envTemplate = require.resolve("rosepack/helper/types.d.ts");
      const envFile = path.resolve(this.config.cwd!, "types.d.ts");

      let env = await fs.promises.readFile(envTemplate, "utf-8");

      env = env.replace("// {{ DEFINE }}", define.join("\n"));
      env = env.replace("// {{ DEFINE_ENV }}", defineEnv.join("\n      "));

      await fs.promises.writeFile(envFile, env, {
        encoding: "utf-8",
        flag: "w"
      });
    }
  };

  private init = async (main: boolean) => {
    this.watcherList = [];

    await this.loadFiles(main);
    await this.loadEnv(main);

    if (!this.config.watch) {
      return;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }

    this.watcher = watch(this.watcherList, {
      interval: 250,
      awaitWriteFinish: true,
      ignorePermissionErrors: true,
      ignoreInitial: true,
      followSymlinks: true
    });

    this.watcher.on("change", (file) => {
      if (file.startsWith(this.config.cwd!)) {
        this.logger.info(`${this.logger.mark(path.relative(this.config.cwd!, file))} changed`);
      } else {
        this.logger.info(`${this.logger.mark(file)} changed`);
      }

      return this.run(false);
    });

    this.watcher.on("unlink", (file) => {
      if (file.startsWith(this.config.cwd!)) {
        this.logger.info(`${this.logger.mark(path.relative(this.config.cwd!, file))} removed`);
      } else {
        this.logger.info(`${this.logger.mark(file)} removed`);
      }

      return this.run(false);
    });

    this.watcher.on("add", (file) => {
      if (file.startsWith(this.config.cwd!)) {
        this.logger.info(`${this.logger.mark(path.relative(this.config.cwd!, file))} added`);
      } else {
        this.logger.info(`${this.logger.mark(file)} added`);
      }

      return this.run(false);
    });

    this.watcher.on("error", (error) => {
      this.logger.error(error);
    });
  };

  //

  private resolveClean = (target?: string, include?: any, exclude?: any) => {
    target = target ?? this.config.output?.dir;

    if (!target) {
      throw new Error(`Invalid ${this.logger.mark("clean")} config`);
    }

    let filter: Filter | undefined;

    if (include || exclude) {
      filter = createFilter({
        include,
        exclude
      });
    }

    return {
      target: normalize(target),
      filter
    };
  };

  private clean = (main: boolean) => {
    if (!this.config.clean) {
      return;
    }

    let cleans: { target: string; filter?: Filter }[] = [];

    if (typeof this.config.clean === "boolean") {
      cleans = [
        this.resolveClean(this.config.output?.dir)
      ];
    } else if (typeof this.config.clean === "string") {
      cleans = [
        this.resolveClean(this.config.clean)
      ];
    } else if (Array.isArray(this.config.clean)) {
      cleans = this.config.clean.map((item) => {
        if (typeof item === "string") {
          return this.resolveClean(item);
        }

        return this.resolveClean(item.target, item.include, item.exclude);
      });
    } else if (typeof this.config.clean === "object") {
      cleans = [
        this.resolveClean(this.config.clean.target, this.config.clean.include, this.config.clean.exclude)
      ];
    } else {
      const error = new Error(`Invalid ${this.logger.mark("clean")} config`);

      if (main) {
        throw error;
      }

      return this.logger.error(error);
    }

    const promises = cleans.map(async (clean) => {
      this.logger.debug("[clean]", "Deleting", this.logger.mark(path.relative(this.config.cwd!, clean.target)));

      await rimraf(clean.target, {
        glob: {
          dot: true,
          follow: false
        },
        filter: (path) => {
          if (clean.filter) {
            return clean.filter(path);
          }

          return true;
        }
      });

      this.logger.debug("[clean]", "Deleted", this.logger.mark(path.relative(this.config.cwd!, clean.target)));
    });

    return Promise.all(promises).catch((error) => {
      const rosepackError = new Error(error);

      if (main) {
        throw rosepackError;
      }

      return this.logger.error(rosepackError);
    });
  };

  //

  private resolveCopy = (from?: string, to?: string, include?: any, exclude?: any) => {
    let absoluteFrom = from ?? "public";
    let absoluteTo = to ?? path.join(this.config.cwd!, this.config.output?.dir!);

    if (!path.isAbsolute(absoluteFrom)) {
      absoluteFrom = path.resolve(this.config.cwd!, absoluteFrom);
    }

    if (!path.isAbsolute(absoluteTo)) {
      absoluteTo = path.resolve(this.config.cwd!, absoluteTo);
    }

    const filter = createFilter({
      include,
      exclude
    });

    return {
      from: normalize(absoluteFrom),
      to: normalize(absoluteTo),
      filter
    };
  };

  private copy = (main: boolean) => {
    if (!this.config.copy) {
      return;
    }

    let copies: { from: string; to: string; filter: Filter }[] = [];

    if (typeof this.config.copy === "boolean") {
      copies = [
        this.resolveCopy()
      ];
    } else if (typeof this.config.copy === "string") {
      copies = [
        this.resolveCopy(this.config.copy)
      ];
    } else if (Array.isArray(this.config.copy)) {
      copies = this.config.copy.map((item) => {
        if (typeof item === "string") {
          return this.resolveCopy(item);
        }

        return this.resolveCopy(item.from, item.to, item.include, item.exclude);
      });
    } else if (typeof this.config.copy === "object") {
      copies = [
        this.resolveCopy(this.config.copy.from, this.config.copy.to, this.config.copy.include, this.config.copy.exclude)
      ];
    } else {
      const error = new Error(`Invalid ${this.logger.mark("copy")} config`);

      if (main) {
        throw error;
      }

      return this.logger.error(error);
    }

    const promises = copies.map(async (copy) => {
      const {from, to, filter} = copy;

      this.logger.debug("[copy]", "Copying", this.logger.mark(path.relative(this.config.cwd!, from)), "to", this.logger.mark(path.relative(this.config.cwd!, to)));

      if (glob.isDynamicPattern(from)) {
        let files = await glob(from, {
          absolute: true,
          followSymbolicLinks: false,
          onlyFiles: true,
          dot: true
        });

        if (filter) {
          files = files.filter(filter);
        }

        for (const file of files) {
          const parentDir = path.dirname(file);
          const relativePath = path.relative(parentDir, file);
          const absolutePath = path.join(to, relativePath);

          await fs.promises.mkdir(path.dirname(absolutePath), {
            recursive: true
          });
          await fs.promises.copyFile(file, absolutePath);

          this.logger.debug("[copy]", "Copied", this.logger.mark(relativePath), "to", this.logger.mark(path.relative(this.config.cwd!, absolutePath)));
        }

        return;
      }

      if (!fs.existsSync(from)) {
        return;
      }

      let files = await glob(normalize(path.join(from, "**/*")), {
        absolute: true,
        followSymbolicLinks: false,
        onlyFiles: true,
        dot: true
      });

      if (filter) {
        files = files.filter(filter);
      }

      for (const file of files) {
        const relativePath = path.relative(from, file);
        const absolutePath = path.join(to, relativePath);

        await fs.promises.mkdir(path.dirname(absolutePath), {
          recursive: true
        });

        await fs.promises.copyFile(file, absolutePath);

        this.logger.debug("[copy]", "Copied", this.logger.mark(relativePath), "to", this.logger.mark(path.relative(this.config.cwd!, absolutePath)));
      }
    });

    return Promise.all(promises).catch((error) => {
      const rosepackError = new Error(error);

      if (main) {
        throw rosepackError;
      }

      return this.logger.error(rosepackError);
    });
  };

  //

  private runTasks = async () => {
    if (this.tasks) {
      const promises = this.tasks.map((task) => {
        return task.stop();
      });

      await Promise.allSettled(promises);
    }

    const formats = Array.isArray(this.config.format!) ? this.config.format! : [
      this.config.format!
    ];

    this.tasks = formats.map((format) => {
      return new Task({
        packageJson: this.packageJson,
        tsConfig: this.tsConfig,
        //
        cwd: this.config.cwd!,
        mode: this.config.mode!,
        target: this.config.target!,
        format,
        primary: format === this.config.primary,
        //
        watch: this.config.watch!,
        watchOptions: this.config.watchOptions!,
        //
        input: this.config.input!,
        output: this.config.output!,
        define: this.config.define!,
        defineEnv: this.config.defineEnv!,
        defineRuntime: this.config.defineRuntime!,
        //
        logger: this.config.logger!
      });
    });

    if (this.config.parallel) {
      return Promise.all(this.tasks.map((task) => {
        return task.run();
      }));
    }

    for (const task of this.tasks) {
      await task.run();
    }
  };

  //

  run = async (main = true) => {
    const timer = this.logger.timer();

    await this.init(main);

    this.logger.debug("[config]", util.inspect(this.config, {
      depth: Infinity,
      colors: true
    }));

    this.logger.debug("[packageJson]", util.inspect(this.packageJson, {
      depth: Infinity,
      colors: true
    }));

    if (this.tsConfig) {
      this.logger.debug("[tsConfig]", util.inspect(this.tsConfig.compilerOptions, {
        depth: Infinity,
        colors: true
      }));
    }

    if (main) {
      this.logger.info(`Mode ${this.logger.mark(this.config.mode)}`);
      this.logger.info(`Target ${this.logger.mark(this.config.target)}`);
      this.logger.info(`Format ${this.logger.mark(this.config.format)}`);

      if (this.config.primary) {
        this.logger.info(`Primary ${this.logger.mark(this.config.primary)}`);
      }

      if (this.config.watch) {
        this.logger.info(`Watch ${this.logger.mark(this.config.watch)}`);
      }

      this.logger.line();
    }

    await this.clean(main);
    await this.copy(main);

    if (this.config.beforeBuild) {
      await this.config.beforeBuild();
    }

    await this.runTasks();

    if (this.config.afterBuild) {
      await this.config.afterBuild();
    }

    if (this.config.watch) {
      return;
    }

    this.logger.line();

    this.logger.info(`Finished in ${this.logger.mark(`${timer.end()}ms`)}`);
  };
}

const defineRosepack = (config: Config | ((config: Config) => Config)) => {
  return config;
};

export type {
  Config
};

export {
  defineRosepack
};

export default Rosepack;