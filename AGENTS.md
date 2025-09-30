# Repository Guidelines

## Project Structure & Module Organization
Source modules live in `src/`, with `src/index.js` loading global styles from `src/index.scss` and mounting into `src/index.html`. Store playback frames under `public/imgs` using zero-padded names such as `takasaki_0042.jpeg`; other static assets belong in `public/`. Build output is emitted to `dist/` and remains untracked. Limit configuration changes to `vite.config.js` so the Vite toolchain stays predictable.

## Build, Test, and Development Commands
Run `npm install` once per environment to hydrate `node_modules/`. Use `npm run dev` for a hot-reload dev server while iterating on frame sequences. `npm run build` compiles the production bundle and surfaces bundler warnings. Inspect the built bundle locally with `npm run preview`. Deploy to GitHub Pages via `npm run deploy`; confirm the working tree is clean and GitHub credentials are valid first.

## Coding Style & Naming Conventions
Author modern ES modules with two-space indentation in JavaScript and SCSS, and four spaces in HTML templates. Favor declarative helpers over globals. Name JavaScript variables in camelCase, SCSS tokens with `$snake_case`, and asset sequences with descriptive prefixes such as `playerFrame_####.jpeg`. Reuse existing SCSS variables instead of hardcoding colors. Document any new formatters or linters and wire them through an npm script.

## Testing Guidelines
No automated harness is bundled yet. Manually vet changes by running `npm run dev`, cycling through playback controls, and watching the console for runtime warnings. After a successful production build, launch `npm run preview` and confirm frames load from `/imgs/`. If you add tests, expose the runner through `npm test` and note the expected coverage in your PR description.

## Commit & Pull Request Guidelines
Write concise, present-tense commit messages (e.g., `Add frame preloader`). Squash local fixups before sharing. PRs should summarize the change, list manual verification steps, and attach screenshots or short GIFs when UI behavior shifts. Reference related work with `Fixes #123` and request a review prior to merge.
