import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

// The drawing reader loads OpenCV.js from the bundle, but Tesseract.js and pdf.js fetch their worker, wasm and language files at run time.
// The CSP allows no CDN, so those files are copied from node_modules into client/public/ocr on every build and dev start. The folder is gitignored.
function copyOcrAssets(): Plugin {
  return {
    name: "project-os-ocr-assets",
    buildStart() {
      const require = createRequire(import.meta.url);
      const tesseractDir = path.dirname(require.resolve("tesseract.js/package.json"));
      const coreDir = path.dirname(require.resolve("tesseract.js-core/package.json", { paths: [tesseractDir] }));
      const engData = path.join(path.dirname(require.resolve("@tesseract.js-data/eng/package.json")), "4.0.0_best_int", "eng.traineddata.gz");
      const pdfWorker = path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
      const out = path.resolve(import.meta.dirname, "client", "public", "ocr");
      mkdirSync(path.join(out, "core"), { recursive: true });
      mkdirSync(path.join(out, "lang"), { recursive: true });
      copyFileSync(path.join(tesseractDir, "dist", "worker.min.js"), path.join(out, "worker.min.js"));
      for (const file of readdirSync(coreDir)) {
        // the default OEM loads the LSTM core only; the browser picks the SIMD or plain variant itself
        if (/-lstm\.wasm(\.js)?$/.test(file)) copyFileSync(path.join(coreDir, file), path.join(out, "core", file));
      }
      if (!existsSync(engData)) throw new Error("eng.traineddata.gz is missing from @tesseract.js-data/eng");
      copyFileSync(engData, path.join(out, "lang", "eng.traineddata.gz"));
      copyFileSync(pdfWorker, path.join(out, "pdf.worker.min.mjs"));
    },
  };
}

const plugins = [react(), tailwindcss(), jsxLocPlugin(), copyOcrAssets()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
