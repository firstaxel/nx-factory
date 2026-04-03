import path from "path";
import { writeFile, ensureDir } from "../../../files.js";
import { scopedPackageName } from "../../../config.js";
import type { AuthPackageScaffolder, AuthPackageOptions } from "../types.js";

export const betterAuthScaffolder: AuthPackageScaffolder = {
	label: "Better Auth",

	dependencies: {
		"better-auth": "latest",
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
		const dbPackageName = scopedPackageName(opts.scope, "db");

		await ensureDir(path.join(pkgDir, "."));

		// ── index.ts ──────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "index.ts"),
			`/**
 * ${authPackageName} — Better Auth v1.2+
 *
 * Prefer sub-path imports for tree-shaking:
 *   import { auth }           from "${authPackageName}/server"
 *   import { authClient }     from "${authPackageName}/client"
 *   import { authMiddleware } from "${authPackageName}/next"
 */
export * from "./server.js";
export * from "./client.js";
`,
		);

		// ── server.ts ─────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "server.ts"),
			`/**
 * Better Auth @latest — server instance.
 *
 * This file is the single source of truth for your auth configuration.
     * Import \`auth\` in API routes, server components, and middleware.
 *
 * @example Next.js App Router (Server Component)
 *   import { auth } from "${authPackageName}/server";
 *   import { headers } from "next/headers";
 *
 *   const session = await auth.api.getSession({ headers: await headers() });
 *
 * @example Next.js Route Handler
 *   import { auth } from "${authPackageName}/server";
 *   import { toNextJsHandler } from "better-auth/next-js";
 *   export const { GET, POST } = toNextJsHandler(auth);
 *
 * @example Remix loader
 *   import { auth } from "${authPackageName}/server";
 *   const session = await auth.api.getSession({ headers: request.headers });
 */
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  /**
   * Database adapter.
   *
   * Default: in-memory (development only — data is lost on restart).
   * For production, pick one:
   *
   *   PostgreSQL:
   *     import { pg } from "better-auth/adapters/pg";
   *     database: pg({ connectionString: process.env.DATABASE_URL! }),
   *
   *   MySQL:
   *     import { mysql } from "better-auth/adapters/mysql";
   *     database: mysql({ uri: process.env.DATABASE_URL! }),
   *
   *   SQLite (local dev):
   *     import { sqlite } from "better-auth/adapters/sqlite";
   *     import Database from "better-sqlite3";
   *     database: sqlite(new Database("./dev.db")),
   *
   *   Prisma:
   *     import { prismaAdapter } from "better-auth/adapters/prisma";
   *     import { prisma } from "${dbPackageName}";
   *     database: prismaAdapter(prisma, { provider: "postgresql" }),
   *
   *   Drizzle:
   *     import { drizzleAdapter } from "better-auth/adapters/drizzle";
   *     import { db } from "${dbPackageName}";
   *     database: drizzleAdapter(db, { provider: "pg" }),
   */
  database: undefined as never, // Replace with your adapter

  emailAndPassword: {
    enabled: true,
    // requireEmailVerification: true,
    // sendResetPassword: async ({ user, url }) => { ... },
  },

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  // Social providers (uncomment as needed):
  // socialProviders: {
  //   github: {
  //     clientId:     process.env.GITHUB_CLIENT_ID!,
  //     clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  //   },
  //   google: {
  //     clientId:     process.env.GOOGLE_CLIENT_ID!,
  //     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  //   },
  // },

  // Plugins (uncomment to enable):
  // plugins: [
  //   twoFactor(),         // import { twoFactor } from "better-auth/plugins";
  //   organization(),      // import { organization } from "better-auth/plugins";
  //   admin(),             // import { admin } from "better-auth/plugins";
  //   passkey(),           // import { passkey } from "better-auth/plugins";
  // ],
});

/** Inferred Session type from your auth config */
export type Session = typeof auth.$Infer.Session;
/** Inferred User type from your auth config */
export type User = typeof auth.$Infer.Session.user;
`,
		);

		// ── client.ts ─────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "client.ts"),
			`/**
 * Better Auth v1.2+ — browser client.
 *
 * Works in React Client Components, Vite SPAs, and Expo.
 * Call methods directly on authClient to avoid type inference issues.
 *
 * @example
 *   import { authClient } from "${authPackageName}/client";
 *
 *   // React hook
 *   const { data: session, isPending } = authClient.useSession();
 *
 *   // Sign in with email
 *   const { data, error } = await authClient.signIn.email({ email, password });
 *
 *   // Sign in with OAuth
 *   await authClient.signIn.social({ provider: "github" });
 *
 *   // Update user
 *   await authClient.updateUser({ name: "New Name" });
 *
 *   // Sign out
 *   await authClient.signOut();
 */
"use client";

import { createAuthClient } from "better-auth/react";

export type AuthClient = ReturnType<typeof createAuthClient>;

export const authClient: AuthClient = createAuthClient({
  /**
   * The base URL of your app's auth API.
   * If your auth server is same-origin, you can omit this.
   * For monorepos or separate origins, set it via env.
   */
  baseURL:
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VITE_APP_URL ??
    "http://localhost:3000",
});
`,
		);

		// ── middleware.ts ─────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "middleware.ts"),
			`/**
 * Better Auth v1.2+ — Next.js middleware.
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
 * Custom public paths:
 *
 *   import { buildMiddleware } from "${authPackageName}/middleware";
 *   export default buildMiddleware({ publicPaths: ["/", "/about(.*)"] });
 *   export { middlewareConfig as config } from "${authPackageName}/middleware";
 */
import { auth } from "./server.js";

type MiddlewareRequest = {
  nextUrl: { pathname: string };
  url: string;
  headers: any;
};

const DEFAULT_PUBLIC_PATHS = [
  "/",
  "/sign-in",
  "/sign-up",
  "/api/auth", // Better Auth's own handler
  "/api/webhooks", // Webhook endpoints
];

export const middlewareConfig = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

/** Default middleware — protects everything except the paths above */
export const authMiddleware = buildMiddleware();

/**
 * Build a middleware with configurable public paths.
 *
 * @param publicPaths - Paths that do NOT require authentication (prefix match)
 * @param redirectTo - Where to redirect unauthenticated users (default: /sign-in)
 */
export function buildMiddleware({
  publicPaths = DEFAULT_PUBLIC_PATHS,
  redirectTo = "/sign-in",
}: {
  publicPaths?: string[];
  redirectTo?: string;
} = {}) {
  return async function middleware(request: MiddlewareRequest): Promise<any> {
    const { pathname } = request.nextUrl;
    const isPublic = publicPaths.some((p) => pathname.startsWith(p));

    if (!isPublic) {
      // better-auth v1.2: auth.api.getSession({ headers })
      const session = await auth.api.getSession({
        headers: request.headers,
      });
      if (!session) {
        const signInUrl = new URL(redirectTo, request.url);
        signInUrl.searchParams.set("callbackUrl", pathname);
        return Response.redirect(signInUrl);
      }
    }
    return undefined;
  };
}
`,
		);

		// ── next-route-handler.ts — template for the catch-all API route ─────
		await writeFile(
			path.join(pkgDir, "next-route-handler.ts"),
			`/**
 * Template: apps/<your-app>/app/api/auth/[...all]/route.ts
 *
 * Copy this pattern into your app's API route directory.
 * Do NOT import this file directly — it must live under app/api/auth/[...all]/.
 *
 * better-auth latest: pass auth instance to toNextJsHandler.
 */
import { auth } from "${authPackageName}/server";
import { toNextJsHandler } from "better-auth/next-js";

// This creates GET and POST handlers that Next.js will pick up automatically.
export const { GET, POST } = toNextJsHandler(auth);
`,
		);

		// ── next.ts — Next.js-specific adapter exports ───────────────────────
		await writeFile(
			path.join(pkgDir, "next.ts"),
			`/**
 * Next.js adapter for ${authPackageName}.
 *
 * Import this sub-path only in Next apps:
 *   import { authMiddleware, middlewareConfig, nextRouteHandlers }
 *     from "${authPackageName}/next";
 */
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "./server.js";

export {
  authMiddleware,
  buildMiddleware,
  middlewareConfig,
} from "./middleware.js";

/** Helper for Next app/api/auth/[...all]/route.ts */
export const nextRouteHandlers = toNextJsHandler(auth);
`,
		);

		// ── .env.example ─────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, ".env.example"),
			`# ─── Better Auth v1.2+ ────────────────────────────────────────────────────────
# Secret used to sign session tokens — generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=REPLACE_WITH_RANDOM_32_CHAR_SECRET

# The canonical URL of your app (used for cookie domain & CORS)
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ─── Database ─────────────────────────────────────────────────────────────────
# Uncomment the adapter you're using (see packages/auth/server.ts)
# DATABASE_URL=postgresql://user:pass@localhost:5432/mydb

# ─── OAuth providers (optional) ───────────────────────────────────────────────
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
`,
		);

		// ── README.md ─────────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "README.md"),
			`# ${authPackageName} — Better Auth v1.2+

Shared authentication powered by [Better Auth](https://www.better-auth.com) — open-source, self-hosted, database-agnostic.

## Setup

### 1. Choose a database adapter
Edit \`packages/auth/server.ts\` and uncomment the adapter for your database (PostgreSQL, MySQL, SQLite, Prisma, Drizzle).

### 2. Copy env vars to your app
\`\`\`bash
cp packages/auth/.env.example apps/<your-app>/.env.local
# Fill in BETTER_AUTH_SECRET (openssl rand -base64 32) and DATABASE_URL
\`\`\`

### 3. Add the dependency
\`\`\`json
{ "dependencies": { "${authPackageName}": "workspace:*" } }
\`\`\`

### 4. Add the API route (Next.js)
\`\`\`ts
// apps/<your-app>/app/api/auth/[...all]/route.ts
import { nextRouteHandlers } from "${authPackageName}/next";
export const { GET, POST } = nextRouteHandlers;
\`\`\`

### 5. Add middleware
\`\`\`ts
// apps/<your-app>/middleware.ts
import type { NextRequest } from "next/server";
import { authMiddleware, middlewareConfig } from "${authPackageName}/next";

export default function middleware(request: NextRequest) {
  return authMiddleware(request);
}

export const config = middlewareConfig;
\`\`\`

### 6. Run migrations
\`\`\`bash
npx better-auth migrate
# or: npx better-auth generate (for Drizzle/Prisma — creates migration files)
\`\`\`

## Usage

\`\`\`tsx
// Server component
import { auth } from "${authPackageName}/server";
import { headers } from "next/headers";
const session = await auth.api.getSession({ headers: await headers() });

// Client component
"use client";
import { authClient } from "${authPackageName}/client";
const { data: session, isPending } = authClient.useSession();
await authClient.signIn.email({ email, password });
await authClient.signIn.social({ provider: "github" });
await authClient.updateUser({ name: "New Name" });
await authClient.signOut();
\`\`\`

## API

| Sub-path | Key exports |
|---|---|
| \`${authPackageName}/server\` | \`auth\`, \`Session\` type, \`User\` type |
| \`${authPackageName}/client\` | \`authClient\`, \`AuthClient\` type |
| \`${authPackageName}/middleware\` | \`authMiddleware\`, \`buildMiddleware()\`, \`middlewareConfig\` |
| \`${authPackageName}/next\` | \`nextRouteHandlers\`, \`authMiddleware\`, \`middlewareConfig\` |
`,
		);
	},
};
