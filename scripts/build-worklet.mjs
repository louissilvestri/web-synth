// Bundles the AudioWorklet processor (TypeScript, shared engine modules) into
// a single plain-JS file that AudioContext.audioWorklet.addModule() can load.
// Runs automatically before `next dev` / `next build` (predev/prebuild).
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("public/worklet", { recursive: true });
await build({
  entryPoints: ["engine/worklet/processor.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  outfile: "public/worklet/processor.js",
  logLevel: "info",
});
