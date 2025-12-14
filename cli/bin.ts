#!/usr/bin/env node
import { Command } from "commander";
import packageJson from "./package.json" with { type: "json" };

import { createCommand } from "./src/create.js";
import { devCommand } from "./src/dev.js";
import { playCommand } from "./src/play.js";
import { cacheCommand } from "./src/cache.js";
import { remixCommand } from "./src/remix.js";

const program = new Command();

program
  .name("rcade")
  .description("A CLI tool to generate and manage rcade projects")
  .version(packageJson.version);

program.addCommand(createCommand);
program.addCommand(devCommand);
program.addCommand(playCommand);
program.addCommand(cacheCommand);
program.addCommand(remixCommand);

program.parse();
