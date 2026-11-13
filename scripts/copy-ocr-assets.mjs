import fs from "fs";
import path from "path";

const root = process.cwd();
const outDir = path.join(root, "public", "tesseract");

fs.mkdirSync(outDir, { recursive: true });

const filesToCopy = [
  {
    src: path.join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"),
    dest: path.join(outDir, "worker.min.js"),
  },
  {
    src: path.join(root, "node_modules", "tesseract.js-core", "tesseract-core-lstm.wasm.js"),
    dest: path.join(outDir, "tesseract-core-lstm.wasm.js"),
  },
  {
    src: path.join(root, "node_modules", "tesseract.js-core", "tesseract-core-simd-lstm.wasm.js"),
    dest: path.join(outDir, "tesseract-core-simd-lstm.wasm.js"),
  },
  {
    src: path.join(root, "node_modules", "tesseract.js-core", "tesseract-core-relaxedsimd-lstm.wasm.js"),
    dest: path.join(outDir, "tesseract-core-relaxedsimd-lstm.wasm.js"),
  },
];

for (const item of filesToCopy) {
  if (fs.existsSync(item.src)) {
    fs.copyFileSync(item.src, item.dest);
  }
}

console.log("OCR worker & core assets prepared in public/tesseract/");
