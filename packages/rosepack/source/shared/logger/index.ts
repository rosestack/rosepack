import chalk from "chalk";

import {Format} from "~shared/config";

type Level = "info" | "warn" | "error" | "silent";

interface LoggerConfig {
  level?: Level;
}

const colors = {
  rosepack: (...messages: any[]) => {
    return chalk.hex("#555657")(messages.map((value) => String(value)).join(" "));
  },
  //
  info: (...messages: any[]) => {
    return chalk.hex("#21be22")(messages.map((value) => String(value)).join(" "));
  },
  warn: (...messages: any[]) => {
    return chalk.hex("#c1c41f")(messages.map((value) => String(value)).join(" "));
  },
  debug: (...messages: any[]) => {
    return chalk.hex("#6532f3")(messages.map((value) => String(value)).join(" "));
  },
  error: (...messages: any[]) => {
    return chalk.hex("#df1c00")(messages.map((value) => String(value)).join(" "));
  },
  //
  dts: (...messages: any[]) => {
    return chalk.hex("#3a72ba")(messages.map((value) => String(value)).join(" "));
  },
  amd: (...messages: any[]) => {
    return chalk.hex("#FFA07A")(messages.map((value) => String(value)).join(" "));
  },
  cjs: (...messages: any[]) => {
    return chalk.hex("#ea8a39")(messages.map((value) => String(value)).join(" "));
  },
  esm: (...messages: any[]) => {
    return chalk.hex("#fce43e")(messages.map((value) => String(value)).join(" "));
  },
  iife: (...messages: any[]) => {
    return chalk.hex("#FFDAB9")(messages.map((value) => String(value)).join(" "));
  },
  umd: (...messages: any[]) => {
    return chalk.hex("#D8BFD8")(messages.map((value) => String(value)).join(" "));
  },
  sys: (...messages: any[]) => {
    return chalk.hex("#87CEFA")(messages.map((value) => String(value)).join(" "));
  }
};

class Logger {
  config?: LoggerConfig;
  format?: Format;

  private canLog = (level: Level) => {
    const levels = ["info", "warn", "error", "silent"];
    return levels.indexOf(level) >= levels.indexOf(this.config?.level ?? "info");
  };

  private prefix() {
    if (this.format) {
      if (Reflect.has(colors, this.format)) {
        return `✿ ${colors[this.format](this.format)}`;
      }

      return `✿ ${colors.rosepack(this.format)}`;
    }

    return `✿ ${colors.rosepack("Rosepack")}`;
  }

  constructor(config?: LoggerConfig, format?: Format) {
    this.config = config;
    this.format = format;
  }

  debug = (...messages: any[]) => {
    if (!process.env.DEBUG) {
      return;
    }

    return console.debug(this.prefix(), `[${colors.debug("debug")}] :`, colors.debug(...messages));
  };

  info = (...messages: any[]) => {
    if (!this.canLog("info")) {
      return;
    }

    return console.info(this.prefix(), `[${colors.info("info")}] :`, ...messages);
  };

  warn = (...messages: any[]) => {
    if (!this.canLog("warn")) {
      return;
    }

    return console.warn(this.prefix(), `[${colors.warn("warn")}] :`, ...messages);
  };

  error = (error: unknown) => {
    if (!this.canLog("error")) {
      return;
    }

    return console.error(this.prefix(), `[${colors.error("error")}] :`, error);
  };

  //

  mark(...messages: any) {
    if (this.format && Reflect.has(colors, this.format)) {
      return colors[this.format](...messages);
    }

    return colors.rosepack(...messages);
  }

  line() {
    return console.log();
  }

  timer() {
    const start = Date.now();

    return {
      end: () => {
        return Date.now() - start;
      }
    };
  }
}

export type {
  LoggerConfig
};

export {
  colors
};

export default Logger;