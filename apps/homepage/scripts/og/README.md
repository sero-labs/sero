# OG image + apple-touch-icon source

These two HTML files are the rasterization sources for two static brand
assets in `apps/homepage/public/`:

| Source | Output | Size | Used as |
|---|---|---|---|
| `og-card.html` | `public/og-image.png` | 1200×630 | Open Graph + Twitter card |
| `touch-icon.html` | `public/apple-touch-icon.png` | 180×180 | iOS home-screen icon |

## Re-rendering after a brand tweak

If the phoenix emblem, the `Sero` word-mark, or the brand palette changes,
re-render both PNGs:

```bash
cd apps/homepage
playwright-cli open file://$(pwd)/scripts/og/og-card.html
playwright-cli resize 1200 630
playwright-cli screenshot --filename=public/og-image.png

playwright-cli open file://$(pwd)/scripts/og/touch-icon.html
playwright-cli resize 180 180
playwright-cli screenshot --filename=public/apple-touch-icon.png

playwright-cli close
```

The HTML files inline the same SVGs used in `src/components/brand/SeroBrand.tsx`,
so the rasterized output stays visually consistent with the live site.
