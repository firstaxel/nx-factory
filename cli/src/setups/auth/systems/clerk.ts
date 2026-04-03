import path from "path";
import { writeFile, ensureDir } from "../../../files.js";
import { scopedPackageName } from "../../../config.js";
import type { AuthPackageScaffolder, AuthPackageOptions } from "../types.js";

export const clerkScaffolder: AuthPackageScaffolder = {
	label: "Clerk",

	dependencies: {
		"@clerk/nextjs": "latest",
		"@clerk/clerk-react": "latest",
		"@clerk/remix": "latest",
		"@clerk/clerk-expo": "latest",
	},

	devDependencies: {
		"@types/react": "^19.0.0",
	},

	peerDependencies: {
		react: "^18 || ^19",
		"react-dom": "^18 || ^19",
	},

	async scaffold(pkgDir: string, opts: AuthPackageOptions): Promise<void> {
		const authPackageName = scopedPackageName(opts.scope, "auth");

		await ensureDir(path.join(pkgDir, "."));

		// ── /index.ts ──────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "index.ts"),
			`/**
 * ${authPackageName} — Clerk latest setup.
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

		// ── /server.ts ─────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "server.ts"),
			`/**
 * Clerk v6 — server-side helpers.
 * Import in Next.js Server Components, Route Handlers, or Middleware.
 *
 * @example Next.js App Router
 *   import { auth, currentUser } from "${authPackageName}/server";
 *
 *   export default async function Page() {
 *     const { userId } = await auth();
 *     const user = await currentUser();
 *   }
 *
 * @example Route Handler / Remix loader
 *   import { getAuth } from "${authPackageName}/server";
 *   const { userId } = getAuth(req);   // Express / Remix: sync helper
 */

// auth() — returns Promise<{ userId, sessionId, sessionClaims, ... }>
export { auth } from "@clerk/nextjs/server";

// currentUser() — returns full User object or null
export { currentUser } from "@clerk/nextjs/server";

// clerkClient() — factory function (Clerk v6 changed from singleton to factory)
export { clerkClient } from "@clerk/nextjs/server";

// getAuth() — for Express/Remix/Node environments (sync, takes Request)
export { getAuth } from "@clerk/nextjs/server";

// Type helpers
export type {
  User,
  Organization,
  Session,
} from "@clerk/nextjs/server";
`,
		);

		// ── /client.ts ─────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "client.ts"),
			`/**
 * Clerk v6 — client-side hooks and pre-built components.
 * Use in React Client Components, Vite SPAs, or Expo apps.
 *
 * @example
 *   import { useAuth, useUser, UserButton } from "${authPackageName}/client";
 *
 *   function Header() {
 *     const { isSignedIn } = useAuth();
 *     return isSignedIn ? <UserButton /> : <SignInButton />;
 *   }
 */
"use client";

// Hooks
export {
  useAuth,
  useUser,
  useClerk,
  useSession,
  useOrganization,
  useOrganizationList,
  useSignIn,
  useSignUp,
} from "@clerk/nextjs";

// Pre-built UI components
export {
  ClerkProvider,
  SignIn,
  SignUp,
  SignInButton,
  SignUpButton,
  SignOutButton,
  UserButton,
  UserProfile,
  OrganizationProfile,
  OrganizationSwitcher,
  CreateOrganization,
} from "@clerk/nextjs";

// Render helpers
export { SignedIn, SignedOut, Protect } from "@clerk/nextjs";
`,
		);

		// ── /middleware.ts ─────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "middleware.ts"),
			`/**
 * Clerk v6 middleware for Next.js.
 *
 * Clerk v6 uses clerkMiddleware() — authMiddleware() was removed.
 *
 * Quick start — copy into apps/<your-app>/middleware.ts:
 *
 *   import type { NextRequest } from "next/server";
 *   import { authMiddleware, middlewareConfig } from "${authPackageName}/middleware";
 *
 *   export default function middleware(request: NextRequest) {
 *     return authMiddleware(request);
 *   }
 *
 *   export const config = middlewareConfig;
 *
 * Custom public routes:
 *
 *   import { buildMiddleware } from "${authPackageName}/middleware";
 *   export default buildMiddleware(["/", "/about(.*)", "/marketing(.*)"]);
 *   export { middlewareConfig as config } from "${authPackageName}/middleware";
 */
import {
  clerkMiddleware,
  createRouteMatcher,
  type ClerkMiddlewareOptions,
} from "@clerk/nextjs/server";

export const middlewareConfig = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

const defaultPublicPaths = [
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
];

/** Default middleware — protects all routes except the ones above */
export const authMiddleware = clerkMiddleware(
  async (auth, request) => {
    const isPublic = createRouteMatcher(defaultPublicPaths);
    if (!isPublic(request)) await auth.protect();
  },
);

/**
 * Build a middleware with custom public paths.
 *
 * @param publicPaths - Array of path patterns (supports wildcards with (.*))
 * @param options     - Extra Clerk middleware options (e.g. debug: true)
 *
 * @example
 *   export default buildMiddleware(["/", "/marketing(.*)", "/blog(.*)"]);
 */
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

		// ── .env.example ─────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, ".env.example"),
			`# ─── Clerk v6 ────────────────────────────────────────────────────────────────
# Get these from: https://dashboard.clerk.com → your app → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_ME
CLERK_SECRET_KEY=sk_test_REPLACE_ME

# Redirect URLs (optional — Clerk uses these if set)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
`,
		);

		// ── README.md ─────────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "README.md"),
			`# ${authPackageName} — Clerk v6

Shared authentication package powered by [Clerk](https://clerk.com) v6.

> **Clerk v6 notes:** \`authMiddleware\` was removed — use \`clerkMiddleware\` (exported here as \`authMiddleware\` for compatibility). \`clerkClient\` is now a factory function, not a singleton.

## Setup

### 1. Copy env vars to your app
\`\`\`bash
cp packages/auth/.env.example apps/<your-app>/.env.local
# Fill in keys from https://dashboard.clerk.com
\`\`\`

### 2. Add the dependency
\`\`\`json
{ "dependencies": { "${authPackageName}": "workspace:*" } }
\`\`\`

### 3. Wrap your root layout
\`\`\`tsx
// apps/<your-app>/app/layout.tsx
import { ClerkProvider } from "${authPackageName}/client";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html><body>{children}</body></html>
    </ClerkProvider>
  );
}
\`\`\`

### 4. Add the middleware
\`\`\`ts
// apps/<your-app>/middleware.ts
import type { NextRequest } from "next/server";
import { authMiddleware, middlewareConfig } from "${authPackageName}/next";

export default function middleware(request: NextRequest) {
  return authMiddleware(request);
}

export const config = middlewareConfig;
\`\`\`

### 5. Use in your pages
\`\`\`tsx
// Server component
import { auth, currentUser } from "${authPackageName}/server";
const { userId } = await auth();
const user = await currentUser();

// Client component
"use client";
import { useAuth, UserButton, SignedIn, SignedOut } from "${authPackageName}/client";
const { isSignedIn } = useAuth();
\`\`\`

## API

| Sub-path | Key exports |
|---|---|
| \`${authPackageName}/server\` | \`auth()\`, \`currentUser()\`, \`clerkClient()\`, \`getAuth()\` |
| \`${authPackageName}/client\` | \`useAuth\`, \`useUser\`, \`ClerkProvider\`, \`UserButton\`, \`SignedIn\`, \`SignedOut\` |
| \`${authPackageName}/middleware\` | \`authMiddleware\`, \`buildMiddleware()\`, \`middlewareConfig\` |
| \`${authPackageName}/next\` | \`authMiddleware\`, \`buildMiddleware()\`, \`middlewareConfig\` |
`,
		);
	},
};
