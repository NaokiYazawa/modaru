import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // The bundle contains client components (ModalProvider, hooks). Shipping the
  // directive lets Next.js App Router consumers import them from Server
  // Components without writing their own client wrapper file.
  banner: { js: '"use client";' },
  external: ["react", "react/jsx-runtime"],
});
