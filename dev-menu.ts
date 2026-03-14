#!/usr/bin/env tsx

import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const menuDir = join(rootDir, "menu");
const cabinetDir = join(rootDir, "cabinet");
const menuManifest = join(menuDir, "rcade.manifest.json");

// ANSI color codes for output
const colors = {
    menu: "\x1b[36m",    // Cyan
    cabinet: "\x1b[35m", // Magenta
    reset: "\x1b[0m",
};

function prefixOutput(prefix: string, color: string) {
    return (data: Buffer) => {
        const text = data.toString();
        const lines = text.split("\n").filter(Boolean);
        lines.forEach((line) => {
            console.log(`${color}[${prefix}]${colors.reset} ${line}`);
        });
    };
}

async function main() {
    console.log("Starting menu development environment...\n");

    // Start menu dev server
    const menuProc = spawn("pnpm", ["run", "dev", "--port", "8811"], {
        cwd: menuDir,
        stdio: ["inherit", "pipe", "pipe"],
    });

    // Start cabinet with menu override
    const cabinetProc = spawn("pnpm", ["run", "dev"], {
        cwd: cabinetDir,
        env: {
            ...process.env,
            RCADE_CABINET_ARGS: `--menu "${menuManifest}" --force-screensaver --scale 4 --dev --override menu@LOCAL=http://localhost:8811`,
        },
        stdio: ["inherit", "pipe", "pipe"],
    });

    // Handle menu output
    menuProc.stdout?.on("data", prefixOutput("menu", colors.menu));
    menuProc.stderr?.on("data", prefixOutput("menu", colors.menu));

    // Handle cabinet output
    cabinetProc.stdout?.on("data", prefixOutput("cabinet", colors.cabinet));
    cabinetProc.stderr?.on("data", prefixOutput("cabinet", colors.cabinet));

    // Handle graceful shutdown
    const cleanup = () => {
        console.log("\n\nShutting down...");
        menuProc.kill();
        cabinetProc.kill();
        process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    // Wait for both processes
    await Promise.all([
        new Promise<void>((resolve) => menuProc.on("close", () => resolve())),
        new Promise<void>((resolve) => cabinetProc.on("close", () => resolve())),
    ]);
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
