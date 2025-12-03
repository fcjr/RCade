import { Command } from "commander";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const CACHE_DIR = path.join(os.homedir(), ".rcade", "bin");
const GITHUB_REPO = "fcjr/RCade";

interface PlatformInfo {
    // Node.js platform name
    nodePlatform: "darwin" | "win32" | "linux";
    // Electron-builder platform name (used in asset names)
    ebPlatform: "mac" | "win" | "linux";
    // Electron-builder arch name (Linux uses x86_64 instead of x64)
    ebArch: string;
    extension: string;
    binaryName: string;
}

function getPlatformInfo(): PlatformInfo {
    const nodePlatform = os.platform() as "darwin" | "win32" | "linux";
    const arch = os.arch() as "x64" | "arm64";

    if (!["darwin", "win32", "linux"].includes(nodePlatform)) {
        throw new Error(`Unsupported platform: ${nodePlatform}`);
    }
    if (!["x64", "arm64"].includes(arch)) {
        throw new Error(`Unsupported architecture: ${arch}`);
    }

    let ebPlatform: "mac" | "win" | "linux";
    let ebArch: string;
    let extension: string;
    let binaryName: string;

    switch (nodePlatform) {
        case "darwin":
            ebPlatform = "mac";
            ebArch = arch; // x64 or arm64
            extension = "zip";
            binaryName = "rcade.app";
            break;
        case "win32":
            ebPlatform = "win";
            ebArch = arch; // x64 or arm64
            extension = "zip";
            binaryName = "rcade.exe";
            break;
        case "linux":
            ebPlatform = "linux";
            ebArch = arch === "x64" ? "x86_64" : arch; // Linux uses x86_64
            extension = "AppImage";
            binaryName = "rcade.AppImage";
            break;
    }

    return { nodePlatform, ebPlatform, ebArch, extension, binaryName };
}

function getAssetName(info: PlatformInfo, version: string): string {
    return `rcade-cabinet-${info.ebPlatform}-${info.ebArch}.${info.extension}`;
}

function getCachedBinaryPath(info: PlatformInfo, version: string): string {
    const versionDir = path.join(CACHE_DIR, version);
    return path.join(versionDir, info.binaryName);
}

function getAnyCachedVersion(info: PlatformInfo): string | null {
    if (!fs.existsSync(CACHE_DIR)) {
        return null;
    }

    // Get all cached versions and find one with a valid binary
    const versions = fs.readdirSync(CACHE_DIR)
        .filter(dir => {
            const binaryPath = getCachedBinaryPath(info, dir);
            return fs.existsSync(binaryPath);
        })
        .sort((a, b) => {
            // Sort by semver descending (newest first)
            const [aMaj, aMin, aPatch] = a.split(".").map(Number);
            const [bMaj, bMin, bPatch] = b.split(".").map(Number);
            if (bMaj !== aMaj) return bMaj - aMaj;
            if (bMin !== aMin) return bMin - aMin;
            return bPatch - aPatch;
        });

    return versions[0] || null;
}

async function getLatestVersion(): Promise<string> {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
    const response = await fetch(url, {
        headers: {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "rcade-cli"
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch latest release: ${response.statusText}`);
    }

    const release = await response.json() as { tag_name: string };
    return release.tag_name.replace(/^cabinet-v/, "").replace(/^v/, "");
}

async function downloadAsset(info: PlatformInfo, version: string): Promise<string> {
    const assetName = getAssetName(info, version);
    const versionDir = path.join(CACHE_DIR, version);
    const downloadPath = path.join(versionDir, assetName);
    const binaryPath = getCachedBinaryPath(info, version);

    // Create cache directory
    fs.mkdirSync(versionDir, { recursive: true });

    console.log(`Downloading rcade cabinet v${version} for ${info.ebPlatform}-${info.ebArch}...`);

    // Try to get download URL from GitHub releases
    const releaseUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/cabinet-v${version}`;
    const releaseResponse = await fetch(releaseUrl, {
        headers: {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "rcade-cli"
        }
    });

    if (!releaseResponse.ok) {
        throw new Error(
            `Failed to find release cabinet-v${version}. ` +
            `Make sure the cabinet has been released for this version.\n` +
            `You can build and release it by running: bun run build:mac (or build:win/build:linux) in the cabinet directory.`
        );
    }

    const release = await releaseResponse.json() as {
        assets: Array<{ name: string; browser_download_url: string }>
    };

    const asset = release.assets.find(a => a.name === assetName);
    if (!asset) {
        const availableAssets = release.assets.map(a => a.name).join(", ");
        throw new Error(
            `Asset ${assetName} not found in release cabinet-v${version}.\n` +
            `Available assets: ${availableAssets || "none"}`
        );
    }

    // Download the asset
    const downloadResponse = await fetch(asset.browser_download_url, {
        headers: { "User-Agent": "rcade-cli" }
    });

    if (!downloadResponse.ok) {
        throw new Error(`Failed to download asset: ${downloadResponse.statusText}`);
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    fs.writeFileSync(downloadPath, Buffer.from(arrayBuffer));

    console.log("Download complete. Extracting...");

    // Extract based on platform
    if (info.extension === "zip") {
        await extractZip(downloadPath, versionDir);
        // Clean up zip file
        fs.unlinkSync(downloadPath);
    } else if (info.extension === "AppImage") {
        // AppImage doesn't need extraction, just make it executable
        fs.renameSync(downloadPath, binaryPath);
        fs.chmodSync(binaryPath, 0o755);
    }

    // Make sure the binary is executable (for macOS app bundle)
    if (info.nodePlatform === "darwin") {
        const executablePath = path.join(binaryPath, "Contents", "MacOS", "rcade");
        if (fs.existsSync(executablePath)) {
            fs.chmodSync(executablePath, 0o755);
        }
    }

    console.log("Installation complete!");
    return binaryPath;
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
    // Use native unzip command (available on macOS and most Linux)
    // On Windows, we'd need a different approach
    const { execSync } = await import("node:child_process");

    if (os.platform() === "win32") {
        // Use PowerShell on Windows
        execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, {
            stdio: "inherit"
        });
    } else {
        execSync(`unzip -o -q "${zipPath}" -d "${destDir}"`, {
            stdio: "inherit"
        });
    }
}

function launchCabinet(binaryPath: string, info: PlatformInfo, args: string[]): void {
    let command: string;
    let spawnArgs: string[];

    switch (info.nodePlatform) {
        case "darwin":
            // Run the executable directly inside the .app bundle
            command = path.join(binaryPath, "Contents", "MacOS", "rcade");
            spawnArgs = args;
            break;
        case "win32":
            command = binaryPath;
            spawnArgs = args;
            break;
        case "linux":
            command = binaryPath;
            spawnArgs = args;
            break;
    }

    console.log("Launching rcade cabinet...");

    const child = spawn(command, spawnArgs, {
        stdio: "inherit"
    });

    // Handle termination signals
    const cleanup = () => {
        if (!child.killed) {
            child.kill();
        }
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    child.on("exit", (code) => {
        process.off("SIGINT", cleanup);
        process.off("SIGTERM", cleanup);
        process.exit(code ?? 0);
    });
}

export const devCommand = new Command("dev")
    .description("launch the RCade cabinet application for local development")
    .argument("<server>", "URL of your local dev server (e.g., http://localhost:5173)")
    .argument("[manifest]", "Path to rcade.manifest.json (default: ./rcade.manifest.json)")
    .option("-v, --version <version>", "Specific cabinet version to run")
    .option("--force-download", "Force re-download of the cabinet binary")
    .option("--scale <factor>", "Scale factor for the window (default: 2)")
    .action(async (serverUrl: string, manifestPath: string | undefined, options: { version?: string; forceDownload?: boolean; scale?: string }) => {
        try {
            // Resolve and validate manifest path (default to cwd)
            const resolvedManifestPath = manifestPath || "rcade.manifest.json";
            const absoluteManifestPath = path.resolve(resolvedManifestPath);
            if (!fs.existsSync(absoluteManifestPath)) {
                throw new Error(`Manifest not found: ${absoluteManifestPath}`);
            }

            // Read manifest to get game name and version
            const manifest = JSON.parse(fs.readFileSync(absoluteManifestPath, "utf-8"));
            const gameName = manifest.name;
            if (!gameName) {
                throw new Error("Manifest is missing 'name' field");
            }
            // Use manifest version if present, otherwise "LOCAL" for automatic versioning
            const gameVersion = manifest.version ?? "LOCAL";

            const info = getPlatformInfo();

            let version = options.version;
            let binaryPath: string;

            if (version) {
                // User specified a version
                binaryPath = getCachedBinaryPath(info, version);
                if (!fs.existsSync(binaryPath) || options.forceDownload) {
                    await downloadAsset(info, version);
                } else {
                    console.log(`Using cached cabinet v${version}`);
                }
            } else {
                // Try to get latest, fall back to cache if offline
                try {
                    console.log("Checking for latest cabinet release...");
                    version = await getLatestVersion();
                    binaryPath = getCachedBinaryPath(info, version);

                    if (!fs.existsSync(binaryPath) || options.forceDownload) {
                        await downloadAsset(info, version);
                    } else {
                        console.log(`Using cached cabinet v${version}`);
                    }
                } catch (fetchError) {
                    // Offline or API error - try to use cached version
                    const cachedVersion = getAnyCachedVersion(info);
                    if (cachedVersion) {
                        console.log(`Offline - using cached cabinet v${cachedVersion}`);
                        version = cachedVersion;
                        binaryPath = getCachedBinaryPath(info, version);
                    } else {
                        throw new Error(
                            "Unable to fetch latest release and no cached version available.\n" +
                            "Please check your internet connection."
                        );
                    }
                }
            }

            // Build cabinet args
            const cabinetArgs = [
                absoluteManifestPath,
                "--dev",
                "--no-exit",
                "--override", `${gameName}@${gameVersion}=${serverUrl}`
            ];

            if (options.scale) {
                cabinetArgs.push("--scale", options.scale);
            }

            // Launch the cabinet in dev mode
            launchCabinet(binaryPath, info, cabinetArgs);

        } catch (error) {
            console.error("Error:", error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
