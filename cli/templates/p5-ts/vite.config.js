import { defineConfig } from "vite";

export default defineConfig({
    publicDir: "public",
    build: {
        assetsInlineLimit: 0,
    },
});
