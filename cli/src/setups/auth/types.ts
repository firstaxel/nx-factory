export type AuthProvider = "clerk" | "better-auth" | "workos";

/** Frameworks the auth package can target. */
export type AppFramework = "nextjs" | "vite" | "remix" | "expo";

export interface AuthPackageOptions {
	/** The chosen provider */
	provider: AuthProvider;
	/** Absolute path to the monorepo root (where packages/ lives) */
	workspaceRoot: string;
	/** The workspace name (from nx-factory.config.json) */
	workspaceName: string;
	/** npm scope segment used for generated packages (without @) */
	scope: string;
	/** The package manager in use */
	pm: string;
	/**
	 * Frameworks detected across apps/ in the workspace.
	 * Scaffolders use this to only install the packages actually needed.
	 */
	frameworks: AppFramework[];
	/** If true, print what would happen but write nothing */
	dryRun?: boolean;
}

/**
 * Everything a provider scaffolder must implement.
 */
export interface AuthPackageScaffolder {
	/** Pretty label used in step output */
	label: string;
	/**
	 * npm deps that go into the auth package's package.json dependencies.
	 * Scaffolders can use opts.frameworks to compute these dynamically —
	 * this static field is for the base set always required.
	 */
	dependencies: Record<string, string>;
	/** npm devDeps for the auth package */
	devDependencies: Record<string, string>;
	/** peerDeps (e.g. react) */
	peerDependencies: Record<string, string>;
	/** Write every file into pkgDir */
	scaffold(pkgDir: string, opts: AuthPackageOptions): Promise<void>;
}
