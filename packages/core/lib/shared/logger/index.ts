import chalk from "chalk";

import type { Config, Format, Logger, LogLevel } from "~rosepack/config";

import RosepackError, { ErrorCode } from "~shared/error";

import util from "util";

const colors = {
  time: chalk.hex("#555657"),
  symbol: chalk.hex("#ffffff"),
  prefix: chalk.hex("#555657"),
  //
  info: (...messages: string[]) => {
    return chalk.hex("#21be22")(messages.join(" "));
  },
  warn: (...messages: string[]) => {
    return chalk.hex("#c1c41f")(messages.join(" "));
  },
  debug: (...messages: string[]) => {
    return chalk.hex("#6532f3")(messages.join(" "));
  },
  error: (...messages: string[]) => {
    return chalk.hex("#df1c00")(messages.join(" "));
  },
  //
  dts: (...messages: string[]) => {
    return chalk.hex("#3a72ba")(messages.join(" "));
  },
  amd: (...messages: string[]) => {
    return chalk.hex("#FFA07A")(messages.join(" "));
  },
  cjs: (...messages: string[]) => {
    return chalk.hex("#ea8a39")(messages.join(" "));
  },
  esm: (...messages: string[]) => {
    return chalk.hex("#fce43e")(messages.join(" "));
  },
  iife: (...messages: string[]) => {
    return chalk.hex("#FFDAB9")(messages.join(" "));
  },
  umd: (...messages: string[]) => {
    return chalk.hex("#D8BFD8")(messages.join(" "));
  },
  system: (...messages: string[]) => {
    return chalk.hex("#87CEFA")(messages.join(" "));
  },
  //
  mark: (...messages: string[]) => {
    return messages.map((message) => {
      return chalk.bgGrey.white(` ${ message } `);
    }).join(" ");
  },
};

class RosepackLogger implements Logger {
  private config: Config;

  private logLevels: {
    [level in LogLevel]?: boolean;
  };

  init = (config: Config = this.config) => {
    this.config = config;

    if ( typeof config.logLevel === "object" ) {
      this.logLevels = config.logLevel;
    } else {
      this.logLevels = {
        info: false,
        debug: false,
        warn: false,
        error: false,
      };
    }
  };

  constructor(config: Config) {
    this.init(config);
  }

  get prefix() {
    let prefix = colors.prefix(this.config.logName);

    if ( this.config.logTime ) {
      const time = new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      });

      prefix = `[${ colors.time(time) }] ${ prefix }`;
    }

    if ( this.config.logSymbol ) {
      prefix = `${ colors.symbol(this.config.logSymbol) } ${ prefix }`;
    }

    return prefix;
  }

  info = (...messages: any[]) => {
    if ( !this.logLevels.info ) {
      return;
    }

    if ( this.config.logger?.info ) {
      return this.config.logger.info(...messages);
    }

    return console.info(this.prefix, `[${ colors.info("info") }] :`, ...messages);
  };

  warn(...messages: any[]) {
    if ( !this.logLevels.warn ) {
      return;
    }

    if ( this.config.logger?.warn ) {
      return this.config.logger.warn(...messages);
    }

    return console.warn(this.prefix, `[${ colors.warn("warn") }] :`, ...messages);
  }

  debug = (...messages: any[]) => {
    if ( !this.logLevels.debug ) {
      return;
    }

    if ( this.config.logger?.debug ) {
      return this.config.logger.debug(...messages);
    }

    return console.debug(this.prefix, `[${ colors.debug("debug") }] :`, colors.debug(...messages));
  };

  error(error: unknown) {
    if ( !this.logLevels.error ) {
      return;
    }

    if ( this.config.logger?.error ) {
      return this.config.logger.error(error);
    }

    let message: string;

    if ( error instanceof Error ) {
      let rosepackError: RosepackError;

      if ( error instanceof RosepackError ) {
        rosepackError = error;
      } else {
        rosepackError = RosepackError.from(ErrorCode.Unknown, error);
      }

      message = rosepackError.formatted(this.logLevels.debug);
    } else if ( typeof error === "string" ) {
      message = error;
    } else {
      message = util.inspect(error, {
        colors: true,
        depth: 5,
      });
    }

    return console.error(this.prefix, `[${ colors.error("error") }] :`, message);
  }

  format = (format: Format) => {
    const logger = {
      info: (...messages: any[]) => {
        if ( !this.logLevels.info ) {
          return;
        }

        messages = messages.join(" ").split("\n");

        for ( const message of messages ) {
          console.info(this.prefix, `[${ colors[format](format) }] :`, message);
        }
      },
      warn: (...messages: any[]) => {
        if ( !this.logLevels.warn ) {
          return;
        }

        messages = colors.warn(...messages).split("\n");

        for ( const message of messages ) {
          console.warn(this.prefix, `[${ colors[format](format) }] :`, message);
        }
      },
      debug: (...messages: any[]) => {
        if ( !this.logLevels.debug ) {
          return;
        }

        messages = colors.debug(...messages).split("\n");

        for ( const message of messages ) {
          console.debug(this.prefix, `[${ colors[format](format) }] :`, message);
        }
      },
      error: (error: unknown) => {
        if ( !this.logLevels.error ) {
          return;
        }

        let message: string;

        if ( error instanceof Error ) {
          let rosepackError: RosepackError;

          if ( error instanceof RosepackError ) {
            rosepackError = error;
          } else {
            rosepackError = RosepackError.from(ErrorCode.Unknown, error);
          }

          message = rosepackError.formatted(this.logLevels.debug);
        } else if ( typeof error === "string" ) {
          message = error;
        } else {
          message = util.inspect(error, {
            colors: true,
            depth: 5,
          });
        }

        const messages = colors.error(message).split("\n");

        for ( const message of messages ) {
          console.error(this.prefix, `[${ colors[format](format) }] :`, message);
        }
      },
    };

    if ( this.config.logger?.format ) {
      return {
        ...logger,
        ...this.config.logger.format(format),
      };
    }

    return logger;
  };

  mark(...messages: any) {
    if ( this.config.logger?.mark ) {
      return this.config.logger.mark(...messages);
    }

    return colors.mark(...messages);
  }

  line() {
    return console.log();
  }

  timer() {
    const start = Date.now();

    return {
      end: () => {
        return Date.now() - start;
      },
    };
  }
}

export {
  colors,
};

export default RosepackLogger;