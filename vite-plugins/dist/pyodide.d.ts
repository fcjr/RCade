import type { Plugin } from "vite";
export interface PyodidePluginOptions {
    /** Path to the Python entry file (default: "src/game.py") */
    pythonEntry?: string;
    /** Default dependencies if none specified in Python file */
    defaultDeps?: string[];
}
/**
 * Vite plugin for Pyodide + pygame-ce support in RCade games.
 *
 * Features:
 * - Downloads Python wheels at build time based on PEP 723 dependencies
 * - Bundles Pyodide runtime locally (no CDN at runtime)
 * - Provides `virtual:pyodide-wheels` module with list of downloaded wheels
 *
 * @example
 * ```ts
 * import { defineConfig } from "vite";
 * import { rcadePluginPyodide } from "@rcade/vite-plugins";
 *
 * export default defineConfig({
 *     optimizeDeps: { exclude: ["pyodide"] },
 *     plugins: [rcadePluginPyodide()],
 * });
 * ```
 */
export declare function rcadePluginPyodide(options?: PyodidePluginOptions): Plugin[];
//# sourceMappingURL=pyodide.d.ts.map