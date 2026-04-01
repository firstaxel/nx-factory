# nx-factory

> Scaffold production-ready Nx monorepos with shared UI, Tailwind v4, shadcn/ui, and auth — from a single CLI.

<div align="center">

[![npm version](https://img.shields.io/npm/v/nx-factory-cli ?color=7c3aed&labelColor=1a1a2e)](https://www.npmjs.com/package/nx-factory-cli )
[![npm downloads](https://img.shields.io/npm/dm/nx-factory-cli ?color=7c3aed&labelColor=1a1a2e)](https://www.npmjs.com/package/nx-factory-cli )
[![license](https://img.shields.io/npm/l/nx-factory-cli ?color=7c3aed&labelColor=1a1a2e)](./LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/firstaxel/nx-factory/publish.yml?label=CI&color=7c3aed&labelColor=1a1a2e)](https://github.com/firstaxel/nx-factory/actions)

**[Documentation](https://nx-factory.vercel.app/)** · **[npm](https://www.npmjs.com/package/nx-factory-cli )** · **[Changelog](#changelog)**

</div>

---

## What is nx-factory?

nx-factory-cli is a CLI that bootstraps and manages a fully wired **Nx monorepo**. Instead of spending hours connecting Nx, shadcn/ui, Tailwind v4, auth, and multiple apps together, you answer a few prompts and get a workspace that is ready to build.

```
my-monorepo/
├── apps/
│   ├── web/          ← Next.js, Vite, Remix, or Expo
│   └── dashboard/    ← another app, same shared UI
└── packages/
    ├── ui/           ← shared shadcn/ui + Tailwind v4
    └── auth/         ← shared Clerk / Better Auth / WorkOS
```

Every app in `apps/` imports from `@workspace/ui` and `@workspace/auth`. You add a component once and it is available everywhere.

---

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
- [CLI commands](#cli-commands)
  - [init](#nx-factory-init)
  - [add-app](#nx-factory-add-app)
  - [add-auth](#nx-factory-add-auth)
  - [add-component](#nx-factory-add-component)
  - [remove-component](#nx-factory-remove-component)
  - [update](#nx-factory-update)
  - [add-lib](#nx-factory-add-lib)
  - [add-storybook](#nx-factory-add-storybook)
  - [publish](#nx-factory-publish)
  - [list](#nx-factory-list)
  - [doctor](#nx-factory-doctor)
- [Monorepo architecture](#monorepo-architecture)
- [Auth packages](#auth-packages)
- [Tailwind v4](#tailwind-v4)
- [Publishing to npm](#publishing-to-npm)
- [Docs site](#docs-site)
- [Contributing](#contributing)
- [License](#license)

---

## Install

```bash
# Global install (recommended)
npm install -g nx-factory-cli

# Or run without installing
npx nx-factory-cli init
```

**Requirements:** Node.js ≥ 18

---

## Quick start

```bash
# 1. Bootstrap a new monorepo
npx nx-factory-cli init

# 2. Add your first app
nx-factory-cli add-app

# 3. Add authentication
nx-factory-cli add-auth

# 4. Add shadcn/ui components
nx-factory-cli add-component button card dialog input
```

That is it. Your workspace is running with shared UI and auth wired across every app.

---

## CLI commands

Every command supports two universal flags:

| Flag | Description |
|---|---|
| `--dry-run` | Preview every file that would be written without touching disk |
| `--yes` / `-y` | Skip all interactive prompts and use defaults |

---

### `nx-factory-cli init`

Bootstrap a brand-new Nx monorepo from scratch.

```bash
nx-factory-cli init
nx-factory-cli init --name my-design-system --pkg-manager pnpm
nx-factory-cli init --yes   # all defaults, no prompts
nx-factory-cli init --dry-run
```

**Interactive prompts:**

| Prompt | Default |
|---|---|
| Workspace name | `my-monorepo` |
| Package manager | `pnpm` |
| Shared UI package name | `ui` |
| Base color theme | `neutral` |
| Pre-install shadcn/ui components | _(none)_ |
| Scaffold an example Next.js app? | yes |

**What gets created:**

```
my-monorepo/
├── nx.json
├── package.json
├── pnpm-workspace.yaml          # (or npm/yarn/bun equivalent)
├── tsconfig.base.json
├── nx-factory.config.json       # CLI config — read by every command
├── apps/
│   └── example-app/             # optional Next.js 15 starter
└── packages/
    └── ui/
        ├── components.json      # shadcn/ui config
        ├── tsup.config.ts       # builds to dist/
        ├── package.json         # name: @workspace/ui
        └── src/
            ├── index.ts         # barrel exports
            ├── lib/utils.ts     # cn() helper
            ├── styles/
            │   └── globals.css  # Tailwind v4 + shadcn tokens
            └── components/
                └── ui/          # shadcn components live here
```

---

### `nx-factory-cli add-app`

Scaffold a new app inside `apps/` that is pre-wired to import from `@workspace/ui`.

```bash
nx-factory-cli add-app
nx-factory-cli add-app --name dashboard --framework nextjs
nx-factory-cli add-app --name mobile --framework expo
nx-factory-cli add-app --dry-run
```

**Supported frameworks:**

| Value | Scaffold |
|---|---|
| `nextjs` | Next.js 15 — App Router, TypeScript, Tailwind |
| `vite` | Vite 6 + React 19 + TypeScript |
| `remix` | Remix — Vite-based, TypeScript |
| `expo` | Expo — blank TypeScript template + NativeWind |

**What gets wired automatically:**

- `@workspace/ui` added to `dependencies` with the correct workspace protocol
- Styles imported from `@workspace/ui/styles/globals.css`
- `transpilePackages` patched in `next.config.ts` (Next.js)
- `@tailwindcss/vite` added and configured (Vite / Remix)
- `tsconfig.json` extended from `tsconfig.base.json` with `@workspace/*` path alias

> **Note (Expo):** Expo apps use NativeWind for styling. shadcn/ui components are web-only and are not available in Expo apps.

---

### `nx-factory-cli add-auth`

Create `packages/auth` — a monorepo-native auth package that every app imports from. You choose one provider and all apps get the same consistent API.

```bash
nx-factory-cli add-auth
nx-factory-cli add-auth --provider clerk
nx-factory-cli add-auth --provider better-auth
nx-factory-cli add-auth --provider workos
nx-factory-cli add-auth --dry-run
```

**Supported providers:**

| Provider | Best for |
|---|---|
| **Clerk** | Fast setup. Pre-built sign-in/up UI, webhooks, organizations, MFA. Generous free tier. |
| **Better Auth** | Full control. Open-source, self-hosted, works with any database (SQLite, PostgreSQL, MySQL, Prisma, Drizzle). |
| **WorkOS AuthKit** | B2B SaaS. Enterprise SSO (SAML/OIDC), SCIM directory sync, MFA, hosted auth UI. |

**What gets created:**

```
packages/auth/
├── package.json        # @workspace/auth — three named sub-paths
├── tsconfig.json
├── tsup.config.ts
├── .env.example        # all required env vars documented
├── README.md           # provider-specific usage guide
└── src/
    ├── index.ts        # top-level barrel
    ├── server.ts       # server-only helpers (auth(), getUser(), withAuth())
    ├── client.ts       # "use client" hooks and components
    └── middleware.ts   # Next.js middleware + buildMiddleware()
```

**Importing in your apps:**

```ts
// Server components, route handlers, middleware
import { auth, currentUser }    from '@workspace/auth/server';

// Client components
import { useAuth, UserButton }  from '@workspace/auth/client';

// Next.js middleware.ts
export { authMiddleware as default, middlewareConfig as config }
  from '@workspace/auth/middleware';
```

The command also asks which apps to wire — it adds `"@workspace/auth": "workspace:*"` to each selected app's `package.json` so you just run `pnpm install` once.

---

### `nx-factory-cli add-component`

Add one or more shadcn/ui components to `packages/ui` and automatically update the barrel export in `src/index.ts`.

```bash
# Interactive component picker
nx-factory-cli add-component

# Pass component names directly
nx-factory-cli add-component button card dialog
nx-factory-cli add-component data-table calendar combobox

# Preview without writing
nx-factory-cli add-component button --dry-run
```

After running, import anywhere in the monorepo:

```tsx
import { Button, Card, Dialog } from '@workspace/ui';
```

---

### `nx-factory-cli remove-component`

Remove one or more shadcn/ui components from `packages/ui` and clean up their barrel exports.

```bash
nx-factory-cli remove-component
nx-factory-cli remove-component tooltip badge
nx-factory-cli remove-component button --yes    # skip confirmation
nx-factory-cli remove-component tooltip --dry-run
```

---

### `nx-factory-cli update`

Update installed shadcn/ui components to their latest versions.

```bash
# Update all installed components
nx-factory-cli update

# Update specific components only
nx-factory-cli update button card

# Skip confirmation prompts
nx-factory-cli update --yes

# Preview what would change
nx-factory-cli update --dry-run
```

---

### `nx-factory-cli add-lib`

Scaffold a generic shared library in `packages/` — for code that is not UI components but still needs to be shared across apps.

```bash
nx-factory-cli add-lib
nx-factory-cli add-lib --name utils --type utils
nx-factory-cli add-lib --name hooks --type hooks
nx-factory-cli add-lib --name config --type config
```

**Library types:**

| Type | Scaffolds |
|---|---|
| `utils` | Shared helper functions |
| `hooks` | Shared React hooks |
| `config` | Shared config and constants |
| `types` | Shared TypeScript types and interfaces |
| `api` | Shared API client and fetchers |

Each library is created at `packages/<name>/` with `package.json`, `tsconfig.json`, `tsup.config.ts`, and a typed `src/index.ts` starter.

---

### `nx-factory-cli add-storybook`

Add Storybook to the shared UI package with auto-generated stories for every installed component.

```bash
nx-factory-cli add-storybook
nx-factory-cli add-storybook --dry-run
```

Storybook is configured to point at `packages/ui` and comes with component stories pre-generated for every shadcn/ui component you have installed.

---

### `nx-factory-cli publish`

Build and publish `packages/ui` to npm with interactive version bumping and a changelog entry.

```bash
nx-factory-cli publish
nx-factory-cli publish --tag next     # publish as pre-release
nx-factory-cli publish --yes          # skip prompts, patch bump
nx-factory-cli publish --dry-run      # preview without uploading
```

**Steps performed:**

1. Verify npm authentication
2. Prompt for version bump (patch / minor / major)
3. Bump `package.json` version
4. Build the package with `tsup`
5. Append a changelog entry to `CHANGELOG.md`
6. Run `npm publish --access public`

> For automated publishing on every GitHub release, see [Publishing to npm](#publishing-to-npm).

---

### `nx-factory-cli list`

List every installed shadcn/ui component and show which apps are importing each one.

```bash
nx-factory-cli list
```

Output shows component names, their source file locations, and a usage summary across every app in `apps/`.

---

### `nx-factory-cli doctor`

Validate workspace health and automatically fix common issues.

```bash
nx-factory-cli doctor
```

**Checks performed:**

| Check | Auto-fix |
|---|---|
| `nx-factory.config.json` present | — |
| Package manager detected | — |
| `packages/ui` directory exists | — |
| `components.json` present and valid | Fixes relative path aliases → `@workspace/ui/...` |
| Barrel exports in `src/index.ts` | Adds any missing component exports |
| App `tsconfig.json` paths | — |

Run `doctor` if imports stop resolving or after manually editing component files.

---

## Monorepo architecture

```
workspace root
├── apps/
│   ├── web/                  ← imports @workspace/ui, @workspace/auth
│   └── dashboard/            ← imports @workspace/ui, @workspace/auth
└── packages/
    ├── ui/                   ← @workspace/ui
    │   └── src/
    │       ├── index.ts      ← barrel: export { Button } from './components/ui/button'
    │       ├── styles/
    │       │   └── globals.css  ← @import "tailwindcss" + shadcn tokens
    │       └── components/ui/   ← shadcn component files
    └── auth/                 ← @workspace/auth
        └── src/
            ├── server.ts     ← server-only auth helpers
            ├── client.ts     ← client hooks and components
            └── middleware.ts ← Next.js middleware factory
```

**Import resolution** is handled by workspace protocols and TypeScript path aliases set up by the CLI in every app's `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@workspace/*": ["../../packages/*"]
    }
  }
}
```

**Build order** is managed by Nx. When you run `pnpm nx build web`, Nx knows to build `@workspace/ui` first because of the `dependsOn: ["^build"]` target configured in `nx.json`.

---

## Auth packages

The `packages/auth` package exposes three named sub-path exports that map directly to context:

```
@workspace/auth/server      → server components, API routes, loaders
@workspace/auth/client      → client components, hooks (marked "use client")
@workspace/auth/middleware  → Next.js middleware.ts
```

This separation means no server code ever leaks into client bundles and vice versa.

### Clerk setup

```bash
nx-factory-cli add-auth --provider clerk
```

After scaffolding, copy `.env.example` to your app's `.env.local` and fill in your keys from [dashboard.clerk.com](https://dashboard.clerk.com).

```ts
// apps/web/middleware.ts
export { authMiddleware as default, middlewareConfig as config }
  from '@workspace/auth/middleware';

// apps/web/src/app/layout.tsx
import { ClerkProvider } from '@workspace/auth/client';
export default function Layout({ children }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}

// apps/web/src/app/dashboard/page.tsx
import { auth, currentUser } from '@workspace/auth/server';
const { userId } = await auth();
const user = await currentUser();
```

### Better Auth setup

```bash
nx-factory-cli add-auth --provider better-auth
```

1. Open `packages/auth/src/server.ts` and uncomment the database adapter for your stack (PostgreSQL, SQLite, Prisma, Drizzle).
2. Copy `.env.example` → `.env.local` and set `BETTER_AUTH_SECRET`.
3. Add the API route to your app:

```ts
// apps/web/src/app/api/auth/[...all]/route.ts
import { auth }            from '@workspace/auth/server';
import { toNextJsHandler } from 'better-auth/next-js';
export const { GET, POST } = toNextJsHandler(auth.handler);
```

4. Run migrations: `npx better-auth migrate`

### WorkOS setup

```bash
nx-factory-cli add-auth --provider workos
```

1. Copy `.env.example` → `.env.local` and fill in `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, and `WORKOS_COOKIE_PASSWORD`.
2. Add your `WORKOS_REDIRECT_URI` in the [WorkOS dashboard](https://dashboard.workos.com) → Redirects.
3. Add the callback route:

```ts
// apps/web/src/app/callback/route.ts
export { handleAuth as GET } from '@workspace/auth/server';
```

4. Use `withAuth()` for protected pages:

```ts
import { withAuth } from '@workspace/auth/server';
export default withAuth(async function Page({ user }) {
  return <h1>Hello, {user.firstName}</h1>;
});
```

---

## Tailwind v4

nx-factory-cli uses Tailwind v4's CSS-first configuration. There is no `tailwind.config.js` — everything lives in `packages/ui/src/styles/globals.css`.

```css
/* packages/ui/src/styles/globals.css */
@import "tailwindcss";
@import "tw-animate-css";

@source "../**/*.{ts,tsx}";   /* scans UI package + all consuming apps */

@theme inline {
  --color-primary: var(--primary);
  /* ... all shadcn CSS variable mappings */
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  /* ... light theme tokens */
}

.dark {
  /* ... dark theme tokens */
}
```

Apps import this once and get all tokens:

```css
/* apps/web/src/app/globals.css */
@import "@workspace/ui/styles/globals.css";

/* App-specific overrides */
@theme {
  --color-brand: oklch(0.6 0.2 250);
}
```

---

## Publishing to npm

The repo includes a GitHub Actions workflow at `.github/workflows/publish.yml` that automates the full release pipeline.

### How releases work

| Trigger | What happens |
|---|---|
| Push to `main` | Build + typecheck only. No publish. Safe for WIP merges. |
| `git tag v2.1.0 && git push origin v2.1.0` | Build → typecheck → publish as `latest` → create GitHub Release |
| `git tag v2.1.0-beta.1 && git push` | Same but publishes with `--tag beta`, marks release as pre-release |
| Actions tab → Run workflow | Manual publish with configurable dist-tag and dry-run option |

Pre-release suffix detection is automatic: `-beta`, `-next`, `-canary`, and `-alpha` all route to the correct npm dist-tag.

### Setup (one time)

**1. Generate an npm token:**
- [npmjs.com](https://www.npmjs.com) → Account → Access Tokens → Generate New Token
- Type: **Granular** → Publish scope for `nx-factory-cli `

**2. Add it as a GitHub secret:**
- Repo → Settings → Secrets and variables → Actions → New secret
- Name: `NPM_TOKEN`
- Value: your npm token

**3. Create the `npm` environment (recommended):**
- Repo → Settings → Environments → New environment → name it `npm`
- Add required reviewers to prevent accidental publishes

### Publishing a release

```bash
# Bump version and push the tag
npm version patch        # 2.0.6 → 2.0.7
git push origin main --follow-tags

# The tag push triggers the publish job automatically.
# A GitHub Release is created with auto-generated notes from merged PRs.
```

---

## Docs site

The documentation site lives alongside the CLI in the same repository, built with [Fumadocs](https://fumadocs.dev) on TanStack Start.

### Tech stack

| Package | Role |
|---|---|
| [TanStack Start](https://tanstack.com/start) | Full-stack React framework (Vite + SSR) |
| [Fumadocs](https://fumadocs.dev) | Documentation UI, search, MDX processing |
| [Tailwind v4](https://tailwindcss.com) | Styling |
| [Nitro](https://nitro.build) | Server and deployment adapter |

### Running locally

```bash
cd docs
bun install          # or npm install / pnpm install
bun dev              # starts on http://localhost:3000
```

### Project structure

```
docs/
├── content/
│   └── docs/                ← MDX documentation pages
│       ├── index.mdx        ← getting started
│       └── commands/        ← one file per CLI command
├── src/
│   ├── routes/
│   │   ├── index.tsx        ← landing page (home + subscribe + donate)
│   │   └── docs/$.tsx       ← docs layout and page renderer
│   ├── components/
│   │   ├── subscribe-widget.tsx   ← email notification subscription
│   │   ├── donate-section.tsx     ← Ko-fi / GitHub Sponsors / Open Collective
│   │   └── mdx.tsx                ← MDX component overrides
│   └── lib/
│       ├── shared.ts        ← app name, git config, route constants
│       ├── source.ts        ← Fumadocs source loader
│       └── layout.shared.tsx ← shared nav options
├── source.config.ts         ← Fumadocs MDX config
└── vite.config.ts
```

### Writing documentation

Add MDX files to `content/docs/`. Fumadocs picks them up automatically.

```mdx
---
title: My Command
description: What this command does.
icon: Terminal
---

## Usage

```bash
nx-factory-cli my-command --flag value
```
```

Frontmatter fields:

| Field | Description |
|---|---|
| `title` | Page title (shown in sidebar and `<h1>`) |
| `description` | Subtitle shown below the title |
| `icon` | [Lucide](https://lucide.dev) icon name |

### Subscribe widget

The landing page includes a subscription widget at `/`. To activate it, wire up `POST /api/subscribe` in the docs app to your email provider of choice:

```ts
// src/routes/api/subscribe.ts
export async function POST({ request }) {
  const { email } = await request.json();

  // Example: Resend Audiences
  await fetch('https://api.resend.com/audiences/YOUR_ID/contacts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, unsubscribed: false }),
  });

  return Response.json({ ok: true });
}
```

### Donate / support links

Update the links in `src/components/donate-section.tsx`:

```ts
// Ko-fi
href: 'https://ko-fi.com/firstaxel',

// GitHub Sponsors
href: 'https://github.com/sponsors/firstaxel',

// Open Collective
href: 'https://opencollective.com/YOUR_COLLECTIVE',
```

### Deploying

The docs site is pre-configured for Vercel via the Nitro preset in `vite.config.ts`. To deploy:

```bash
bun run build
# deploys .output/ to Vercel / any Nitro-compatible host
```

To switch deployment targets, change the `nitro({ preset: '...' })` option in `vite.config.ts`. Supported presets: `vercel`, `netlify`, `cloudflare-pages`, `node-server`.

---

## Contributing

Contributions are welcome. Here is how to get started:

```bash
git clone https://github.com/firstaxel/nx-factory-cli
cd nx-factory-cli
npm install
npm run dev -- init     # run the CLI in dev mode
```

### Project layout

```
src/
├── index.ts              ← command registration (commander)
├── config.ts             ← nx-factory.config.json read/write
├── exec.ts               ← run(), detectPackageManager(), pm helpers
├── files.ts              ← writeFile(), readJson(), etc.
├── resolve-root.ts       ← resolveMonorepoRoot() — finds workspace root
├── ui.ts                 ← chalk palette, printBanner, printSuccess, etc.
├── commands/
│   ├── init.ts
│   ├── add-app.ts
│   ├── add-auth.ts
│   ├── add-component.ts
│   ├── remove-component.ts
│   ├── update.ts
│   ├── add-lib.ts
│   ├── add-storybook.ts
│   ├── publish.ts
│   ├── list.ts
│   └── doctor.ts
└── auth/
    ├── types.ts           ← AuthPackageScaffolder interface
    ├── package-base.ts    ← shared package.json / tsconfig / tsup scaffold
    ├── clerk.ts           ← Clerk v6 scaffolder
    ├── better-auth.ts     ← Better Auth v1.2+ scaffolder
    ├── workos.ts          ← WorkOS AuthKit v1+ scaffolder
    └── index.ts           ← barrel
```

### Adding a new command

1. Create `src/commands/my-command.ts` and export an async function.
2. Register it in `src/index.ts`:

```ts
import { myCommand } from './commands/my-command.js';

program
  .command('my-command')
  .description('Does something useful')
  .option('--flag <value>', 'Flag description')
  .option('--dry-run', 'Preview without writing')
  .action(myCommand);
```

3. Use `resolveMonorepoRoot()` at the top of your command function so it works from any directory inside the workspace.

### Adding a new auth provider

1. Create `src/auth/my-provider.ts` implementing the `AuthPackageScaffolder` interface from `src/auth/types.ts`.
2. Export it from `src/auth/index.ts`.
3. Add it to the `PROVIDERS` array and `getScaffolder()` switch in `src/commands/add-auth.ts`.

---

## Changelog

### 2.0.6 — current

- Added `add-auth` command — scaffolds `packages/auth` with Clerk v6, Better Auth v1.2, or WorkOS AuthKit v1
- Added `resolveMonorepoRoot()` — CLI now works correctly from any subdirectory in the workspace
- Fixed stray TypeScript imports in auth scaffolder template strings
- Updated Clerk scaffolder to v6 API (`clerkMiddleware`, `auth()` async pattern)
- Updated Better Auth scaffolder to v1.2 API (`auth.handler`, `auth.api.getSession`)
- Updated WorkOS scaffolder to AuthKit v1 API (`getUser()` replaces `getSession()`)
- Added `add-app` support for Remix and Expo
- Added GitHub Actions workflow for automated npm publishing

### 2.0.0

- Tailwind v4 CSS-first configuration
- shadcn/ui `new-york` style
- Multi-app workspace support
- `add-storybook` command
- `publish` command with changelog generation

---

## License

MIT — see [LICENSE](./LICENSE) for details.

---

<div align="center">

Built with care. If nx-factory-cli saves you time, consider [sponsoring](https://github.com/sponsors/firstaxel) or [buying a coffee](https://ko-fi.com/firstaxel).

</div>
