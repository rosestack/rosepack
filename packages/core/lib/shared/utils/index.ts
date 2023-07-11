import { packageJsonFile, rosepackCacheName } from "~shared/constants";

import path from "path";
import fs from "fs";

const normalizePath = ( location: string ) => {
  return location.split( path.win32.sep ).join( path.posix.sep );
};

//

const rootFinder = ( location: string ): string => {
  const packageJson = path.join( location, packageJsonFile );

  if ( fs.existsSync( packageJson )) {
    return normalizePath( location );
  }

  const parentDir = path.dirname( location );

  if ( parentDir === location ) {
    throw new Error( "Could not find root directory" );
  }

  return rootFinder( parentDir );
};

const cacheFinder = ( location: string ): string => {
  const nodeModules = path.join( location, "node_modules" );

  if ( fs.existsSync( nodeModules )) {
    const cacheFile = path.join( nodeModules, ".cache", rosepackCacheName );

    fs.mkdirSync( path.dirname( cacheFile ), {
      recursive: true,
    });

    return normalizePath( cacheFile );
  }

  const parentDir = path.dirname( location );

  if ( parentDir === location ) {
    throw new Error( "Could not find cache directory" );
  }

  return cacheFinder( parentDir );
};

//

const deepMerge = <T>( ...values: T[]) => {
  return Array.from( values ).reduce(( previousValue: any, currentValue ) => {
    if ( previousValue && currentValue ) {
      if ( Array.isArray( previousValue ) && Array.isArray( currentValue )) {
        return Array.from( new Set([
          ...previousValue,
          ...currentValue,
        ]));
      } else if (( typeof previousValue === "object" ) && ( typeof currentValue === "object" )) {
        Object.entries( currentValue ).forEach(([ key, value ]) => {
          const pValue = Reflect.get( previousValue, key );
          Reflect.set( previousValue, key, deepMerge( pValue, value ));
        });

        return previousValue;
      }
    }

    return currentValue;
  });
};

const deepClone = <Type>( value: Type ): Type => {
  if ( typeof value !== "object" ) {
    return value;
  }

  if ( Array.isArray( value )) {
    return [...value] as any;
  }

  return { ...value } as any;
};

export {
  normalizePath,
  //
  rootFinder,
  cacheFinder,
  //
  deepMerge,
  deepClone,
};