import path from "path";
import { writeFile, ensureDir } from "../../../files.js";
import { scopedPackageName } from "../../../config.js";
import type { AuthPackageScaffolder, AuthPackageOptions, AppFramework } from "../types.js";

/**
 * WorkOS package selection by framework.
 * @workos-inc/authkit-nextjs is Next.js-specific.
 * @workos-inc/node is the universal server SDK — always included.
 */
function workosDepsForFrameworks(frameworks: AppFramework[]): Record<string, string> {
	const deps: Record<string, string> = {
		"@workos-inc/node": "latest",
	};
	if (frameworks.includes("nextjs")) {
		deps["@workos-inc/authkit-nextjs"] = "latest";
	}
	return deps;
}

export const workosScaffolder: AuthPackageScaffolder = {
	label: "WorkOS AuthKit",

	// Base deps computed dynamically in scaffold(); static field left empty.
	dependencies: {
		"@workos-inc/node": "latest",
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
		const frameworkDeps = workosDepsForFrameworks(opts.frameworks);

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
 * ${authPackageName} — WorkOS AuthKit.
 *
 * Prefer sub-path imports:
 *   import { getUser, withAuth }  from "${authPackageName}/server"
 *   import { useAuth }            from "${authPackageName}/client"
 *   import { authMiddleware }     from "${authPackageName}/next"
 */
export * from "./server.js";
export * from "./client.js";
`,
		);

		// ── next.ts ─────────────────────────────────────────────────────────────
		if (opts.frameworks.includes("nextjs")) {
			await writeFile(
				path.join(pkgDir, "next.ts"),
				`/** Next.js adapter for ${authPackageName} (WorkOS). */
export {
  authMiddleware,
  buildMiddleware,
  middlewareConfig,
} from "./middleware.js";
`,
			);
		}

		// ── server.ts ───────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "server.ts"),
			`/**
 * WorkOS AuthKit v1+ — server-side helpers.
 *
 * @example Next.js App Router (Server Component)
 *   import { getUser } from "${authPackageName}/server";
 *   const { user } = await getUser();
 *
 * @example Next.js Route Handler / Remix loader
 *   import { withAuth } from "${authPackageName}/server";
 *   export const GET = withAuth(async ({ user }) => {
 *     return Response.json({ user });
 *   });
 *
 * @example Vite / Express API (node SDK)
 *   import { workos } from "${authPackageName}/server";
 *   const { user } = await workos.userManagement.getUser(userId);
 */
${opts.frameworks.includes("nextjs") ? `export { getUser, withAuth, signOut } from "@workos-inc/authkit-nextjs";` : ""}
import WorkOS from "@workos-inc/node";

export const workos = new WorkOS(process.env.WORKOS_API_KEY!);

export type { User } from "@workos-inc/node";
`,
		);

		// ── client.ts ───────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "client.ts"),
			`/**
 * WorkOS AuthKit — client-side helper.
 * WorkOS uses server-side sessions; there is no React client SDK.
 * This module re-exports the auth URL helpers used in client components.
 */
"use client";

export function getAuthorizationUrl(opts?: { returnPathname?: string }): string {
  const base = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? "/api/auth/callback";
  if (opts?.returnPathname) {
    return \`\${base}?returnPathname=\${encodeURIComponent(opts.returnPathname)}\`;
  }
  return base;
}
`,
		);

		// ── middleware.ts (Next.js only) ─────────────────────────────────────────
		if (opts.frameworks.includes("nextjs")) {
			await writeFile(
				path.join(pkgDir, "middleware.ts"),
				`/**
 * WorkOS AuthKit — Next.js middleware.
 *
 * Copy into apps/<your-app>/middleware.ts:
 *
 *   import { authMiddleware, middlewareConfig } from "${authPackageName}/next";
 *   export default authMiddleware;
 *   export const config = middlewareConfig;
 */
import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export const authMiddleware = authkitMiddleware();

export function buildMiddleware(opts?: Parameters<typeof authkitMiddleware>[0]) {
  return authkitMiddleware(opts);
}

export const middlewareConfig = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
`,
			);
		}

		// ── .env.example ────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, ".env.example"),
			`# WorkOS — https://dashboard.workos.com → API Keys
WORKOS_API_KEY=sk_REPLACE_ME
WORKOS_CLIENT_ID=client_REPLACE_ME

# AuthKit redirect URI (register this in your WorkOS dashboard)
WORKOS_REDIRECT_URI=http://localhost:3000/api/auth/callback
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Cookie secret — generate with: openssl rand -base64 32
WORKOS_COOKIE_PASSWORD=REPLACE_WITH_32_CHAR_RANDOM_STRING
`,
		);

		// ── README.md ────────────────────────────────────────────────────────────
		await writeFile(
			path.join(pkgDir, "README.md"),
			`# ${authPackageName} — WorkOS AuthKit

Shared authentication package powered by [WorkOS AuthKit](https://workos.com/docs/user-management).

## Installed packages
${Object.keys(frameworkDeps).map((d) => `- \`${d}\``).join("\n")}

## Setup

### 1. Copy env vars
\`\`\`bash
cp packages/auth/.env.example apps/<your-app>/.env.local
\`\`\`

${opts.frameworks.includes("nextjs") ? `### 2. Add the callback route (Next.js)
\`\`\`ts
// apps/<your-app>/app/api/auth/callback/route.ts
import { handleAuth } from "@workos-inc/authkit-nextjs";
export const GET = handleAuth();
\`\`\`

### 3. Add middleware
\`\`\`ts
// apps/<your-app>/middleware.ts
export { authMiddleware as default, middlewareConfig as config } from "${authPackageName}/next";
\`\`\`

### 4. Use in server components
\`\`\`ts
import { getUser } from "${authPackageName}/server";
const { user } = await getUser();
\`\`\`` : `### 2. Use the node SDK
\`\`\`ts
import { workos } from "${authPackageName}/server";
const user = await workos.userManagement.getUser(userId);
\`\`\``}
`,
		);
	},
};
