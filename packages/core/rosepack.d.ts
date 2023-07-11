declare var __FORMAT__: string;
declare var __PRIMARY__: string;

declare var __VERSION__: string;
declare var __MODE__: "development" | "production";
declare var __DEV__: boolean;
declare var __PROD__: boolean;

declare namespace NodeJS {
  interface ProcessEnv {
    readonly VERSION: string;
readonly MODE: "development" | "production";
readonly NODE_ENV: "development" | "production";
  }
}