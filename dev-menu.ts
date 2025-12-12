#!/usr/bin/env bun

import { spawn } from "bun";
import { join } from "path";

const rootDir = import.meta.dir;
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
    return (data: Uint8Array) => {
        const text = new TextDecoder().decode(data);
        const lines = text.split("\n").filter(Boolean);
        lines.forEach((line) => {
            console.log(`${color}[${prefix}]${colors.reset} ${line}`);
        });
    };
}

async function main() {
    console.log("🚀 Starting menu development environment...\n");

    // Start menu dev server
    const menuProc = spawn({
        cmd: ["bun", "run", "dev", "--port", "8811"],
        cwd: menuDir,
        stdout: "pipe",
        stderr: "pipe",
    });

    // Start cabinet with menu override
    const cabinetProc = spawn({
        cmd: ["bun", "run", "dev"],
        cwd: cabinetDir,
        env: {
            ...process.env,
            RCADE_CABINET_ARGS: `--menu "${menuManifest}" --scale 4 --dev --override menu@LOCAL=http://localhost:8811`,
        },
        stdout: "pipe",
        stderr: "pipe",
    });

    // Handle menu output
    const menuReader = menuProc.stdout.getReader();
    const menuErrReader = menuProc.stderr.getReader();

    (async () => {
        while (true) {
            const { done, value } = await menuReader.read();
            if (done) break;
            prefixOutput("menu", colors.menu)(value);
        }
    })();

    (async () => {
        while (true) {
            const { done, value } = await menuErrReader.read();
            if (done) break;
            prefixOutput("menu", colors.menu)(value);
        }
    })();

    // Handle cabinet output
    const cabinetReader = cabinetProc.stdout.getReader();
    const cabinetErrReader = cabinetProc.stderr.getReader();

    (async () => {
        while (true) {
            const { done, value } = await cabinetReader.read();
            if (done) break;
            prefixOutput("cabinet", colors.cabinet)(value);
        }
    })();

    (async () => {
        while (true) {
            const { done, value } = await cabinetErrReader.read();
            if (done) break;
            prefixOutput("cabinet", colors.cabinet)(value);
        }
    })();

    // Handle graceful shutdown
    const cleanup = () => {
        console.log("\n\n🛑 Shutting down...");
        menuProc.kill();
        cabinetProc.kill();
        process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    // Wait for both processes
    await Promise.all([menuProc.exited, cabinetProc.exited]);
}

main().catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
});