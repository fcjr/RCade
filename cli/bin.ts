#!/usr/bin/env node
import { Command } from "commander";
import packageJson from "./package.json";

import { createCommand } from "./src";

const program = new Command();

program
  .name("rcade")
  .description("A CLI tool to generate and manage rcade projects")
  .version(packageJson.version);

program.addCommand(createCommand);

program.parse();
