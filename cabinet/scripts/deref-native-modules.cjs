// Replace bun's symlinked native modules with real copies so
// electron-builder can pack them into the asar/AppImage.

const fs = require("fs");
const path = require("path");

const nativeModules = ["node-hid", "pkg-prebuilds"];

module.exports = async function (context) {
  const nodeModulesDir = path.join(context.appOutDir, "node_modules");

  for (const mod of nativeModules) {
    const modPath = path.join(nodeModulesDir, mod);
    let stat;
    try {
      stat = fs.lstatSync(modPath);
    } catch {
      continue; // module not installed
    }
    if (stat.isSymbolicLink()) {
      const realPath = fs.realpathSync(modPath);
      fs.rmSync(modPath);
      fs.cpSync(realPath, modPath, { recursive: true });
      console.log(`deref-native-modules: ${mod} symlink replaced with copy`);
    }
  }
};
