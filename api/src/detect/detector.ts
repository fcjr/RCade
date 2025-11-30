import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import * as semver from "semver";
import * as JSON5 from "json5";
import { parse as parseToml } from "smol-toml";
import { pluginManifests } from "../plugins.js";
import { Manifest as PluginManifestSchema } from "../plugin/manifest.js";
import type * as z from "zod";

type PluginManifest = z.infer<typeof PluginManifestSchema>;
type Language = "javascript" | "rust";

interface DetectedPackage {
    language: Language;
    name: string;
    version: string;
}

interface DetectedPlugin {
    manifest: PluginManifest;
    matchedPackages: DetectedPackage[];
}

interface GameDependency {
    name: string;
    version: string;
}

const IGNORE_DIRS = new Set([
    "node_modules",
    "target",
    ".git",
    "dist",
    "build",
    ".next",
    ".turbo",
    "vendor",
]);

export class PluginDetector {
    private manifests: PluginManifest[];

    constructor(manifests?: PluginManifest[]) {
        this.manifests = manifests ?? pluginManifests.map(m => PluginManifestSchema.parse(m));
    }

    private findFiles(repoPath: string, filename: string): string[] {
        const results: string[] = [];

        const search = (dir: string) => {
            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch {
                return;
            }

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    if (!IGNORE_DIRS.has(entry.name)) {
                        search(path.join(dir, entry.name));
                    }
                } else if (entry.isFile() && entry.name === filename) {
                    results.push(path.join(dir, entry.name));
                }
            }
        };

        search(repoPath);
        return results;
    }

    detectLanguages(repoPath: string): Language[] {
        const languages: Language[] = [];
        if (this.findFiles(repoPath, "package.json").length > 0) {
            languages.push("javascript");
        }
        if (this.findFiles(repoPath, "Cargo.toml").length > 0) {
            languages.push("rust");
        }
        return languages;
    }

    private parsePackageJsonFile(filePath: string): DetectedPackage[] {
        const content = fs.readFileSync(filePath, "utf-8");
        const packageJson = JSON5.parse(content);
        const packages: DetectedPackage[] = [];
        const allDeps: Record<string, unknown> = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
        };

        for (const [name, version] of Object.entries(allDeps)) {
            if (typeof version === "string") {
                packages.push({
                    language: "javascript",
                    name,
                    version: this.cleanVersion(version),
                });
            }
        }
        return packages;
    }

    private parseBunLockFile(filePath: string): DetectedPackage[] {
        const content = fs.readFileSync(filePath, "utf-8");
        const lock = JSON5.parse(content);
        const packages: DetectedPackage[] = [];

        const pkgs = lock.packages;
        if (!pkgs || typeof pkgs !== "object") {
            return packages;
        }

        for (const [, value] of Object.entries(pkgs)) {
            if (!Array.isArray(value) || value.length < 1) continue;

            const pkgSpec = value[0];
            if (typeof pkgSpec !== "string") continue;

            // format: "package-name@version" or "@scope/package@version"
            const atIndex = pkgSpec.lastIndexOf("@");
            if (atIndex <= 0) continue;

            const name = pkgSpec.slice(0, atIndex);
            const version = pkgSpec.slice(atIndex + 1);

            // skip workspace packages
            if (version.startsWith("workspace:")) continue;

            const cleanedVersion = this.cleanVersion(version);
            if (cleanedVersion) {
                packages.push({
                    language: "javascript",
                    name,
                    version: cleanedVersion,
                });
            }
        }

        return packages;
    }

    private parseNpmLockFile(filePath: string): DetectedPackage[] {
        const content = fs.readFileSync(filePath, "utf-8");
        const lock = JSON5.parse(content);
        const packages: DetectedPackage[] = [];

        const pkgs = lock.packages;
        if (!pkgs || typeof pkgs !== "object") {
            return packages;
        }

        for (const [key, value] of Object.entries(pkgs)) {
            if (!key.startsWith("node_modules/")) continue;
            if (typeof value !== "object" || value === null) continue;

            const v = value as Record<string, unknown>;
            const version = v.version;
            if (typeof version !== "string") continue;

            // extract package name from path (handles scoped packages)
            const name = key.replace(/^node_modules\//, "").replace(/\/node_modules\/.*$/, "");

            packages.push({
                language: "javascript",
                name,
                version: this.cleanVersion(version),
            });
        }

        return packages;
    }

    private parsePnpmLockFile(filePath: string): DetectedPackage[] {
        const content = fs.readFileSync(filePath, "utf-8");
        const lock = yaml.load(content) as Record<string, unknown>;
        const packages: DetectedPackage[] = [];

        const pkgs = lock.packages;
        if (!pkgs || typeof pkgs !== "object") {
            return packages;
        }

        for (const key of Object.keys(pkgs)) {
            // format: "package@version" or "@scope/package@version"
            const atIndex = key.lastIndexOf("@");
            if (atIndex <= 0) continue;

            const name = key.slice(0, atIndex);
            const version = key.slice(atIndex + 1);

            packages.push({
                language: "javascript",
                name,
                version: this.cleanVersion(version),
            });
        }

        return packages;
    }

    private parseCargoTomlFile(filePath: string): DetectedPackage[] {
        const content = fs.readFileSync(filePath, "utf-8");
        const cargo = parseToml(content);
        const packages: DetectedPackage[] = [];

        const deps = cargo.dependencies;
        if (!deps || typeof deps !== "object") {
            return packages;
        }

        for (const [name, value] of Object.entries(deps)) {
            let version: string | undefined;

            if (typeof value === "string") {
                version = value;
            } else if (typeof value === "object" && value !== null && "version" in value) {
                version = String(value.version);
            }

            if (version) {
                packages.push({
                    language: "rust",
                    name,
                    version: this.cleanVersion(version),
                });
            }
        }

        return packages;
    }

    private parseCargoLockFile(filePath: string): DetectedPackage[] {
        const content = fs.readFileSync(filePath, "utf-8");
        const lock = parseToml(content) as { package?: unknown[] };
        const packages: DetectedPackage[] = [];

        const pkgs = lock.package;
        if (!Array.isArray(pkgs)) {
            return packages;
        }

        for (const pkg of pkgs) {
            if (typeof pkg !== "object" || pkg === null) continue;
            const p = pkg as Record<string, unknown>;
            const name = p.name;
            const version = p.version;

            if (typeof name === "string" && typeof version === "string") {
                packages.push({
                    language: "rust",
                    name,
                    version: this.cleanVersion(version),
                });
            }
        }

        return packages;
    }

    private cleanVersion(version: string): string {
        return semver.coerce(version)?.version ?? version;
    }

    detectPackages(repoPath: string): DetectedPackage[] {
        const seen = new Set<string>();
        const packages: DetectedPackage[] = [];

        const addPackage = (pkg: DetectedPackage) => {
            const key = `${pkg.language}:${pkg.name}`;
            if (!seen.has(key)) {
                seen.add(key);
                packages.push(pkg);
            }
        };

        // direct dependencies first
        for (const file of this.findFiles(repoPath, "package.json")) {
            for (const pkg of this.parsePackageJsonFile(file)) addPackage(pkg);
        }
        for (const file of this.findFiles(repoPath, "Cargo.toml")) {
            for (const pkg of this.parseCargoTomlFile(file)) addPackage(pkg);
        }

        // then lockfile dependencies (includes transitive)
        for (const file of this.findFiles(repoPath, "bun.lock")) {
            for (const pkg of this.parseBunLockFile(file)) addPackage(pkg);
        }
        for (const file of this.findFiles(repoPath, "package-lock.json")) {
            for (const pkg of this.parseNpmLockFile(file)) addPackage(pkg);
        }
        for (const file of this.findFiles(repoPath, "pnpm-lock.yaml")) {
            for (const pkg of this.parsePnpmLockFile(file)) addPackage(pkg);
        }
        for (const file of this.findFiles(repoPath, "Cargo.lock")) {
            for (const pkg of this.parseCargoLockFile(file)) addPackage(pkg);
        }

        return packages;
    }

    detectPlugins(repoPath: string): DetectedPlugin[] {
        const packages = this.detectPackages(repoPath);
        const detected: DetectedPlugin[] = [];

        for (const manifest of this.manifests) {
            const matchedPackages: DetectedPackage[] = [];

            for (const library of manifest.libraries) {
                const matchingPackage = packages.find(
                    pkg => pkg.language === library.language &&
                           pkg.name === library.package.name
                );
                if (matchingPackage) {
                    matchedPackages.push(matchingPackage);
                }
            }

            if (matchedPackages.length > 0) {
                detected.push({ manifest, matchedPackages });
            }
        }

        return detected;
    }

    generateDependencies(repoPath: string): GameDependency[] {
        const detected = this.detectPlugins(repoPath);

        return detected.map(({ manifest, matchedPackages }) => ({
            name: manifest.name,
            version: matchedPackages[0]?.version ?? manifest.version ?? "1.0.0",
        }));
    }
}
