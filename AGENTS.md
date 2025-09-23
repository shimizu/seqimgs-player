# Repository Guidelines

## Project Structure & Module Organization
The Vite workspace keeps all source modules under `src/`. Entry point `src/index.js` bootstraps styles from `src/index.scss` and is loaded by `src/index.html`, which also mounts the `#player` container expected by the sequence player. Static assets live in `public/`; sequential frames must be stored in `public/imgs` using zero-padded names such as `takasaki_0042.jpeg`. Build artefacts are emitted to `dist/` (ignored by git). Configuration tweaks belong in `vite.config.js`.

## Build, Test, and Development Commands
Run `npm install` once to populate `node_modules/`. Use `npm run dev` to launch the hot-reload development server. `npm run build` performs a production build and prints any bundling issues. `npm run preview` serves the built `dist/` bundle for smoke-testing before deployment. `npm run deploy` publishes `dist/` to GitHub Pages via `gh-pages -d dist`; ensure your branch is clean and you are authenticated before running it.

## Coding Style & Naming Conventions
Write modern ES modules and prefer declarative functions over globals. Follow two-space indentation in JavaScript and SCSS, and four spaces in HTML templates, mirroring the existing files. Name variables in camelCase, SCSS variables with `$snake_case`, and keep asset prefixes descriptive (`playerFrame_####.jpeg`). When adding styles, group related rules and re-use existing SCSS variables rather than hardcoding colors. If you introduce formatters, document them in this file and wire them through an npm script.

## Testing Guidelines
No automated harness ships yet. Before opening a PR, validate your change by running `npm run dev`, exercising the playback controls, and verifying the sequential image flow without dropped frames. Capture browser console output for regressions. After `npm run build`, open `npm run preview` and confirm assets load from `/imgs/`. If you add tests, include the script (`npm test`) and explain the expected coverage in the PR.

## Commit & Pull Request Guidelines
Write concise, present-tense commit messages (e.g., `プレイヤー初期化修正` or `Add frame preloader`). Squash trivial fixes locally. Pull requests must describe the change, list manual verification steps, and attach screenshots or short GIFs when UI behavior changes. Link related issues with `Fixes #123`. Request review before merging.
