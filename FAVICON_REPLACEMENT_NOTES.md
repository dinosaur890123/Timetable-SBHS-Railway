# Favicon Files to Replace

The following favicon files contain the atom logo and need to be replaced with new branding using the loop arrow SVG logos.

## New Logo Assets
- **Light mode logo**: `client/public/synchron-loop-arrow-plain.svg` (dark background, white arrow)
- **Dark mode logo**: `client/public/synchron-loop-arrow-negative.svg` (white background, dark arrow)

## BrandMark Component Implementation
The BrandMark component in `client/src/components/modern/ModernShell.jsx` has been updated to:
- Use the new SVG logos based on theme (light/dark mode)
- Preserve the colored dot at the bottom-right corner
- Apply to navbar, topbar, and landing page

The colored dot is positioned using CSS: `absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full bg-accent ring-2 ring-m-page`

## Favicon Generation Instructions
To generate new favicons from the SVG logos:

1. **Use the SVG logos as source**:
   - For light mode favicons: `synchron-loop-arrow-negative.svg`
   - For dark mode favicons: `synchron-loop-arrow-plain.svg`

2. **Generate favicon variants** using a tool like:
   - [RealFaviconGenerator](https://realfavicongenerator.net/)
   - [Favicon.io](https://favicon.io/)
   - ImageMagick or other CLI tools

3. **Replace the following files**:

### Production Favicons (client/public/)
- favicon.ico
- favicon-16x16.png
- favicon-16x16-light.png
- favicon-16x16-dark.png
- favicon-32x32.png
- favicon-48x48.png
- favicon-96x96.png
- apple-touch-icon.png
- android-icon-192x192.png
- android-icon-512x512.png
- maskable-icon-192x192.png
- maskable-icon-512x512.png
- ms-icon-144x144.png

### Apple Touch Icons (client/public/)
- apple-icon-57x57.png
- apple-icon-60x60.png
- apple-icon-72x72.png
- apple-icon-76x76.png
- apple-icon-114x114.png
- apple-icon-120x120.png
- apple-icon-144x144.png
- apple-icon-152x152.png
- apple-icon-180x180.png

### General Icons (client/public/)
- icon-560x560.png
- icon-1024x1024.png
- icon-1200x1200.png
- icon-1500x1500.png

### Development Favicons (client/public/dev-*)
- dev-favicon.ico
- dev-favicon-16x16.png
- dev-favicon-32x32.png
- dev-favicon-48x48.png
- dev-favicon-96x96.png
- dev-favicon.png
- dev-apple-touch-icon.png
- dev-android-icon-192x192.png
- dev-android-icon-512x512.png
- dev-icon-560x560.png
- dev-icon-1024x1024.png
- dev-icon-1200x1200.png
- dev-ms-icon-144x144.png
- dev-apple-icon-*.png (all sizes)

### Staging Favicons (client/public/staging-*)
- staging-favicon.ico
- staging-favicon-16x16.png
- staging-favicon-32x32.png
- staging-favicon-48x48.png
- staging-favicon-96x96.png
- staging-favicon.png
- staging-apple-touch-icon.png
- staging-android-icon-192x192.png
- staging-android-icon-512x512.png
- staging-icon-560x560.png
- staging-icon-1024x1024.png
- staging-icon-1200x1200.png
- staging-ms-icon-144x144.png
- staging-apple-icon-*.png (all sizes)

### Remote Production URLs (client/index.html lines 8-9)
These are hosted on Cloudflare R2 and also need to be replaced:
- https://pub-cea38733e1c8419caa7f81d6a2b2ec08.r2.dev/c5854aac-eb00-4f89-9fdc-bcb33ebfae1f/generated/favicon-32x32.png
- https://pub-cea38733e1c8419caa7f81d6a2b2ec08.r2.dev/c5854aac-eb00-4f89-9fdc-bcb33ebfae1f/generated/apple-touch-icon.png

## Note
The "Synchron" name remains unchanged throughout the application. Only the visual logo element has been replaced with the new loop arrow design.
