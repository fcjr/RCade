import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { resolveCabinetBinary, launchCabinet } from "./cabinet.js";

export const devCommand = new Command("dev")
    .description("launch the RCade cabinet application for local development")
    .argument("<server>", "URL of your local dev server (e.g., http://localhost:5173)")
    .argument("[manifest]", "Path to rcade.manifest.json (default: ./rcade.manifest.json)")
    .option("-v, --version <version>", "Specific cabinet version to run")
    .option("--force-download", "Force re-download of the cabinet binary")
    .option("--scale <factor>", "Scale factor for the window (default: 2)")
    .action(async (serverUrl: string, manifestPath: string | undefined, options: { version?: string; forceDownload?: boolean; scale?: string }) => {
        try {
            const resolvedManifestPath = manifestPath || "rcade.manifest.json";
            const absoluteManifestPath = path.resolve(resolvedManifestPath);
            if (!fs.existsSync(absoluteManifestPath)) {
                throw new Error(`Manifest not found: ${absoluteManifestPath}`);
            }

            const manifest = JSON.parse(fs.readFileSync(absoluteManifestPath, "utf-8"));
            const gameName = manifest.name;
            if (!gameName) {
                throw new Error("Manifest is missing 'name' field");
            }
            const gameVersion = manifest.version ?? "LOCAL";

            const { binaryPath, info } = await resolveCabinetBinary(options);

            const cabinetArgs = [
                absoluteManifestPath,
                "--dev",
                "--no-exit",
                "--override", `${gameName}@${gameVersion}=${serverUrl}`
            ];

            if (options.scale) {
                cabinetArgs.push("--scale", options.scale);
            }

            launchCabinet(binaryPath, info, cabinetArgs);

        } catch (error) {
            console.error("Error:", error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
