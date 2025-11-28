#!/usr/bin/env node
import { Command } from "commander";
import packageJson from "./package.json";

import { createCommand } from "rcade";

const program = createCommand;

program
  .name("create-rcade")
  .description("A CLI tool to generate new rcade projects")
  .version(packageJson.version);

program.parse();
