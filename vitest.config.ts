import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  // Hot reload is only for `tauri dev`; the refresh transform breaks under Vitest.
  plugins: [solid({ hot: false })],
  resolve: {
    // Solid's DOM build is selected through the "browser" condition.
    conditions: ["development", "browser"],
  },
  test: {
    environment: "happy-dom",
  },
});
