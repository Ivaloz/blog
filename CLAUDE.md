# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal blog site for ivalo.eu.org, built with VitePress and deployed to GitHub Pages via GitHub Actions.

## Commands

```bash
pnpm install          # Install dependencies
pnpm docs:dev         # Start dev server (hot reload)
pnpm docs:build       # Production build (output: docs/.vitepress/dist)
pnpm docs:preview     # Preview production build locally
```

## Architecture

- **VitePress 2.0 alpha** static site generator
- **Package manager**: pnpm (lockfile uses pnpm@10.33.0)
- **Site config**: `docs/.vitepress/config.mts` — nav, sidebar, theme
- **Content root**: `docs/` — Markdown files are pages; `index.md` is the homepage
- **Static assets**: `docs/public/` (includes `CNAME` for custom domain)
- **Build output**: `docs/.vitepress/dist` (gitignored)

## Deployment

Push to `main` triggers `.github/workflows/deploy.yml`:
1. Installs pnpm + Node 20
2. Runs `pnpm docs:build`
3. Deploys `docs/.vitepress/dist` to GitHub Pages

Custom domain: `ivalo.eu.org` (via `docs/public/CNAME`).
