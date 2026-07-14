import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/testing.ts"],
  // ESM-only: the store is module-level singleton state, so shipping a CJS
  // copy alongside would invite the dual package hazard (two stores when an
  // app mixes import and require paths). Node 20.19+ / 22.12+ can
  // require(esm), so CJS consumers still resolve the ESM build.
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  // The bundle contains client components (ModalProvider, hooks). Shipping the
  // directive lets Next.js App Router consumers import them from Server
  // Components without writing their own client wrapper file.
  banner: { js: '"use client";' },
  external: ["react", "react/jsx-runtime"],
});
