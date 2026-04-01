import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { SubscribeWidget } from "@/components/subscribe-widget";
import { DonateSection } from "@/components/donate-section";
import * as React from "react";

export const Route = createFileRoute("/")({
	component: Home,
});

// ── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
	{
		icon: "🏗️",
		title: "Nx workspace",
		desc: "ts preset, apps/ + packages/ layout wired up instantly.",
	},
	{
		icon: "🎨",
		title: "Shared UI package",
		desc: "packages/ui built with tsup, exported as ESM, shared across every app.",
	},
	{
		icon: "💅",
		title: "Tailwind v4",
		desc: "CSS-first config, no tailwind.config.js needed. Dark mode tokens included.",
	},
	{
		icon: "🧩",
		title: "shadcn/ui",
		desc: "new-york style, CSS variables, any component on demand via add-component.",
	},
	{
		icon: "📦",
		title: "Multi-framework",
		desc: "Add Next.js, Vite, Remix, or Expo apps that all share the same components.",
	},
	{
		icon: "🔐",
		title: "Auth ready",
		desc: "packages/auth scaffolded with Clerk, Better Auth, or WorkOS — your pick.",
	},
] as const;

const COMMANDS = [
	{
		cmd: "nx-factory-cli init",
		desc: "Bootstrap a new Nx monorepo with shared UI, Tailwind v4 and shadcn/ui.",
		label: "init",
	},
	{
		cmd: "nx-factory-cli add-app",
		desc: "Scaffold a Next.js, Vite, Remix or Expo app pre-wired to @workspace/ui.",
		label: "add-app",
	},
	{
		cmd: "nx-factory-cli add-auth",
		desc: "Create packages/auth with Clerk, Better Auth, or WorkOS — monorepo-native.",
		label: "add-auth",
	},
	{
		cmd: "nx-factory-cli add-component",
		desc: "Add shadcn/ui components to the shared package and auto-update barrel exports.",
		label: "add-component",
	},
	{
		cmd: "nx-factory-cli add-lib",
		desc: "Scaffold a typed shared library (utils, hooks, config, types, api).",
		label: "add-lib",
	},
	{
		cmd: "nx-factory-cli doctor",
		desc: "Validate workspace health and auto-fix barrel export issues.",
		label: "doctor",
	},
] as const;

const STEPS = [
	{ n: "1", title: "Install", code: "npm i -g nx-factory-cli " },
	{ n: "2", title: "Init", code: "nx-factory-cli init" },
	{ n: "3", title: "Add app", code: "nx-factory-cli add-app" },
	{ n: "4", title: "Add auth", code: "nx-factory-cli add-auth" },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

function Home() {
	return (
		<HomeLayout {...baseOptions()}>
			<main className="flex flex-col w-full">
				{/* ── Hero ─────────────────────────────────────────────────────────── */}
				<section className="relative flex flex-col items-center justify-center px-4 pt-20 pb-16 text-center overflow-hidden">
					{/* subtle grid bg */}
					<div
						className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"
						style={{
							backgroundImage:
								"repeating-linear-gradient(0deg,currentColor 0,currentColor 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,currentColor 0,currentColor 1px,transparent 1px,transparent 40px)",
						}}
					/>

					<div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center gap-6">
						<span className="inline-flex items-center gap-1.5 rounded-full border bg-fd-background px-3 py-1 text-xs font-medium text-fd-muted-foreground">
							<span className="h-1.5 w-1.5 rounded-full bg-green-500" />
							v2.0 — now with auth packages
						</span>

						<h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
							Nx monorepos, <span className="text-fd-primary">done right.</span>
						</h1>

						<p className="text-lg text-fd-muted-foreground max-w-lg">
							One CLI to scaffold an Nx workspace with a shared shadcn/ui
							component library, Tailwind v4, and production-ready auth — for
							any number of apps.
						</p>

						{/* Install command */}
						<div className="flex items-center gap-2 rounded-xl border bg-fd-card px-4 py-2.5 font-mono text-sm shadow-sm w-full max-w-sm justify-center">
							<span className="text-fd-muted-foreground select-none">$</span>
							<span className="text-fd-foreground select-all">
								npx nx-factory-cli init
							</span>
							<CopyButton text="npx nx-factory-cli init" />
						</div>

						<div className="flex items-center gap-3 flex-wrap justify-center">
							<Link
								to="/docs/$"
								params={{ _splat: "" }}
								className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground hover:opacity-90 transition-opacity"
							>
								Read the docs
								<ArrowRightIcon className="h-4 w-4" />
							</Link>
							<a
								href="https://github.com/firstaxel/nx-factory "
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-2 rounded-lg border bg-fd-card px-5 py-2.5 text-sm font-medium hover:bg-fd-accent transition-colors"
							>
								<GitHubIcon className="h-4 w-4" />
								GitHub
							</a>
						</div>
					</div>
				</section>

				{/* ── How it works ─────────────────────────────────────────────────── */}
				<section className="border-t px-4 py-14">
					<div className="max-w-3xl mx-auto">
						<h2 className="text-xl font-semibold text-center mb-10">
							Up and running in 4 steps
						</h2>
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
							{STEPS.map(({ n, title, code }) => (
								<div
									key={n}
									className="flex flex-col gap-2 rounded-xl border bg-fd-card p-4"
								>
									<span className="flex h-7 w-7 items-center justify-center rounded-full bg-fd-primary/10 text-xs font-bold text-fd-primary">
										{n}
									</span>
									<span className="text-sm font-medium">{title}</span>
									<code className="text-xs font-mono text-fd-muted-foreground break-all">
										{code}
									</code>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* ── Features ─────────────────────────────────────────────────────── */}
				<section className="border-t px-4 py-14 bg-fd-secondary/30">
					<div className="max-w-4xl mx-auto">
						<h2 className="text-xl font-semibold text-center mb-10">
							Everything included
						</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{FEATURES.map(({ icon, title, desc }) => (
								<div
									key={title}
									className="flex flex-col gap-2 rounded-xl border bg-fd-card p-5 hover:border-fd-primary/40 transition-colors"
								>
									<span className="text-2xl" role="img" aria-hidden="true">
										{icon}
									</span>
									<span className="font-medium text-sm">{title}</span>
									<span className="text-xs text-fd-muted-foreground leading-relaxed">
										{desc}
									</span>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* ── Commands showcase ─────────────────────────────────────────────── */}
				<section className="border-t px-4 py-14">
					<div className="max-w-3xl mx-auto">
						<h2 className="text-xl font-semibold text-center mb-2">Commands</h2>
						<p className="text-center text-sm text-fd-muted-foreground mb-10">
							Every command supports{" "}
							<code className="text-xs bg-fd-secondary px-1.5 py-0.5 rounded">
								--dry-run
							</code>{" "}
							and{" "}
							<code className="text-xs bg-fd-secondary px-1.5 py-0.5 rounded">
								--yes
							</code>
							.
						</p>
						<div className="flex flex-col gap-3">
							{COMMANDS.map(({ cmd, desc, label }) => (
								<div
									key={label}
									className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-xl border bg-fd-card px-4 py-3"
								>
									<code className="shrink-0 rounded-lg bg-fd-secondary px-3 py-1.5 font-mono text-xs font-medium text-fd-foreground">
										{cmd}
									</code>
									<span className="text-xs text-fd-muted-foreground">
										{desc}
									</span>
									<Link
										to="/docs/$"
										params={{ _splat: `commands/${label}` }}
										className="sm:ml-auto shrink-0 text-xs text-fd-primary hover:underline"
									>
										Docs →
									</Link>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* ── Subscribe + Donate ────────────────────────────────────────────── */}
				<section className="border-t px-4 py-14 bg-fd-secondary/30">
					<div className="max-w-2xl mx-auto">
						<h2 className="text-xl font-semibold text-center mb-2">
							Stay connected
						</h2>
						<p className="text-center text-sm text-fd-muted-foreground mb-10">
							Get notified about updates and support ongoing development.
						</p>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
							<SubscribeWidget />
							<DonateSection />
						</div>
					</div>
				</section>

				{/* ── Footer ───────────────────────────────────────────────────────── */}
				<footer className="border-t px-4 py-8 text-center text-xs text-fd-muted-foreground">
					<p>
						nx-factory-cli is open-source and MIT licensed.{" "}
						<a
							href="https://github.com/firstaxel/nx-factory-cli "
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-fd-foreground transition-colors"
						>
							View on GitHub
						</a>
					</p>
				</footer>
			</main>
		</HomeLayout>
	);
}

// ── Small utility components ──────────────────────────────────────────────────

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
