import { Command } from "commander";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CACHE_DIR = path.join(os.homedir(), ".rcade", "bin");

export const cacheCommand = new Command("cache")
    .description("Manage the rcade cabinet cache")
    .addCommand(
        new Command("clear")
            .description("Clear all cached cabinet binaries")
            .action(() => {
                if (!fs.existsSync(CACHE_DIR)) {
                    console.log("Cache is already empty.");
                    return;
                }

                const versions = fs.readdirSync(CACHE_DIR);
                if (versions.length === 0) {
                    console.log("Cache is already empty.");
                    return;
                }

                fs.rmSync(CACHE_DIR, { recursive: true, force: true });
                console.log(`Cleared ${versions.length} cached version(s).`);
            })
    )
    .addCommand(
        new Command("list")
            .description("List cached cabinet versions")
            .action(() => {
                if (!fs.existsSync(CACHE_DIR)) {
                    console.log("No cached versions.");
                    return;
                }

                const versions = fs.readdirSync(CACHE_DIR).filter(dir => {
                    const stat = fs.statSync(path.join(CACHE_DIR, dir));
                    return stat.isDirectory();
                });

                if (versions.length === 0) {
                    console.log("No cached versions.");
                    return;
                }

                console.log("Cached cabinet versions:");
                for (const version of versions) {
                    console.log(`  - ${version}`);
                }
            })
    )
    .addCommand(
        new Command("dir")
            .description("Print the cache directory path")
            .action(() => {
                console.log(CACHE_DIR);
            })
    );
