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

		await ensureDir(path.join(pkgDir, "."));

		// ── index.ts ────────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "index.ts"),
			`/**
 * ${authPackageName} — Better Auth.
 *
 * Prefer sub-path imports:
 *   import { auth }       from "${authPackageName}/server"
 *   import { authClient } from "${authPackageName}/client"
 *   import { authMiddleware } from "${authPackageName}/next"
 */
export * from "./server.js";
export * from "./client.js";
`,
		);

		// ── server.ts ───────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "server.ts"),
			`/**
 * Better Auth — server instance.
 *
 * This is the single source of truth for your auth configuration.
 * Import \`auth\` in API routes, server components, and middleware.
 *
 * @example Next.js App Router (Server Component)
 *   import { auth } from "${authPackageName}/server";
 *   import { headers } from "next/headers";
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
 *
 * @example Vite / Express API
 *   import { auth } from "${authPackageName}/server";
 *   import { toNodeHandler } from "better-auth/node";
 *   app.all("/api/auth/*", toNodeHandler(auth));
 */
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  /**
   * Database adapter — replace with your production adapter.
   *
   * PostgreSQL:
   *   import { pg } from "better-auth/adapters/pg";
   *   database: pg({ connectionString: process.env.DATABASE_URL! }),
   *
   * SQLite (local dev):
   *   import Database from "better-sqlite3";
   *   import { betterSqlite3 } from "better-auth/adapters/better-sqlite3";
   *   database: betterSqlite3(new Database("./dev.db")),
   */
  database: undefined as never, // replace with your adapter

  emailAndPassword: {
    enabled: true,
  },

  // Trusted origins — add your app URLs
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
`,
		);

		// ── client.ts ───────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "client.ts"),
			`/**
 * Better Auth — browser / React client.
 *
 * @example
 *   import { authClient } from "${authPackageName}/client";
 *   const { data: session } = await authClient.getSession();
 *
 * @example React hook
 *   const { data: session } = authClient.useSession();
 */
"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Point to wherever your auth route handler is mounted.
  // For Next.js this is typically the same origin (leave blank).
  // For Vite SPAs pointing at a separate API: "http://localhost:3001"
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "",
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;
`,
		);

		// ── next.ts ─────────────────────────────────────────────────────────────
		// Only generated when Next.js is among the detected frameworks
		if (opts.frameworks.includes("nextjs")) {
			await writeFile(
				path.join(pkgDir, "next.ts"),
				`/**
 * Better Auth — Next.js helpers.
 *
 * Route handler (place at app/api/auth/[...all]/route.ts in your Next.js app):
 *
 *   import { authHandler } from "${authPackageName}/next";
 *   export const { GET, POST } = authHandler;
 *
 * Middleware helper:
 *
 *   import { authMiddleware } from "${authPackageName}/next";
 *   export default authMiddleware;
 *   export const config = { matcher: ["/((?!_next|api/auth).*)"] };
 */
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "./server.js";

export const authHandler = toNextJsHandler(auth);

export async function authMiddleware() {
  // Better Auth does not ship a built-in Next.js middleware.
  // Implement session checks here using auth.api.getSession().
}
`,
			);
		}

		// ── .env.example ────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, ".env.example"),
			`# Better Auth
BETTER_AUTH_SECRET=REPLACE_WITH_32_CHAR_RANDOM_STRING
BETTER_AUTH_URL=http://localhost:3000

# Database (pick one — see server.ts for adapter setup)
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# App URL (used by the client)
NEXT_PUBLIC_APP_URL=http://localhost:3000
`,
		);

		// ── README.md ────────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "README.md"),
			`# ${authPackageName} — Better Auth

Shared authentication package powered by [Better Auth](https://www.better-auth.com).

## Setup

### 1. Configure the database adapter in \`server.ts\`

### 2. Copy env vars
\`\`\`bash
cp packages/auth/.env.example apps/<your-app>/.env.local
\`\`\`

### 3. Mount the route handler (Next.js)
\`\`\`ts
// apps/<your-app>/app/api/auth/[...all]/route.ts
export { authHandler as GET, authHandler as POST } from "${authPackageName}/next";
\`\`\`

### 4. Mount the route handler (Vite/Express API)
\`\`\`ts
import { toNodeHandler } from "better-auth/node";
import { auth } from "${authPackageName}/server";
app.all("/api/auth/*", toNodeHandler(auth));
\`\`\`

### 5. Run the DB migration
\`\`\`bash
npx better-auth migrate
\`\`\`

### 6. Use in your app
\`\`\`ts
// Server
import { auth } from "${authPackageName}/server";
const session = await auth.api.getSession({ headers: request.headers });

// Client
import { authClient } from "${authPackageName}/client";
const { data: session } = authClient.useSession();
\`\`\`
`,
		);
	},
};
