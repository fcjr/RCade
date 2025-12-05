#!/usr/bin/env node
import { Command } from "commander";
import packageJson from "./package.json";

import { createCommand } from "./src/create";
import { devCommand } from "./src/dev";
import { playCommand } from "./src/play";
import { cacheCommand } from "./src/cache";
import { remixCommand } from "./src/remix";

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
