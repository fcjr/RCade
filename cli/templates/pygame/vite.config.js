import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "fs";

// Pyodide npm package directory
const pyodideDir = dirname(fileURLToPath(import.meta.resolve("pyodide")));

// Parse PEP 723 inline script metadata to get dependencies
function parsePythonDeps(pythonCode) {
    const match = pythonCode.match(/# \/\/\/ script\n([\s\S]*?)# \/\/\//);
    if (!match) return ["pygame-ce"]; // default

    const toml = match[1];
    const depsMatch = toml.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (!depsMatch) return ["pygame-ce"];

    const deps = depsMatch[1]
        .split(",")
        .map(d => d.trim().replace(/['"]/g, ""))
        .filter(d => d.length > 0);

    return deps.length > 0 ? deps : ["pygame-ce"];
}

function getPyodideLock() {
    const lockPath = join(pyodideDir, "pyodide-lock.json");
    if (existsSync(lockPath)) {
        return JSON.parse(readFileSync(lockPath, "utf-8"));
    }
    throw new Error("pyodide-lock.json not found in pyodide package");
}

function getPyodideVersion() {
    const pkgPath = join(pyodideDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version;
}

// Recursively get all dependencies for a package
function getAllDeps(lock, pkgName, visited = new Set()) {
    if (visited.has(pkgName)) return [];
    visited.add(pkgName);

    const pkg = lock.packages[pkgName] || lock.packages[pkgName.replace(/-/g, "_")];
    if (!pkg) return [];

    let deps = [pkgName];
    for (const dep of pkg.depends || []) {
        deps = deps.concat(getAllDeps(lock, dep, visited));
    }
    return deps;
}

// Plugin to download Python wheels and setup pyodide for both dev and build
function pyodidePlugin() {
    let downloadedWheels = [];

    return {
        name: "pyodide-plugin",
        async buildStart() {
            const publicAssetsDir = join(process.cwd(), "public", "assets");
            const wheelsDir = join(process.cwd(), "wheels");
            const gamePyPath = join(process.cwd(), "src", "game.py");

            // Create directories
            mkdirSync(publicAssetsDir, { recursive: true });
            mkdirSync(wheelsDir, { recursive: true });

            // Copy pyodide files to public/assets for dev server
            console.log("Setting up Pyodide files...");
            const pyodideFiles = readdirSync(pyodideDir);
            for (const file of pyodideFiles) {
                // Skip unnecessary files
                if (file.endsWith('.md') || file.endsWith('.html') || file.endsWith('.d.ts')) {
                    continue;
                }
                const src = join(pyodideDir, file);
                const dest = join(publicAssetsDir, file);
                if (!existsSync(dest)) {
                    copyFileSync(src, dest);
                }
            }

            // Get pyodide version and lock file
            const pyodideVersion = getPyodideVersion();
            const lock = getPyodideLock();
            const baseUrl = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`;

            console.log(`Pyodide version: ${pyodideVersion}`);

            // Parse dependencies from game.py
            const gameCode = readFileSync(gamePyPath, "utf-8");
            const userDeps = parsePythonDeps(gameCode);

            // Always include micropip and packaging (needed for installing wheels)
            const baseDeps = ["micropip", "packaging"];
            const allUserDeps = [...new Set([...baseDeps, ...userDeps])];

            console.log(`Python dependencies: ${allUserDeps.join(", ")}`);

            // Get all dependencies including transitive ones
            const allDeps = new Set();
            for (const dep of allUserDeps) {
                for (const d of getAllDeps(lock, dep)) {
                    allDeps.add(d);
                }
            }

            console.log(`All dependencies (including transitive): ${[...allDeps].join(", ")}`);

            // Download each dependency wheel
            for (const dep of allDeps) {
                const pkgInfo = lock.packages[dep] || lock.packages[dep.replace(/-/g, "_")];

                if (!pkgInfo) {
                    console.warn(`Warning: ${dep} not found in Pyodide packages, skipping...`);
                    continue;
                }

                const wheelName = pkgInfo.file_name;
                const wheelPath = join(wheelsDir, wheelName);
                const publicWheelPath = join(publicAssetsDir, wheelName);

                if (!existsSync(wheelPath)) {
                    console.log(`Downloading ${wheelName}...`);
                    const url = baseUrl + wheelName;
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`Failed to download ${wheelName}: ${response.statusText}`);
                    }
                    const buffer = await response.arrayBuffer();
                    writeFileSync(wheelPath, Buffer.from(buffer));
                }

                // Copy to public for dev server
                if (!existsSync(publicWheelPath)) {
                    copyFileSync(wheelPath, publicWheelPath);
                }

                downloadedWheels.push(wheelName);
            }

            console.log(`Wheels ready: ${downloadedWheels.join(", ")}`);
        },
        resolveId(id) {
            if (id === "virtual:pygame-wheels") {
                return id;
            }
        },
        load(id) {
            if (id === "virtual:pygame-wheels") {
                return `export default ${JSON.stringify(downloadedWheels)};`;
            }
        },
    };
}

// Static copy plugin for production build
function viteStaticCopyPyodide() {
    return viteStaticCopy({
        targets: [
            {
                src: [
                    join(pyodideDir, "*"),
                    "!**/*.{md,html}",
                    "!**/*.d.ts",
                    "!**/node_modules",
                ],
                dest: "assets",
            },
            {
                src: "wheels/*",
                dest: "assets",
            },
        ],
        silent: true, // Don't error on missing files during dev
    });
}

export default defineConfig({
    optimizeDeps: { exclude: ["pyodide"] },
    plugins: [pyodidePlugin(), viteStaticCopyPyodide()],
});
