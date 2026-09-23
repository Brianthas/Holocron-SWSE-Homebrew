import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * The build stamp identifies one build. It is compiled into holocron.mjs as CONFIG.HOLOCRON.buildId
 * and written to dist/build.json, so tools/verify-live.ts can check that the file Foundry serves and
 * the code the client runs are both this build.
 */
const sha = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "nogit";
  }
})();
const BUILD_ID = `${sha}-${Date.now()}`;

function buildStamp(): Plugin {
  return {
    name: "holocron-build-stamp",
    writeBundle(options) {
      const dir = options.dir ?? resolve("dist");
      writeFileSync(resolve(dir, "build.json"), `${JSON.stringify({ buildId: BUILD_ID })}\n`);
    },
  };
}

export default defineConfig({
  // static/ holds system.json, lang, templates, fonts and icons, copied as-is to dist/.
  publicDir: "static",
  define: {
    __HOLOCRON_BUILD__: JSON.stringify(BUILD_ID),
  },
  build: {
    outDir: "dist",
    // dist/packs holds compiled LevelDB packs that Foundry locks while running; never wipe the folder.
    emptyOutDir: false,
    sourcemap: true,
    target: "es2023",
    minify: false,
    lib: {
      entry: resolve("src/holocron.ts"),
      formats: ["es"],
      fileName: () => "holocron.mjs",
      cssFileName: "holocron",
    },
  },
  plugins: [buildStamp()],
});
