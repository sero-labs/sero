import { defineConfig } from "astro/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

const here = path.dirname(fileURLToPath(import.meta.url));

// Production homepage for Sero. Static SSG, deploys to Cloudflare Pages
// at https://sero-ai.dev. Docs live separately at https://docs.sero-ai.dev.
export default defineConfig({
	site: "https://sero-ai.dev",
	output: "static",
	trailingSlash: "ignore",
	integrations: [
		react(),
		sitemap(),
	],
	vite: {
		resolve: {
			alias: {
				// Marketing screenshots are sourced from the docs-site library so
				// the site stays grounded in the real product surface.
				"@docs-images": path.resolve(here, "../docs-site/docs/assets/images"),
			},
		},
	},
});
