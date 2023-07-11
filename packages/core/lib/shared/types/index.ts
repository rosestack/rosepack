import type ts from "typescript";

type PackageJson = {
  name: string;
  version: string;
  type: "commonjs" | "module";
  dependencies?: {
    [ key: string ]: string;
  };
  devDependencies?: {
    [ key: string ]: string;
  };
  peerDependencies?: {
    [ key: string ]: string;
  };
};

type TsConfig = {
  compilerOptions: ts.CompilerOptions;
  include: string[];
  exclude: string[];
};

export type {
  PackageJson,
  TsConfig,
};