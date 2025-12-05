import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const CACHE_DIR = path.join(os.homedir(), ".rcade", "bin");
const GITHUB_REPO = "fcjr/RCade";

export interface PlatformInfo {
    nodePlatform: "darwin" | "win32" | "linux";
    ebPlatform: "mac" | "win" | "linux";
    ebArch: string;
    extension: string;
    binaryName: string;
}

export function getPlatformInfo(): PlatformInfo {
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
            ebArch = arch;
            extension = "zip";
            binaryName = "rcade.app";
            break;
        case "win32":
            ebPlatform = "win";
            ebArch = arch;
            extension = "zip";
            binaryName = "rcade.exe";
            break;
        case "linux":
            ebPlatform = "linux";
            ebArch = arch === "x64" ? "x86_64" : arch;
            extension = "AppImage";
            binaryName = "rcade.AppImage";
            break;
    }

    return { nodePlatform, ebPlatform, ebArch, extension, binaryName };
}

function getAssetName(info: PlatformInfo): string {
    return `rcade-cabinet-${info.ebPlatform}-${info.ebArch}.${info.extension}`;
}

export function getCachedBinaryPath(info: PlatformInfo, version: string): string {
    const versionDir = path.join(CACHE_DIR, version);
    return path.join(versionDir, info.binaryName);
}

export function getAnyCachedVersion(info: PlatformInfo): string | null {
    if (!fs.existsSync(CACHE_DIR)) {
        return null;
    }

    const versions = fs.readdirSync(CACHE_DIR)
        .filter(dir => {
            const binaryPath = getCachedBinaryPath(info, dir);
            return fs.existsSync(binaryPath);
        })
        .sort((a, b) => {
            const [aMaj, aMin, aPatch] = a.split(".").map(Number);
            const [bMaj, bMin, bPatch] = b.split(".").map(Number);
            if (bMaj !== aMaj) return bMaj - aMaj;
            if (bMin !== aMin) return bMin - aMin;
            return bPatch - aPatch;
        });

    return versions[0] || null;
}

export async function getLatestVersion(): Promise<string> {
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

export async function downloadAsset(info: PlatformInfo, version: string): Promise<string> {
    const assetName = getAssetName(info);
    const versionDir = path.join(CACHE_DIR, version);
    const downloadPath = path.join(versionDir, assetName);
    const binaryPath = getCachedBinaryPath(info, version);

    fs.mkdirSync(versionDir, { recursive: true });

    console.log(`Downloading rcade cabinet v${version} for ${info.ebPlatform}-${info.ebArch}...`);

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

    const downloadResponse = await fetch(asset.browser_download_url, {
        headers: { "User-Agent": "rcade-cli" }
    });

    if (!downloadResponse.ok) {
        throw new Error(`Failed to download asset: ${downloadResponse.statusText}`);
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    fs.writeFileSync(downloadPath, Buffer.from(arrayBuffer));

    console.log("Download complete. Extracting...");

    if (info.extension === "zip") {
        await extractZip(downloadPath, versionDir);
        fs.unlinkSync(downloadPath);
    } else if (info.extension === "AppImage") {
        fs.renameSync(downloadPath, binaryPath);
        fs.chmodSync(binaryPath, 0o755);
    }

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
    const { execSync } = await import("node:child_process");

    if (os.platform() === "win32") {
        execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, {
            stdio: "inherit"
        });
    } else {
        execSync(`unzip -o -q "${zipPath}" -d "${destDir}"`, {
            stdio: "inherit"
        });
    }
}

export function launchCabinet(binaryPath: string, info: PlatformInfo, args: string[]): void {
    let command: string;

    switch (info.nodePlatform) {
        case "darwin":
            command = path.join(binaryPath, "Contents", "MacOS", "rcade");
            break;
        case "win32":
        case "linux":
            command = binaryPath;
            break;
    }

    console.log("Launching rcade cabinet...");

    const child = spawn(command, args, {
        stdio: "inherit"
    });

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

export interface ResolveCabinetOptions {
    version?: string;
    forceDownload?: boolean;
}

export async function resolveCabinetBinary(options: ResolveCabinetOptions): Promise<{ binaryPath: string; version: string; info: PlatformInfo }> {
    const info = getPlatformInfo();
    let version = options.version;
    let binaryPath: string;

    if (version) {
        binaryPath = getCachedBinaryPath(info, version);
        if (!fs.existsSync(binaryPath) || options.forceDownload) {
            await downloadAsset(info, version);
        } else {
            console.log(`Using cached cabinet v${version}`);
        }
    } else {
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

    return { binaryPath, version, info };
}
