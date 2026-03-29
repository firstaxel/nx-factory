import path from "path";
import { writeFile, ensureDir } from "../../../files.js";
import type { AuthPackageScaffolder, AuthPackageOptions } from "../types.js";

export const workosScaffolder: AuthPackageScaffolder = {
  label: "WorkOS AuthKit",

  dependencies: {
    "@workos-inc/authkit-nextjs": "latest",
    "@workos-inc/node":           "latest",
  },

  devDependencies: {
    "@types/react": "^19.0.0",
  },

  peerDependencies: {
    react:       "^18 || ^19",
    "react-dom": "^18 || ^19",
  },

  async scaffold(pkgDir: string, _opts: AuthPackageOptions): Promise<void> {
    await ensureDir(path.join(pkgDir, "."));

    // ── index.ts ──────────────────────────────────────────────────────────
    await writeFile(
      path.join(pkgDir, "index.ts"),
      `/**
 * @workspace/auth — WorkOS AuthKit latest setup.
 *
 * Prefer sub-path imports:
 *   import { getUser, withAuth }  from "@workspace/auth/server"
 *   import { useAuth }            from "@workspace/auth/client"
 *   import { authMiddleware }     from "@workspace/auth/next"
 */
export * from "./server.js";
export * from "./client.js";
`,
    );

    await writeFile(
      path.join(pkgDir, "next.ts"),
      `/** Next.js adapter for @workspace/auth (WorkOS). */
export {
  authMiddleware,
  buildMiddleware,
  middlewareConfig,
} from "./middleware.js";
`,
    );

    // ── server.ts ─────────────────────────────────────────────────────────
    // AuthKit v1+: getUser() replaces getSession(), withAuth() HOC
    await writeFile(
      path.join(pkgDir, "server.ts"),
      `/**
 * WorkOS AuthKit v1+ — server-side helpers.
 *
 * AuthKit v1 changes from v0:
 *   - getSession()  → getUser()  (returns { user, sessionId, accessToken })
 *   - withAuth()    — HOC now passes { user } prop (no session wrapper)
 *   - handleAuth()  — still the catch-all callback handler
 *
 * @example Server Component (manual check)
 *   import { getUser } from "@workspace/auth/server";
 *   const { user } = await getUser();
 *   if (!user) redirect("/sign-in");
 *
 * @example Server Component (HOC — auto-redirects)
 *   import { withAuth } from "@workspace/auth/server";
 *   export default withAuth(async function Page({ user }) {
 *     return <h1>Hello {user.firstName}</h1>;
 *   });
 *
 * @example Sign-in redirect
 *   import { getSignInUrl } from "@workspace/auth/server";
 *   redirect(await getSignInUrl());
 */

export {
  getUser,           // Replaces getSession() in AuthKit v1
  withAuth,          // HOC — passes { user } to your component
  getSignInUrl,      // Returns the WorkOS hosted sign-in URL
  getSignUpUrl,      // Returns the WorkOS hosted sign-up URL
  signOut,           // Server-side sign out (clears session cookie)
  refreshSession,    // Extend the session lifetime
  handleAuth,        // Catch-all callback route handler (GET)
  verifyAccessToken, // Verify a JWT access token
  encryptSession,    // For custom session storage scenarios
  terminateSession,  // Force-terminate a specific session
} from "@workos-inc/authkit-nextjs";

export type {
  User,
  AuthKitSession,
} from "@workos-inc/authkit-nextjs";

/**
 * Low-level WorkOS Node SDK.
 * Use for organization management, directory sync, audit logs, etc.
 *
 *   import { workos } from "@workspace/auth/server";
 *   const orgs = await workos.organizations.listOrganizations();
 */
import WorkOS from "@workos-inc/node";

if (!process.env.WORKOS_API_KEY) {
  throw new Error("Missing WORKOS_API_KEY — set it in your app's .env.local");
}

export const workos = new WorkOS(process.env.WORKOS_API_KEY);
export const workosClientId = process.env.WORKOS_CLIENT_ID!;
`,
    );

    // ── client.ts ─────────────────────────────────────────────────────────
    // AuthKit v1: useAuth() hook from the /components sub-path
    await writeFile(
      path.join(pkgDir, "client.ts"),
      `/**
 * WorkOS AuthKit v1+ — client-side hooks.
 *
 * The AuthKitProvider is required at the root of apps that use useAuth().
 *
 * @example Root layout
 *   import { AuthKitProvider } from "@workspace/auth/client";
 *   export default function Layout({ children }) {
 *     return <AuthKitProvider>{children}</AuthKitProvider>;
 *   }
 *
 * @example Any client component
 *   "use client";
 *   import { useAuth } from "@workspace/auth/client";
 *   const { user, loading, getAccessToken } = useAuth();
 */
"use client";

export {
  useAuth,         // { user, loading, getAccessToken, getRawAccessToken }
  AuthKitProvider, // Required root context provider
} from "@workos-inc/authkit-nextjs/components";
`,
    );

    // ── middleware.ts ─────────────────────────────────────────────────────
    // AuthKit v1: authkitMiddleware with middlewareAuth option
    await writeFile(
      path.join(pkgDir, "middleware.ts"),
      `/**
 * WorkOS AuthKit v1+ — Next.js middleware.
 *
 * Quick start — copy into apps/<your-app>/middleware.ts:
 *
 *   import type { NextRequest } from "next/server";
 *   import { authMiddleware, middlewareConfig } from "@workspace/auth/middleware";
 *
 *   export default function middleware(request: NextRequest) {
 *     return authMiddleware(request);
 *   }
 *
 *   export const config = middlewareConfig;
 *
 * Custom public paths:
 *
 *   import { buildMiddleware } from "@workspace/auth/middleware";
 *   export default buildMiddleware({ unauthenticatedPaths: ["/", "/about"] });
 *   export { middlewareConfig as config } from "@workspace/auth/middleware";
 */
import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
import type { AuthkitMiddlewareOptions } from "@workos-inc/authkit-nextjs";

export const middlewareConfig = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

const defaultUnauthenticatedPaths = [
  "/",
  "/sign-in",
  "/sign-up",
  "/api/webhooks(.*)",
];

/** Default middleware — requires auth on all paths except the ones above */
export const authMiddleware = authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: defaultUnauthenticatedPaths,
  },
});

/**
 * Build a middleware with configurable unauthenticated paths.
 *
 * @param unauthenticatedPaths - Paths that do NOT require authentication
 * @param options              - Additional AuthKit middleware options
 */
export function buildMiddleware({
  unauthenticatedPaths = defaultUnauthenticatedPaths,
  ...options
}: {
  unauthenticatedPaths?: string[];
} & Omit<AuthkitMiddlewareOptions, "middlewareAuth"> = {}) {
  return authkitMiddleware({
    ...options,
    middlewareAuth: {
      enabled: true,
      unauthenticatedPaths,
    },
  });
}
`,
    );

    // ── .env.example ─────────────────────────────────────────────────────────
    await writeFile(
      path.join(pkgDir, ".env.example"),
      `# ─── WorkOS AuthKit v1+ ──────────────────────────────────────────────────────
# Get these from: https://dashboard.workos.com → your app → API Keys
WORKOS_API_KEY=sk_REPLACE_ME
WORKOS_CLIENT_ID=client_REPLACE_ME

# Must match the redirect URI configured in your WorkOS dashboard
WORKOS_REDIRECT_URI=http://localhost:3000/callback

# Cookie encryption secret — generate with: openssl rand -base64 32
# Must be at least 32 characters
WORKOS_COOKIE_PASSWORD=REPLACE_WITH_RANDOM_32_CHAR_STRING

# The public URL of your app
NEXT_PUBLIC_APP_URL=http://localhost:3000
`,
    );

    // ── README.md ─────────────────────────────────────────────────────────────
    await writeFile(
      path.join(pkgDir, "README.md"),
      `# @workspace/auth — WorkOS AuthKit v1+

Shared authentication powered by [WorkOS AuthKit](https://workos.com/docs/user-management) — enterprise SSO, SCIM, MFA, magic auth, and a hosted sign-in UI.

> **AuthKit v1 notes:** \`getSession()\` was renamed to \`getUser()\`. The HOC \`withAuth()\` now passes \`{ user }\` directly (no session wrapper). \`AuthKitProvider\` is now required for \`useAuth()\`.

## Setup

### 1. Copy env vars to your app
\`\`\`bash
cp packages/auth/.env.example apps/<your-app>/.env.local
\`\`\`

Fill in from your [WorkOS Dashboard](https://dashboard.workos.com):
- \`WORKOS_API_KEY\`
- \`WORKOS_CLIENT_ID\`
- \`WORKOS_COOKIE_PASSWORD\` (run: \`openssl rand -base64 32\`)
- Add \`WORKOS_REDIRECT_URI\` in the WorkOS dashboard → Redirects

### 2. Add the dependency
\`\`\`json
{ "dependencies": { "@workspace/auth": "workspace:*" } }
\`\`\`

### 3. Add the callback route
\`\`\`ts
// apps/<your-app>/app/callback/route.ts
export { handleAuth as GET } from "@workspace/auth/server";
\`\`\`

### 4. Add the middleware
\`\`\`ts
// apps/<your-app>/middleware.ts
import type { NextRequest } from "next/server";
import { authMiddleware, middlewareConfig } from "@workspace/auth/next";

export default function middleware(request: NextRequest) {
  return authMiddleware(request);
}

export const config = middlewareConfig;
\`\`\`

### 5. Wrap your layout with AuthKitProvider
\`\`\`tsx
// apps/<your-app>/app/layout.tsx
import { AuthKitProvider } from "@workspace/auth/client";
export default function Layout({ children }) {
  return <AuthKitProvider>{children}</AuthKitProvider>;
}
\`\`\`

### 6. Use in your pages
\`\`\`tsx
// Server component — HOC (auto-redirects if not signed in)
import { withAuth } from "@workspace/auth/server";
export default withAuth(async function Page({ user }) {
  return <h1>Hello, {user.firstName}</h1>;
});

// Server component — manual
import { getUser } from "@workspace/auth/server";
const { user } = await getUser();

// Client component
"use client";
import { useAuth } from "@workspace/auth/client";
const { user, loading } = useAuth();

// Sign-in redirect page
import { getSignInUrl } from "@workspace/auth/server";
import { redirect }     from "next/navigation";
export default async function SignIn() { redirect(await getSignInUrl()); }
\`\`\`

## API

| Sub-path | Key exports |
|---|---|
| \`@workspace/auth/server\` | \`getUser()\`, \`withAuth()\`, \`getSignInUrl()\`, \`handleAuth\`, \`workos\`, \`signOut()\` |
| \`@workspace/auth/client\` | \`useAuth\`, \`AuthKitProvider\` |
| \`@workspace/auth/middleware\` | \`authMiddleware\`, \`buildMiddleware()\`, \`middlewareConfig\` |
| \`@workspace/auth/next\` | \`authMiddleware\`, \`buildMiddleware()\`, \`middlewareConfig\` |
`,
    );
  },
};
