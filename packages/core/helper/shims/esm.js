import url from "node:url";
import path from "node:path";
import module from "node:module";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const require = module.createRequire(import.meta.url);

export {
  __filename,
  __dirname,
  require,
};