import { defineConfig } from "vite";
import { rcadePluginPyodide } from "@rcade/vite-plugins";

export default defineConfig({
    optimizeDeps: { exclude: ["pyodide"] },
    plugins: [rcadePluginPyodide()],
});
