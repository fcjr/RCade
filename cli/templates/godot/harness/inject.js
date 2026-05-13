// Injects rcade-input.js into Godot's exported index.html.
// Run after `npm run build` and after Godot has exported to ../web-export/.
import { readFileSync, writeFileSync } from "fs";

const htmlPath = new URL("../web-export/index.html", import.meta.url).pathname;

let html = readFileSync(htmlPath, "utf8");

if (html.includes("rcade-input.js")) {
    console.log("rcade-input.js already injected, skipping.");
    process.exit(0);
}

const tag = `<script type="module" src="./rcade-input.js"></script>`;
html = html.replace("</body>", `  ${tag}\n</body>`);

writeFileSync(htmlPath, html);
console.log("Injected rcade-input.js into web-export/index.html");
