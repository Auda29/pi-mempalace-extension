import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/index.ts", "src/pi-extension.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outdir: "dist",
  external: ["@mariozechner/pi-coding-agent"],
  sourcemap: true,
  minify: false,
});
