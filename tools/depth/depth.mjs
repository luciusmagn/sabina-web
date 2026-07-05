/* Bakes monocular depth maps for the ring covers.
   Usage: node depth.mjs <input image> <output png> [more pairs...]
   White = near, black = far (Depth-Anything V2 small, ONNX on CPU). */

import { pipeline, RawImage } from "@huggingface/transformers";

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2) {
  console.error("usage: node depth.mjs <in> <out> [<in> <out> ...]");
  process.exit(1);
}

console.log("loading depth-anything-v2-small…");
const estimate = await pipeline("depth-estimation", "onnx-community/depth-anything-v2-small", {
  dtype: "fp32",
});

for (let i = 0; i < args.length; i += 2) {
  const [inPath, outPath] = [args[i], args[i + 1]];
  const img = await RawImage.read(inPath);
  const { depth } = await estimate(img);
  const resized = await depth.resize(img.width, img.height);
  await resized.save(outPath);
  console.log(`${inPath} -> ${outPath} (${img.width}x${img.height})`);
}
