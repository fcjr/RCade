import { Command } from "commander";
import { input, select, confirm } from "@inquirer/prompts";
import { fdir } from "fdir";
import mustache from "mustache";
import fs from "node:fs";
import os from "node:os";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Mustache from "mustache";
import { mkdir } from "node:fs/promises";
import { write_workflow } from "./workflow";
import { execa } from "execa";
import packageJson from "../package.json";

function expandTilde(filePath: string): string {
    if (filePath.startsWith("~/")) {
        return path.join(os.homedir(), filePath.slice(2));
    }
    if (filePath === "~") {
        return os.homedir();
    }
    return filePath;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getTemplatesDir(): string {
    // first try relative to source file (works when running from source)
    const sourceRelative = path.join(__dirname, "../templates");
    if (fs.existsSync(sourceRelative)) {
        return sourceRelative;
    }

    // if bundled, find the rcade package in node_modules
    const require = createRequire(import.meta.url);
    try {
        const rcadePackagePath = require.resolve("rcade/package.json");
        return path.join(dirname(rcadePackagePath), "templates");
    } catch {
        // fallback to source relative path
        return sourceRelative;
    }
}

export const createCommand = new Command("create")
    .description("create a new RCade project")
    .action(async () => {
        const name = await input({
            message: 'Enter game identifier (e.g. my-game):',
            required: true,
            validate: (value) => {
                if (!value) {
                    return 'Project identifier is required';
                }
                if (!/^[A-Za-z0-9\-_]+$/.test(value)) {
                    return 'Project identifier can only contain letters, numbers, hyphens, and underscores';
                }
                return true;
            }
        });

        const display_name = await input({
            message: 'Enter display name (My Game):',
            default: name,
        });

        const description = await input({
            message: 'Enter game description:',
            default: name,
        });

        const author = await input({
            message: 'Enter author name:',
            required: true,
            validate: (value) => {
                if (!value) {
                    return 'Author name is required';
                }
                return true;
            }
        });

        const visibility = await select({
            message: "Game visibility:",
            choices: [
                { value: "public", name: "Public", description: "(Everyone can play!)" },
                { value: "internal", name: "Internal", description: "(Only Recursers and people at the Hub can play.)" },
                { value: "private", name: "Private", description: "(Only you can play - good for development)" },
            ]
        });

        const versioning = await select({
            message: "Versioning:",
            choices: [
                { value: "automatic", name: "Automatic", description: "(Recommended - version is incremented every push)" },
                { value: "manual", name: "Manual", description: "(Manual - you control when versions are incremented)" },
            ]
        });

        const templateDirectory = await select({
            message: "Starting template:",
            choices: [
                { value: "p5-ts", name: "p5.js (TypeScript)" },
                { value: "p5-js", name: "p5.js (JavaScript)" },
                { value: "vanilla-ts", name: "Vanilla (TypeScript)" },
                { value: "vanilla-js", name: "Vanilla (JavaScript)" },
                { value: "vanilla-rs", name: "Vanilla (Rust)" },
                { value: "vanilla-cpp", name: "Vanilla (C/C++)" },
                { value: "vanilla-ocaml", name: "Vanilla (OCaml)" },
                { value: "pygame", name: "Pygame (Python)" },
            ]
        });

        const projectDirInput = await input({
            message: "Create project at:",
            default: `./${name}`,
        });
        const projectDir = expandTilde(projectDirInput);

        if (fs.existsSync(projectDir)) {
            const overwrite = await confirm({
                message: `Folder "${projectDir}" already exists. Overwrite?`,
                default: false,
            });
            if (!overwrite) {
                console.log("Aborted.");
                return;
            }
            fs.rmSync(projectDir, { recursive: true, force: true });
        }

        const manifest = {
            $schema: "https://rcade.dev/manifest.schema.json",
            name,
            display_name,
            description,
            visibility,
            ...(versioning === "automatic" ? {} : { version: "1.0.0" }),
            authors: [{ display_name: author }],
            dependencies: [{ name: "@rcade/input-classic", version: "1.0.0" }],
        };

        const templatePath = path.join(getTemplatesDir(), templateDirectory);
        const template = new fdir().withRelativePaths().crawl(templatePath);

        const view = {
            project_name: name,
            display_name,
            description,
            private: String(visibility !== "public"),
            rcade_version: packageJson.version,
        }

        // ensure project directory exists
        await mkdir(projectDir, { recursive: true });

        for (const file of await template.withPromise()) {
            const relativePath = file;
            const source = fs.readFileSync(path.join(templatePath, relativePath), "utf-8");
            const render = Mustache.render(source, view);
            // Rename '_gitignore' to '.gitignore' and '_gitkeep' to '.gitkeep'
            // (npm excludes dotfiles from packages)
            const destFile = file
                .replace(/_gitignore$/, '.gitignore')
                .replace(/_gitkeep$/, '.gitkeep');
            const destination = path.join(projectDir, destFile);
            const destination_dir = dirname(destination);

            await mkdir(destination_dir, { recursive: true });

            fs.writeFileSync(destination, render);
        }

        fs.writeFileSync(path.join(projectDir, "rcade.manifest.json"), JSON.stringify(manifest, undefined, 2));

        switch (templateDirectory) {
            case "p5-ts": await setup_js(projectDir); break;
            case "p5-js": await setup_js(projectDir); break;
            case "vanilla-ts": await setup_js(projectDir); break;
            case "vanilla-js": await setup_js(projectDir); break;
            case "vanilla-rs": await setup_rs(projectDir); break;
            case "vanilla-cpp": await setup_cpp(projectDir); break;
            case "pygame": await setup_js(projectDir); break;
            case "vanilla-ocaml": await setup_ocaml(projectDir); break;
        }
    });

async function setup_js(path: string) {
    const exc = execa({ cwd: path, stdio: "inherit" });

    const packageManager = await select({
        message: "Package manager:",
        choices: [
            { value: "npm", name: "npm" },
            { value: "pnpm", name: "pnpm" },
            { value: "bun", name: "bun" },
        ]
    });

    switch (packageManager) {
        case "npm": await exc`npm install`; break;
        case "pnpm": await exc`pnpm install`; break;
        case "bun": await exc`bun install`; break;
    }

    await exc`git init`;

    write_workflow(path, [
        {
            name: "Setup Node.js",
            uses: "actions/setup-node@v4",
            with: {
                "node-version": "20",
                ...(packageManager === "bun" ? {} : { cache: packageManager })
            }
        },
        ...(packageManager === "bun" ? [{
            name: "Setup Bun",
            uses: "oven-sh/setup-bun@v2",
            with: {
                "bun-version": "latest"
            }
        }] : []),
        ...(packageManager === "pnpm" ? [{
            name: "Setup pnpm",
            uses: "pnpm/action-setup@v4",
            with: {
                "version": 9
            }
        }] : []),
        {
            name: "Install dependencies",
            run: `${packageManager} install`,
        },
        {
            name: "Build Vite project",
            run: `${packageManager} run build`,
        }
    ])
}

async function setup_rs(path: string) {
    const exc = execa({ cwd: path, stdio: "inherit" });

    write_workflow(path, [
        {
            name: "Install Rust WASM toolchain",
            uses: "actions-rs/toolchain@v1",
            with: {
                toolchain: "stable",
                target: "wasm32-unknown-unknown",
                oevrride: true,
            }
        },
        {
            name: "Install Trunk",
            run: "cargo install --locked trunk",
        },
        {
            name: "Build Trunk project",
            run: "trunk build --release"
        }
    ])

    await exc`git init`;
}

async function setup_ocaml(path: string) {
    const exc = execa({ cwd: path, stdio: "inherit" });

    write_workflow(path, [
        {
            name: "Setup OCaml",
            uses: "ocaml/setup-ocaml@v3",
            with: {
                "ocaml-compiler": "5",
            }
        },
        {
            name: "Install dependencies",
            run: "opam install . --deps-only",
        },
        {
            name: "Build project",
            run: "opam exec -- dune build --profile release"
        },
        {
            name: "Setup Node.js",
            uses: "actions/setup-node@v4",
            with: {
                "node-version": "20",
                cache: "npm"
            }
        },
        {
            name: "Install dependencies",
            run: `npm install`,
        },
        {
            name: "Build Vite project",
            run: `npm run build`,
        }
    ])

    await exc`git init`;
}

async function setup_cpp(path: string) {
    const exc = execa({ cwd: path, stdio: "inherit" });

    write_workflow(path, [
        {
            name: "Setup Emscripten",
            uses: "mymindstorm/setup-emsdk@v14",
            with: {
                version: "latest"
            }
        },
        {
            name: "Verify Emscripten installation",
            run: "emcc --version"
        },
        {
            name: "Build with Emscripten",
            run: "make build"
        }
    ])

    await exc`git init`;
}

