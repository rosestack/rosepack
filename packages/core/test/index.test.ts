import { beforeAll, describe, expect, test } from "vitest";

import { execa } from "execa";

import path from "path";
import fs from "fs";

const examples = path.join(process.cwd(), "examples");
const projects = fs.readdirSync(examples);

beforeAll(async() => {
  for ( const project of projects ) {
    const projectPath = path.join(examples, project);

    console.log(`Installing ${ path.relative(process.cwd(), projectPath) } dependencies...`);
    await execa("npm", ["i"], {
      cwd: projectPath,
    });
  }
});

const runs = projects.map((project) => {
  return {
    name: project,
    path: path.join(examples, project),
  };
});

describe("Rosepack", () => {
  const cli = path.join(process.cwd(), "dist", "bin.esm.js");

  for ( const run of runs ) {
    console.log(`Testing ${ run.name }...`);

    test(run.name, async() => {
      const result = await execa("node", [cli], {
        cwd: run.path,
        stdout: "inherit",
        stderr: "inherit",
      });

      expect(result.exitCode).toBe(0);
    }, 5000);
  }
});