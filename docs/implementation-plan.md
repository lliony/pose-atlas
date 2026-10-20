# React + TypeScript + Tailwind CSS + Vite migration

Goal: Deliver a standalone frontend project for the approved Pose Atlas website.
Architecture: React SPA, typed domain functions, independent local/API data adapters. Local demo uses IndexedDB and explicitly labels local sharing. API mode uses the existing same-origin backend contract. Production deployment remains unchanged.
Tech stack: React 19, TypeScript 5, Vite 8, Tailwind CSS 4 (PostCSS integration).

- [x] Move approved UI and sample images into src and public. Remove all framework/server dependencies from the frontend.
- [x] Introduce typed domain and API/local storage modules; test snapshot isolation, print mapping and revision conflicts.
- [x] Use Tailwind utilities and @apply for UI components, retain scoped flip and physical print styles.
- [x] Verify build, local persistence, multi-image upload, draft recovery, local share preview and printing in a browser.
- [x] Document installation, scripts, architecture and API deployment requirements. Package clean source with lockfile, excluding dependencies.
