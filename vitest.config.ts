import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Store/factory tests run in node; rendering tests opt into happy-dom
    // with a `// @vitest-environment happy-dom` directive per file.
    environment: "node",
  },
});
