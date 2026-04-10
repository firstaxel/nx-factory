import path from "path";
import { writeFile, ensureDir } from "../../../files.js";
import { scopedPackageName } from "../../../config.js";
import type { AuthPackageScaffolder, AuthPackageOptions, AppFramework } from "../types.js";

/**
 * Returns only the Clerk SDK packages actually needed by the detected frameworks.
 * Avoids installing @clerk/remix into a Next.js-only workspace, etc.
 */
function clerkDepsForFrameworks(frameworks: AppFramework[]): Record<string, string> {
	const deps: Record<string, string> = {};
	const set = new Set(frameworks);
	// @clerk/nextjs covers Next.js server + client
	if (set.has("nextjs")) deps["@clerk/nextjs"] = "latest";
	// @clerk/react for Vite SPAs
	if (set.has("vite")) deps["@clerk/react"] = "latest";
	// @clerk/remix for Remix
	if (set.has("remix")) deps["@clerk/remix"] = "latest";
	// @clerk/expo for React Native
	if (set.has("expo")) deps["@clerk/expo"] = "latest";
	// If no frameworks detected yet fall back to the most common one
	if (Object.keys(deps).length === 0) deps["@clerk/nextjs"] = "latest";
	return deps;
}

export const clerkScaffolder: AuthPackageScaffolder = {
	label: "Clerk",

	// Static base deps — framework-specific ones are added in scaffold()
	dependencies: {},

	devDependencies: {
		"@types/react": "^19.0.0",
	},

	peerDependencies: {
		react: "^18 || ^19",
		"react-dom": "^18 || ^19",
	},

	async scaffold(pkgDir: string, opts: AuthPackageOptions): Promise<void> {
		const authPackageName = scopedPackageName(opts.scope, "auth");
		const frameworkDeps = clerkDepsForFrameworks(opts.frameworks);

		// Merge framework-specific deps into package.json (base already written)
		const { default: fs } = await import("fs-extra");
		const pkgPath = path.join(pkgDir, "package.json");
		if (await fs.pathExists(pkgPath)) {
			const pkg = await fs.readJson(pkgPath);
			pkg.dependencies = { ...pkg.dependencies, ...frameworkDeps };
			await fs.writeJson(pkgPath, pkg, { spaces: 2 });
		}

		await ensureDir(path.join(pkgDir, "."));

		// ── index.ts ────────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "index.ts"),
			`/**
 * ${authPackageName} — Clerk auth package.
 *
 * Prefer sub-path imports for tree-shaking:
 *   import { auth, currentUser }  from "${authPackageName}/server"
 *   import { useAuth, UserButton } from "${authPackageName}/client"
 *   import { authMiddleware }      from "${authPackageName}/next"
 */
export * from "./server.js";
export * from "./client.js";
`,
		);

		await writeFile(
			path.join(pkgDir, "next.ts"),
			`/** Next.js adapter for ${authPackageName} (Clerk). */
export {
  authMiddleware,
  buildMiddleware,
  middlewareConfig,
} from "./middleware.js";
`,
		);

		// ── server.ts ──────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "server.ts"),
			`/**
 * Clerk v6 — server-side helpers.
 * Import in Next.js Server Components, Route Handlers, or Middleware.
 */
export { auth } from "@clerk/nextjs/server";
export { currentUser } from "@clerk/nextjs/server";
export { clerkClient } from "@clerk/nextjs/server";
export { getAuth } from "@clerk/nextjs/server";
export type { User, Organization, Session } from "@clerk/nextjs/server";
`,
		);

		// ── client.ts ──────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "client.ts"),
			`/**
 * Clerk v6 — client-side hooks and pre-built components.
 * Use in React Client Components, Vite SPAs, or Expo apps.
 */
"use client";

export {
  useAuth,
  useUser,
  useClerk,
  useSession,
  useOrganization,
  useSignIn,
  useSignUp,
} from "@clerk/nextjs";

export {
  ClerkProvider,
  SignIn,
  SignUp,
  SignInButton,
  SignUpButton,
  SignOutButton,
  UserButton,
  UserProfile,
  SignedIn,
  SignedOut,
  Protect,
} from "@clerk/nextjs";
`,
		);

		// ── middleware.ts ───────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "middleware.ts"),
			`/**
 * Clerk v6 middleware for Next.js.
 *
 * Quick start — copy into apps/<your-app>/middleware.ts:
 *
 *   import type { NextRequest } from "next/server";
 *   import { authMiddleware, middlewareConfig } from "${authPackageName}/next";
 *
 *   export default function middleware(req: NextRequest) {
 *     return authMiddleware(req);
 *   }
 *   export const config = middlewareConfig;
 */
import {
  clerkMiddleware,
  createRouteMatcher,
  type ClerkMiddlewareOptions,
} from "@clerk/nextjs/server";

export const middlewareConfig = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

const defaultPublicPaths = ["/", "/sign-in(.*)", "/sign-up(.*)", "/api/webhooks(.*)"];

export const authMiddleware = clerkMiddleware(async (auth, request) => {
  const isPublic = createRouteMatcher(defaultPublicPaths);
  if (!isPublic(request)) await auth.protect();
});

export function buildMiddleware(
  publicPaths: string[],
  options?: ClerkMiddlewareOptions,
) {
  const isPublic = createRouteMatcher(publicPaths);
  return clerkMiddleware(async (auth, request) => {
    if (!isPublic(request)) await auth.protect();
  }, options);
}
`,
		);

		// ── .env.example ───────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, ".env.example"),
			`# Clerk v6 — get from https://dashboard.clerk.com → your app → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_ME
CLERK_SECRET_KEY=sk_test_REPLACE_ME

NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
`,
		);

		// ── README.md ───────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "README.md"),
			`# ${authPackageName} — Clerk v6

Shared authentication package powered by [Clerk](https://clerk.com) v6.

## Installed packages
${Object.keys(frameworkDeps).map((d) => `- \`${d}\``).join("\n")}

## Quick setup

\`\`\`bash
cp packages/auth/.env.example apps/<your-app>/.env.local
\`\`\`

\`\`\`tsx
// apps/<your-app>/app/layout.tsx
import { ClerkProvider } from "${authPackageName}/client";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <ClerkProvider><html><body>{children}</body></html></ClerkProvider>;
}
\`\`\`

| Sub-path | Exports |
|---|---|
| \`${authPackageName}/server\` | \`auth()\`, \`currentUser()\`, \`clerkClient()\`, \`getAuth()\` |
| \`${authPackageName}/client\` | \`useAuth\`, \`UserButton\`, \`ClerkProvider\`, \`SignedIn\`, \`SignedOut\` |
| \`${authPackageName}/next\` | \`authMiddleware\`, \`buildMiddleware()\`, \`middlewareConfig\` |
`,
		);
	},
};
