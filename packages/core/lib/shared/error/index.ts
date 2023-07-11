import { colors } from "~shared/logger";

enum ErrorCode {
  Unknown = "Unknown",
  Cli = "Cli",
  //
  Config = "Config",
  PackageJson = "PackageJson",
  TsConfig = "TsConfig",
  //
  Clean = "Clean",
  Copy = "Copy",
  //
  Tasks = "Tasks",
}

class RosepackError extends Error {
  constructor( public code: ErrorCode, message: string ) {
    super( message );
  }

  formatted( stack?: boolean ) {
    if ( stack ) {
      this.stack = this.stack.replace( "Error:", "" );
    }

    return `[${ colors.error( this.code ) }] ${ stack ? this.stack : this.message }`;
  }

  static from = ( code: ErrorCode, error: any ) => {
    if ( error instanceof RosepackError ) {
      return error;
    }

    const rosepackError = new RosepackError( code, error );

    if ( error instanceof Error ) {
      rosepackError.message = error.message;
      rosepackError.stack = error.stack;
    }

    return rosepackError;
  };
}

export {
  ErrorCode,
};

export default RosepackError;