import enquirer from "enquirer";
import { fdir } from "fdir";
import mustache from "mustache";
import fs from "node:fs";
import path, { dirname } from "node:path";
import Mustache from "mustache";
import { mkdir } from "node:fs/promises";
import { write_workflow } from "./workflow";
import { execa } from "execa";

export async function main() {
    const { name } = <{ name: string }>await enquirer.prompt({
        type: 'input',
        name: 'name',
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

    const { display_name } = <{ display_name: string }>await enquirer.prompt({
        type: 'input',
        name: 'display_name',
        initial: name,
        message: 'Enter display name (My Game):',
    });

    const { description } = <{ description: string }>await enquirer.prompt({
        type: 'text',
        name: 'description',
        initial: name,
        message: 'Enter game description:',
    });

    const { visibility } = <{ visibility: string }>await enquirer.prompt({
        type: "select",
        name: "visibility",
        message: "Game visibility:",
        choices: [
            { name: "public", message: "Public", hint: "(Everyone can play!)" },
            { name: "private", message: "Private", hint: "(Only Recursers and people at the Hub can play.)" },
            { name: "personal", message: "Personal", hint: "(Only you can play - good for development)" },
        ]
    });

    const { versioning } = <{ versioning: string }>await enquirer.prompt({
        type: "select",
        name: "versioning",
        message: "Versioning:",
        choices: [
            { name: "automatic", message: "Automatic", hint: "(Recommended - version is incremented every push)" },
            { name: "manual", message: "Manual", hint: "(Manual - you control when versions are incremented)" },
        ]
    });

    const { template: templateDirectory } = <{ template: string }>await enquirer.prompt({
        type: "select",
        name: "template",
        message: "Starting template:",
        choices: [
            { name: "vanilla-js", message: "Vanilla (JavaScript)" },
            { name: "vanilla-ts", message: "Vanilla (TypeScript)" },
            { name: "vanilla-rs", message: "Vanilla (Rust)" },
        ]
    });

    const manifest = {
        name,
        display_name,
        description,
        visibility,
        ...(versioning === "automatic" ? {} : { version: "1.0.0" }),
        authors: { display_name: "Temp" },
    };

    const templatePath = path.join(__dirname, `../templates/${templateDirectory}`);
    const template = new fdir().withRelativePaths().crawl(templatePath);

    const view = {
        project_name: name,
        display_name,
        description,
        private: String(visibility !== "public"),
    }

    for (const file of await template.withPromise()) {
        const relativePath = file;
        const source = fs.readFileSync(path.join(templatePath, relativePath), "utf-8");
        const render = Mustache.render(source, view);
        const destination = path.join(".", name, file);
        const destination_dir = dirname(destination);

        await mkdir(destination_dir, { recursive: true });

        fs.writeFileSync(destination, render);
    }

    fs.writeFileSync(path.join(".", name, "rcade.manifest.json"), JSON.stringify(manifest, undefined, 2));

    switch (templateDirectory) {
        case "vanilla-js": setup_js(path.join(".", name)); break;
        case "vanilla-ts": setup_js(path.join(".", name)); break;
        case "vanilla-rs": setup_rs(path.join(".", name)); break;
    }
}

async function setup_js(path: string) {
    const exc = execa({ cwd: path, stdio: "inherit" });

    const { packageManager } = <{ packageManager: string }>await enquirer.prompt({
        type: "select",
        name: "packageManager",
        message: "Package manager:",
        choices: [
            { name: "npm", message: "npm" },
            { name: "pnpm", message: "pnpm" },
            { name: "bun", message: "bun" },
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