import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Mockups app — dark-theme landing page design variants for Sero.
// Static screenshot assets are loaded from the docs-site image library so
// the marketing surface stays grounded in the real product.
export default defineConfig({
	plugins: [react()],
	server: {
		port: 5180,
		strictPort: false,
	},
	resolve: {
		alias: {
			"@docs-images": path.resolve(
				__dirname,
				"../docs-site/docs/assets/images",
			),
		},
	},
});
