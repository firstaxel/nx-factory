import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { SubscribeWidget } from "@/components/subscribe-widget";
import { DonateSection } from "@/components/donate-section";
import * as React from "react";

export const Route = createFileRoute("/")({ component: Home });

// ── Static data ───────────────────────────────────────────────────────────────

const COMMANDS = [
	{
		cmd: "nx-factory-cli init",
		label: "init",
		badge: "Start here",
		badgeColor: "green" as const,
		desc: "Interactively create a new Nx workspace. Prompts for package manager, UI package name, visibility (internal vs npm), base color theme, and whether to scaffold an example Next.js app.",
		what: [
			"Creates Nx workspace with ts preset",
			"Writes apps/ and packages/ with workspace protocol config",
			"Scaffolds packages/ui with shadcn/ui, Tailwind v4, and barrel exports",
			"Writes tsconfig.base.json inherited by every package and app",
			"Saves nx-factory.config.json at the workspace root",
		],
	},
	{
		cmd: "nx-factory-cli add-app",
		label: "add-app",
		badge: null,
		badgeColor: null,
		desc: "Scaffold a new app using its official CLI (create-next-app, create-vite, create-remix, create-expo-app) then wire it to @workspace/ui automatically.",
		what: [
			"Runs the real framework scaffolder interactively",
			"Adds @workspace/ui workspace:* dependency",
			"Injects CSS import into the root layout or entry",
			"Patches framework config (transpilePackages, vite plugin)",
			"Writes an app tsconfig that extends tsconfig.base.json",
		],
	},
	{
		cmd: "nx-factory-cli add-auth",
		label: "add-auth",
		badge: null,
		badgeColor: null,
		desc: "Create packages/auth with a full auth setup for Clerk, Better Auth, or WorkOS. Detects each app's framework and only installs the packages actually needed.",
		what: [
			"Creates packages/auth with server, client, middleware, next sub-paths",
			"Generates provider-specific .env.example and README",
			"Only installs framework-matched SDKs (e.g. no @clerk/remix in a Next.js workspace)",
			"Adds @workspace/auth dependency to selected apps",
		],
	},
	{
		cmd: "nx-factory-cli add-lib",
		label: "add-lib",
		badge: null,
		badgeColor: null,
		desc: "Scaffold a typed shared library. Choose from utils, hooks, config, types, or api — and choose internal (workspace only) or public (npm publish).",
		what: [
			"Creates packages/<name> with correct tsconfig extending the base",
			"Internal: private:true, self-referencing path alias",
			"Public: files, publishConfig, stripInternal in tsconfig",
			"hooks type gets react:true automatically (jsx + DOM libs)",
		],
	},
	{
		cmd: "nx-factory-cli add-component",
		label: "add-component",
		badge: null,
		badgeColor: null,
		desc: "Add one or more shadcn/ui components to the shared UI package. Runs the real shadcn CLI and automatically updates the barrel export in index.tsx.",
		what: [
			"Runs shadcn@latest add inside packages/ui",
			"Updates src/index.tsx barrel exports",
			"All apps instantly get the new component via @workspace/ui",
		],
	},
	{
		cmd: "nx-factory-cli migrate",
		label: "migrate",
		badge: "New",
		badgeColor: "purple" as const,
		desc: "Migrate an existing nx-factory-cli workspace to the latest configuration. Analyses what's outdated and applies targeted patches with backups.",
		what: [
			"Detects missing tsconfig.base.json and writes it",
			"Migrates package tsconfigs to composite + incremental",
			"Migrates app tsconfigs to extend base and remove bad includes",
			"Prompts for UI package visibility and updates nx-factory.config.json",
			"Backs up every changed file as <file>.migration-backup",
		],
	},
	{
		cmd: "nx-factory-cli doctor",
		label: "doctor",
		badge: null,
		badgeColor: null,
		desc: "Validate workspace health: checks tsconfig inheritance, barrel exports, and package.json consistency. Auto-fixes barrel export issues.",
		what: [
			"Validates all packages extend tsconfig.base.json",
			"Checks @workspace/* path aliases are consistent",
			"Finds and fixes missing barrel exports",
		],
	},
] as const;

const FEATURES = [
	{
		icon: "🏗️",
		title: "Real CLI scaffolders",
		desc: "Apps are created with create-next-app, create-vite, create-remix — the official tools, not hand-written templates that go stale.",
	},
	{
		icon: "📐",
		title: "Production tsconfig",
		desc: "A single tsconfig.base.json at the root. Every package and app extends it. NodeNext module resolution, composite + incremental builds, correct path aliases.",
	},
	{
		icon: "👁️",
		title: "Internal vs public packages",
		desc: "Every package prompt now asks: workspace-only (private) or publishing to npm? The tsconfig and package.json are shaped accordingly — stripInternal, publishConfig, and all.",
	},
	{
		icon: "🔐",
		title: "Auth in 30 seconds",
		desc: "Clerk, Better Auth, or WorkOS. Framework-aware: only installs the SDKs your apps actually need. server, client, middleware sub-paths ready to import.",
	},
	{
		icon: "🎨",
		title: "Tailwind v4 + shadcn/ui",
		desc: "CSS-first config with oklch design tokens, dark mode, and all 47 shadcn components available on demand. No tailwind.config.js required.",
	},
	{
		icon: "🔄",
		title: "Migrate existing workspaces",
		desc: "Already using nx-factory-cli? The migrate command analyses your workspace, patches what's outdated, and backs up everything it touches.",
	},
] as const;

const TSCONFIG_EXPLAINER = [
	{
		file: "tsconfig.base.json",
		scope: "Workspace root",
		role: "NodeNext module resolution, strict settings, global @scope/* paths. Inherited by everyone.",
		color: "text-amber-500 dark:text-amber-400",
	},
	{
		file: "packages/ui/tsconfig.json",
		scope: "UI package",
		role: "Extends base. Adds jsx:react-jsx, DOM lib, composite:true, incremental builds.",
		color: "text-blue-500 dark:text-blue-400",
	},
	{
		file: "packages/auth/tsconfig.json",
		scope: "Auth package",
		role: "Extends base. React + DOM. Always internal. Composite for Nx caching.",
		color: "text-blue-500 dark:text-blue-400",
	},
	{
		file: "apps/my-app/tsconfig.json",
		scope: "Next.js app",
		role: "Extends base. Adds jsx:preserve, Next.js plugin, noEmit. No packages/** in include.",
		color: "text-green-500 dark:text-green-400",
	},
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

function Home() {
	return (
		<HomeLayout {...baseOptions()}>
			<main className="flex flex-col w-full">
				{/* ── Hero ────────────────────────────────────────────────────────── */}
				<section className="relative flex flex-col items-center justify-center px-4 pt-24 pb-20 text-center overflow-hidden">
					{/* grid bg */}
					<div
						className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
						style={{
							backgroundImage:
								"repeating-linear-gradient(0deg,currentColor 0,currentColor 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,currentColor 0,currentColor 1px,transparent 1px,transparent 40px)",
						}}
					/>
					{/* radial fade at bottom */}
					<div className="pointer-events-none absolute bottom-0 inset-x-0 h-32 bg-linear-to-t from-fd-background to-transparent" />

					<div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center gap-7">
						<div className="flex items-center gap-2">
							<span className="inline-flex items-center gap-1.5 rounded-full border bg-fd-background px-3 py-1 text-xs font-medium text-fd-muted-foreground">
								<span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
								v2.1 — now with migrate command + visibility-aware tsconfig
							</span>
						</div>

						<h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.1]">
							Nx monorepos, <span className="text-fd-primary">done right.</span>
						</h1>

						<p className="text-lg text-fd-muted-foreground max-w-xl leading-relaxed">
							One CLI to scaffold a production-ready Nx workspace — shared
							shadcn/ui components, Tailwind v4, framework-aware auth, and a
							tsconfig hierarchy that actually makes sense.
						</p>

						<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full max-w-md">
							<div className="flex items-center gap-2 flex-1 rounded-xl border bg-fd-card px-4 py-2.5 font-mono text-sm shadow-sm">
								<span className="text-fd-muted-foreground select-none">$</span>
								<span className="text-fd-foreground select-all flex-1">
									npx nx-factory-cli init
								</span>
								<CopyButton text="npx nx-factory-cli init" />
							</div>
							<Link
								to="/docs/$"
								params={{ _splat: "" }}
								className="inline-flex items-center justify-center gap-2 rounded-xl bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground hover:opacity-90 transition-opacity"
							>
								Read the docs
								<ArrowRightIcon className="h-4 w-4" />
							</Link>
						</div>

						<div className="flex items-center gap-4 text-xs text-fd-muted-foreground">
							<a
								href="https://github.com/firstaxel/nx-factory"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 hover:text-fd-foreground transition-colors"
							>
								<GitHubIcon className="h-3.5 w-3.5" />
								View on GitHub
							</a>
							<span>·</span>
							<span>MIT License</span>
							<span>·</span>
							<span>TypeScript</span>
						</div>
					</div>
				</section>

				{/* ── What makes it different ──────────────────────────────────────── */}
				<section className="border-t px-4 py-16 bg-fd-secondary/20">
					<div className="max-w-4xl mx-auto">
						<div className="text-center mb-12">
							<h2 className="text-2xl font-bold mb-3">Not just scaffolding.</h2>
							<p className="text-fd-muted-foreground max-w-lg mx-auto text-sm leading-relaxed">
								nx-factory-cli makes opinionated decisions so you don&apos;t
								have to — and explains every decision so you can override it.
							</p>
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{FEATURES.map(({ icon, title, desc }) => (
								<div
									key={title}
									className="flex flex-col gap-3 rounded-xl border bg-fd-card p-5 hover:border-fd-primary/40 transition-colors"
								>
									<span className="text-xl" role="img" aria-hidden="true">
										{icon}
									</span>
									<span className="font-semibold text-sm">{title}</span>
									<span className="text-xs text-fd-muted-foreground leading-relaxed">
										{desc}
									</span>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* ── Commands ─────────────────────────────────────────────────────── */}
				<section className="border-t px-4 py-16">
					<div className="max-w-3xl mx-auto">
						<div className="text-center mb-12">
							<h2 className="text-2xl font-bold mb-3">
								Every command explained
							</h2>
							<p className="text-fd-muted-foreground text-sm">
								All commands support <Code>--dry-run</Code> and{" "}
								<Code>--yes</Code> for CI use.
							</p>
						</div>
						<div className="flex flex-col gap-4">
							{COMMANDS.map(({ cmd, desc, label, badge, what, badgeColor }) => (
								<CommandCard
									key={label}
									cmd={cmd}
									desc={desc}
									label={label}
									badge={badge ?? null}
									badgeColor={badgeColor ?? null}
									what={what as readonly string[]}
								/>
							))}
						</div>
					</div>
				</section>

				{/* ── tsconfig deep dive ───────────────────────────────────────────── */}
				<section className="border-t px-4 py-16 bg-fd-secondary/20">
					<div className="max-w-3xl mx-auto">
						<div className="text-center mb-12">
							<h2 className="text-2xl font-bold mb-3">
								One base, everything extends it
							</h2>
							<p className="text-fd-muted-foreground text-sm max-w-lg mx-auto leading-relaxed">
								The CLI writes a single <Code>tsconfig.base.json</Code> at the
								workspace root with NodeNext resolution and global path aliases.
								Every package and app only declares what it uniquely needs.
							</p>
						</div>

						<div className="rounded-xl border bg-fd-card overflow-hidden">
							<div className="grid grid-cols-[auto_1fr_1fr] text-xs font-medium text-fd-muted-foreground bg-fd-secondary/40 px-4 py-2 border-b gap-4">
								<span>File</span>
								<span>Scope</span>
								<span>Role</span>
							</div>
							{TSCONFIG_EXPLAINER.map(({ file, scope, role, color }) => (
								<div
									key={file}
									className="grid grid-cols-[auto_1fr_1fr] px-4 py-3 border-b last:border-b-0 gap-4 items-start hover:bg-fd-secondary/20 transition-colors"
								>
									<code
										className={`text-xs font-mono ${color} whitespace-nowrap`}
									>
										{file}
									</code>
									<span className="text-xs text-fd-muted-foreground">
										{scope}
									</span>
									<span className="text-xs text-fd-muted-foreground leading-relaxed">
										{role}
									</span>
								</div>
							))}
						</div>

						<div className="mt-6 rounded-xl border bg-fd-card p-5">
							<p className="text-xs font-semibold mb-2 text-fd-muted-foreground uppercase tracking-wider">
								Why no packages {"/**/*"} in app includes
							</p>
							<p className="text-sm text-fd-muted-foreground leading-relaxed">
								Adding <Code>../../packages{"/**/*"}.ts</Code> to an app&apos;s{" "}
								<Code>include</Code> causes TypeScript to type-check all
								packages as part of every app build — slow, and it generates
								duplicate declaration errors. Instead, nx-factory-cli uses{" "}
								<Code>paths</Code> aliases (<Code>@scope/*</Code> →{" "}
								<Code>./packages/*/index.ts</Code>) which resolve types without
								including the files.
							</p>
						</div>
					</div>
				</section>

				{/* ── Quick start ──────────────────────────────────────────────────── */}
				<section className="border-t px-4 py-16">
					<div className="max-w-2xl mx-auto">
						<div className="text-center mb-12">
							<h2 className="text-2xl font-bold mb-3">Quick start</h2>
							<p className="text-fd-muted-foreground text-sm">
								From zero to a running monorepo in under two minutes.
							</p>
						</div>
						<div className="flex flex-col gap-3">
							{[
								{
									n: "1",
									title: "Install globally",
									code: "npm install -g nx-factory-cli",
									note: "Or use npx without installing",
								},
								{
									n: "2",
									title: "Initialize workspace",
									code: "nx-factory-cli init",
									note: "Interactive — picks up package manager, scope, color theme",
								},
								{
									n: "3",
									title: "Add your first app",
									code: "nx-factory-cli add-app --framework nextjs",
									note: "Runs create-next-app then wires @workspace/ui",
								},
								{
									n: "4",
									title: "Add auth (optional)",
									code: "nx-factory-cli add-auth --provider better-auth",
									note: "Creates packages/auth with server + client exports",
								},
							].map(({ n, title, code, note }) => (
								<div
									key={n}
									className="flex gap-4 rounded-xl border bg-fd-card p-4 items-start"
								>
									<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fd-primary/10 text-xs font-bold text-fd-primary mt-0.5">
										{n}
									</span>
									<div className="flex flex-col gap-1 min-w-0 flex-1">
										<span className="text-sm font-medium">{title}</span>
										<div className="flex items-center gap-2 rounded-lg bg-fd-secondary px-3 py-1.5 w-fit">
											<code className="text-xs font-mono text-fd-foreground">
												{code}
											</code>
											<CopyButton text={code} />
										</div>
										<span className="text-xs text-fd-muted-foreground">
											{note}
										</span>
									</div>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* ── Subscribe + Donate ───────────────────────────────────────────── */}
				<section className="border-t px-4 py-16 bg-fd-secondary/20">
					<div className="max-w-2xl mx-auto">
						<div className="text-center mb-10">
							<h2 className="text-2xl font-bold mb-3">Stay connected</h2>
							<p className="text-fd-muted-foreground text-sm">
								Subscribe for release updates. Support ongoing development.
							</p>
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
							<SubscribeWidget />
							<DonateSection />
						</div>
					</div>
				</section>

				{/* ── Footer ──────────────────────────────────────────────────────── */}
				<footer className="border-t px-4 py-8">
					<div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-fd-muted-foreground">
						<p>
							<span className="font-semibold text-fd-foreground">
								nx-factory-cli
							</span>{" "}
							is open-source and MIT licensed.
						</p>
						<div className="flex items-center gap-4">
							<a
								href="https://github.com/firstaxel/nx-factory"
								target="_blank"
								rel="noopener noreferrer"
								className="hover:text-fd-foreground transition-colors inline-flex items-center gap-1.5"
							>
								<GitHubIcon className="h-3.5 w-3.5" />
								GitHub
							</a>
							<Link
								to="/docs/$"
								params={{ _splat: "" }}
								className="hover:text-fd-foreground transition-colors"
							>
								Docs
							</Link>
							<Link
								to="/docs/$"
								params={{ _splat: "commands" }}
								className="hover:text-fd-foreground transition-colors"
							>
								Commands
							</Link>
						</div>
					</div>
				</footer>
			</main>
		</HomeLayout>
	);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CommandCard({
	cmd,
	desc,
	label,
	badge,
	badgeColor,
	what,
}: {
	cmd: string;
	desc: string;
	label: string;
	badge: string | null;
	badgeColor: "green" | "purple" | null;
	what: readonly string[];
}) {
	const [open, setOpen] = React.useState(false);

	const badgeClass =
		badgeColor === "green"
			? "bg-green-500/10 text-green-600 dark:text-green-400"
			: badgeColor === "purple"
				? "bg-fd-primary/10 text-fd-primary"
				: "";

	return (
		<div className="rounded-xl border bg-fd-card overflow-hidden">
			<div className="flex flex-col sm:flex-row sm:items-start gap-3 px-4 py-4">
				<div className="flex items-center gap-2 shrink-0">
					<code className="rounded-lg bg-fd-secondary px-3 py-1.5 font-mono text-xs font-medium text-fd-foreground whitespace-nowrap">
						{cmd}
					</code>
					{badge && (
						<span
							className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
						>
							{badge}
						</span>
					)}
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-xs text-fd-muted-foreground leading-relaxed">
						{desc}
					</p>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<button
						type="button"
						onClick={() => setOpen((o) => !o)}
						className="text-xs text-fd-muted-foreground hover:text-fd-foreground transition-colors flex items-center gap-1"
					>
						{open ? "Less" : "What it does"}
						<ChevronIcon
							className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
						/>
					</button>
					<Link
						to="/docs/$"
						params={{ _splat: `commands/${label}` }}
						className="text-xs text-fd-primary hover:underline"
					>
						Docs →
					</Link>
				</div>
			</div>
			{open && (
				<div className="border-t bg-fd-secondary/30 px-4 py-3">
					<ul className="flex flex-col gap-1.5">
						{what.map((item) => (
							<li
								key={item}
								className="flex items-start gap-2 text-xs text-fd-muted-foreground"
							>
								<span className="text-fd-primary mt-0.5 shrink-0">▸</span>
								{item}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

function Code({ children }: { children: React.ReactNode }) {
	return (
		<code className="text-xs bg-fd-secondary px-1.5 py-0.5 rounded font-mono">
			{children}
		</code>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = React.useState(false);
	function handleCopy() {
		void navigator.clipboard.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}
	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label="Copy to clipboard"
			className="ml-auto shrink-0 text-fd-muted-foreground hover:text-fd-foreground transition-colors"
		>
			{copied ? (
				<CheckIcon className="h-3.5 w-3.5 text-green-500" />
			) : (
				<ClipboardIcon className="h-3.5 w-3.5" />
			)}
		</button>
	);
}

function ArrowRightIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			<path d="M5 12h14M12 5l7 7-7 7" />
		</svg>
	);
}

function GitHubIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="currentColor"
			className={className}
			aria-hidden="true"
		>
			<path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
		</svg>
	);
}

function ClipboardIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			<rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
			<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
		</svg>
	);
}

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			<path d="M20 6 9 17l-5-5" />
		</svg>
	);
}

function ChevronIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	);
}
