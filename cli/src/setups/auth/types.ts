export type AuthProvider = "clerk" | "better-auth" | "workos";

export interface AuthPackageOptions {
  /** The chosen provider */
  provider:    AuthProvider;
  /** Absolute path to the monorepo root (where packages/ lives) */
  workspaceRoot: string;
  /** The workspace name (from nx-factory.config.json) */
  workspaceName: string;
  /** The package manager in use */
  pm:          string;
  /** If true, print what would happen but write nothing */
  dryRun?:     boolean;
}

/**
 * Everything a provider scaffolder must implement.
 *
 * The CLI calls scaffold() once — it creates the entire packages/auth
 * directory for that provider, including:
 *   - package.json
 *   - tsconfig.json
 *   - tsup.config.ts
 *   - index.ts  (the public barrel)
 *   - <provider>-specific files
 *   - .env.example
 *   - README.md
 */
export interface AuthPackageScaffolder {
  /** Pretty label used in step output */
  label: string;
  /** npm deps that go into the auth package's package.json dependencies */
  dependencies: Record<string, string>;
  /** npm devDeps for the auth package */
  devDependencies: Record<string, string>;
  /** peerDeps (e.g. react) */
  peerDependencies: Record<string, string>;
  /** Write every file into pkgDir */
  scaffold(pkgDir: string, opts: AuthPackageOptions): Promise<void>;
}
