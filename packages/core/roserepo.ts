import type Roserepo from "roserepo";
import { defineRoserepo } from "roserepo";

import fs from "fs";

const updateName = (roserepo: Roserepo, name: string) => {
  const packageJson = roserepo.resolve("package.json");
  const packageJsonContent = fs.readFileSync(packageJson, "utf-8");
  const packageJsonObj = JSON.parse(packageJsonContent);

  packageJsonObj.name = name;

  return fs.promises.writeFile(packageJson, JSON.stringify(packageJsonObj, null, 2));
};

export default defineRoserepo({
  workspace: {
    publish: {
      beforePublish: (roserepo) => {
        return updateName(roserepo, "rosepack");
      },
      afterPublish: (roserepo) => {
        return updateName(roserepo, "rosepack-dev");
      },
    },
  },
});