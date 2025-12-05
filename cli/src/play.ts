import { Command } from "commander";
import { resolveCabinetBinary, launchCabinet } from "./cabinet";

export const playCommand = new Command("play")
    .description("launch the RCade cabinet in windowed mode with keyboard emulation")
    .option("-v, --version <version>", "Specific cabinet version to run")
    .option("--force-download", "Force re-download of the cabinet binary")
    .option("--scale <factor>", "Scale factor for the window (default: 2)")
    .action(async (options: { version?: string; forceDownload?: boolean; scale?: string }) => {
        try {
            const { binaryPath, info } = await resolveCabinetBinary(options);

            const cabinetArgs = ["--dev", "--no-exit"];

            if (options.scale) {
                cabinetArgs.push("--scale", options.scale);
            }

            launchCabinet(binaryPath, info, cabinetArgs);

        } catch (error) {
            console.error("Error:", error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
