# nx-factory-cli

A TypeScript CLI that spins up a production-ready **Nx monorepo** with a shared UI package powered by **shadcn/ui** and **Tailwind v4** — ready for any number of apps to consume.

---

## Features

| Feature | Details |
|---|---|
| 🏗️ Nx workspace | `ts` preset, apps/ + packages/ layout |
| 🎨 Shared UI package | `packages/ui` — built with tsup, exported as ESM |
| 💅 Tailwind v4 | CSS-first config, `@import "tailwindcss"`, full dark mode tokens |
| 🧩 shadcn/ui | `new-york` style, CSS variables, any component on demand |
| 📦 Multi-app | Add Next.js or Vite/React apps that all import the same components |
| 🔄 Extendable | Add components any time with `add-component` |

---

## Install

```bash
# From npm (after publishing)
npm install -g nx-factory-cli

# Or run directly
npx nx-factory-cli init
```

### Local development

```bash
git clone <this-repo>
cd nx-factory-cli
pnpm install
pnpm dev init             # runs the CLI in dev mode
```

---

## Commands

### `nx-factory-cli init`

Interactively initializes a new Nx monorepo.

```bash
nx-factory-cli init
# or with flags:
nx-factory-cli init --name my-design-system --pkg-manager pnpm
```

**Prompts you for:**
- Workspace name
- Package manager (pnpm / npm / yarn / bun)
- Shared UI package name (default: `ui`)
- Which shadcn components to pre-install
- Whether to scaffold an example Next.js app

**What it creates:**

```
my-monorepo/
├── nx.json
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── apps/
│   └── example-app/              # (optional Next.js starter)
│       ├── src/app/
│       ├── next.config.ts
│       └── package.json
└── packages/
    └── ui/
        ├── components.json        # shadcn config
        ├── tsup.config.ts         # builds to dist/
        ├── package.json           # @workspace/ui
        └── src/
            ├── index.ts           # barrel exports
            ├── lib/utils.ts       # cn() helper
            ├── styles/globals.css # Tailwind v4 CSS
            └── components/ui/    # shadcn components live here
```

---

### `nx-factory-cli add-app`

Scaffolds a new app inside `apps/` that's pre-wired to import from your shared UI package.

```bash
nx-factory-cli add-app
# or with flags:
nx-factory-cli add-app --name dashboard --framework nextjs
nx-factory-cli add-app --name marketing --framework vite
```

**Supported frameworks:**
- `nextjs` — Next.js 15 (App Router)
- `vite` — Vite 6 + React 19

The new app will automatically have:
- `@workspace/ui` in its `dependencies`
- CSS imported from `@workspace/ui/styles`
- `transpilePackages` (Next.js) or `@tailwindcss/vite` (Vite) configured

---

### `nx-factory-cli add-component`

Adds one or more shadcn components to the shared UI package and **automatically updates the barrel export** in `src/index.ts`.

```bash
# Interactive picker
nx-factory-cli add-component

# Or pass component names directly
nx-factory-cli add-component button card dialog
nx-factory-cli add-component data-table
```

After running, import in any app:

```tsx
import { Button, Card, Dialog } from "@workspace/ui";
```

---

## Monorepo structure & import flow

```
apps/my-app
  ↓ imports
@workspace/ui          (packages/ui)
  ↓ built by tsup
  ↓ exports components via dist/index.js
  ↓ exports CSS via src/styles/globals.css
```

### Consuming the UI package

**In a Next.js app:**

```tsx
// src/app/layout.tsx
import "@workspace/ui/styles";        // Tailwind + shadcn tokens
import { Button } from "@workspace/ui";
```

**In a Vite app:**

```tsx
// src/main.tsx
import "@workspace/ui/styles";
import { Button } from "@workspace/ui";
```

---

## Building

Build the UI package before apps can import from it:

```bash
# From monorepo root
pnpm nx build @workspace/ui

# Or inside packages/ui
pnpm build

# Watch mode during development
pnpm build:watch
```

Nx caches builds, so if nothing changed, it won't rebuild.

---

## Adding a new component manually

1. Create `packages/ui/src/components/ui/my-component.tsx`
2. Export it from `packages/ui/src/index.ts`:

```ts
export { MyComponent, type MyComponentProps } from "./components/ui/my-component";
```

3. Rebuild: `pnpm nx build @workspace/ui`
4. Use it: `import { MyComponent } from "@workspace/ui"`

---

## Tailwind v4 in apps

Tailwind v4 uses a CSS-first config. The shared CSS file exports design tokens via CSS variables. Apps don't need a `tailwind.config.js` — just import the CSS:

```css
/* Your app's globals.css */
@import "@workspace/ui/styles";   /* gets all tokens */
/* Add app-specific overrides below */
```

To add app-specific colors or extend the theme, use `@theme` in your app's CSS:

```css
@theme {
  --color-brand: oklch(0.6 0.2 250);
}
```

---

## Tech stack

- **Nx** — monorepo tooling, task orchestration, caching
- **tsup** — fast ESM bundler for the UI package
- **shadcn/ui** — copy-and-own component primitives (Radix UI based)
- **Tailwind v4** — CSS-first, no config file needed
- **TypeScript** — strict mode throughout
- **inquirer** — interactive prompts
- **commander** — CLI argument parsing
- **execa** — subprocess management
- **ora** — spinners
- **chalk** — terminal colors

---

## Extending the CLI

The CLI is designed to be extended. Add new commands in `src/commands/` and register them in `src/index.ts`:

```ts
program
  .command("my-command")
  .description("Does something useful")
  .action(myCommand);
```

---

## License

MIT
