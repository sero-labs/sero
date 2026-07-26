import { federation } from "@module-federation/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const forbiddenOutput = [
  /mermaid/i,
  /shiki/i,
  /cytoscape/i,
  /react-jsx-parser/i,
  /streamdown/i,
];

function assertMinimalUiBundle(): Plugin {
  return {
    name: "assert-minimal-ui-bundle",
    generateBundle(_, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        const content =
          output.type === "chunk"
            ? output.code
            : typeof output.source === "string"
              ? output.source
              : new TextDecoder().decode(output.source);
        if (forbiddenOutput.some((pattern) => pattern.test(fileName + content))) {
          throw new Error(`Unrelated UI dependency emitted in ${fileName}`);
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: `sero_ui_consumer_${mode}`,
      filename: "remoteEntry.js",
      dts: false,
      exposes: {
        "./MinimalUiConsumer": "./src/main.tsx",
      },
      shared: {
        react: { singleton: true },
        "react/": { singleton: true },
        "react-dom": { singleton: true },
        "react-dom/": { singleton: true },
      },
    }),
    assertMinimalUiBundle(),
  ],
  resolve: {
    alias:
      mode === "published"
        ? [
            {
              find: /^@sero-ai\/ui$/,
              replacement: resolve("../ui/dist/index.js"),
            },
          ]
        : [],
  },
  build: {
    target: "esnext",
    outDir: `dist/${mode}`,
    emptyOutDir: true,
  },
}));
