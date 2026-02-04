import { YAML } from "bun";
import mustache from "mustache";
import fs from "node:fs";
import yaml from "js-yaml";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const DEPLOY = `name: Deploy to RCade

on:
  push:
    branches:
      - main
      - master

jobs:
  build-and-deploy:
    name: Build and Deploy to RCade
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      {{step}}
      - name: Deploy to RCade
        uses: fcjr/rcade/action-deploy@main
`;

export async function write_workflow(to_dir: string, data: any[]) {
    await mkdir(path.join(to_dir, ".github/workflows"), { recursive: true });
    const result = yaml.dump(data, { quotingType: "\"" }).slice(0, -1).split("\n").join("\n      ");
    const render = mustache.render(DEPLOY, { step: result }, undefined, { escape: (v) => v });
    fs.writeFileSync(path.join(to_dir, ".github/workflows/deploy.yaml"), render);
}


