#!/usr/bin/env node

import { Command } from "commander";

import Rosepack from "~/rosepack";

import type { Config } from "~rosepack/config";
import RosepackError, { ErrorCode } from "~shared/error";

const commander = new Command();

interface Options {
  mode: string;
  target: string;
  //
  watch: boolean;
  //
  clean: boolean;
  copy: boolean;
  //
  debug: boolean;
}

commander.option( "-m, --mode <mode>", "mode" );
commander.option( "-t, --target <target>", "target" );

commander.option( "-w, --watch", "watch", false );

commander.option( "--clean", "clean", false );
commander.option( "--copy", "copy", false );

commander.option( "-d, --debug", "output extra information", false );

commander.action(( options: Options ) => {
  const config: Config = {};

  if ( options.mode ) {
    const isDev = [ "d", "dev", "development" ].includes( options.mode );
    const isProd = [ "p", "prod", "production" ].includes( options.mode );

    if ( isDev ) {
      config.mode = "development";
    } else if ( isProd ) {
      config.mode = "production";
    }
  }

  if ( options.target ) {
    const isNode = [ "n", "node" ].includes( options.target );
    const isBrowser = [ "b", "browser" ].includes( options.target );

    if ( isNode ) {
      config.target = "node";
    } else if ( isBrowser ) {
      config.target = "browser";
    }
  }

  if ( options.watch ) {
    config.watch = true;
  }

  if ( options.clean ) {
    config.clean = true;
  }

  if ( options.copy ) {
    config.copy = true;
  }

  if ( options.debug ) {
    config.logLevel = {
      debug: true,
    };
  }

  const rosepack = new Rosepack( config );

  return rosepack.start().then(() => {
    return rosepack.logger.info( "Done!" );
  }).catch(( error: unknown ) => {
    const rosepackError = RosepackError.from( ErrorCode.Cli, error );

    return rosepack.logger.error( rosepackError );
  });
});

commander.parse();