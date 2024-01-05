#!/usr/bin/env node

import {Command, Option} from "commander";

import {CliConfig} from "~shared/config";

import Rosepack from "~/main";

const commander = new Command("Rosepack");

commander.option("--debug", "Enable debug mode");
commander.on("option:debug", () => {
  process.env.DEBUG = "true";
});

commander.option("-w, --watch", "Enable watch mode");

const modeOption = new Option("-m, --mode <mode>", "Mode").choices([
  "development",
  "production"
]);

const targetOption = new Option("-t, --target <target>", "Target").choices([
  "browser",
  "node"
]);

const formatOption = new Option("-f, --format <formats...>", "Format").choices([
  "dts",
  "esm",
  "cjs",
  "amd",
  "iife",
  "umd",
  "sys"
]);

const mainOption = new Option("-p, --primary <primary>", "Specify the primary format").choices([
  "esm",
  "cjs",
  "amd",
  "iife",
  "umd",
  "sys"
]);

commander.addOption(modeOption);
commander.addOption(targetOption);
commander.addOption(formatOption);
commander.addOption(mainOption);

commander.action(async (config: CliConfig) => {
  const rosepack = new Rosepack(config);

  try {
    await rosepack.run();
  } catch (error) {
    rosepack.logger.error(error);
  }
});

commander.parse();