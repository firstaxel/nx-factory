import * as React from "react";
import { cn } from "@/lib/cn";

interface DonateSectionProps {
	className?: string;
}

const DONATE_LINKS = [
	{
		id: "kofi",
		label: "Ko-fi",
		hint: "Buy me a coffee",
		/**
		 * Replace with your Ko-fi link:  https://ko-fi.com/YOUR_USERNAME
		 */
		href: "https://ko-fi.com/olasubomi",
		icon: KofiIcon,
		color: "text-[#FF5E5B]",
		bg: "bg-[#FF5E5B]/10 hover:bg-[#FF5E5B]/20",
	},
	{
		id: "github",
		label: "GitHub Sponsors",
		hint: "Monthly support",
		/**
		 * Replace with your GitHub Sponsors link:
		 *   https://github.com/sponsors/YOUR_USERNAME
		 */
		href: "https://github.com/sponsors/",
		icon: HeartIcon,
		color: "text-fd-primary",
		bg: "bg-fd-primary/10 hover:bg-fd-primary/20",
	},
	{
		id: "opencollective",
		label: "Open Collective",
		hint: "Transparent funding",
		/**
		 * Replace with your Open Collective link:
		 *   https://opencollective.com/YOUR_COLLECTIVE
		 */
		href: "https://opencollective.com/",
		icon: StarIcon,
		color: "text-amber-500",
		bg: "bg-amber-500/10 hover:bg-amber-500/20",
	},
] as const;

export function DonateSection({ className }: DonateSectionProps) {
	return (
		<div
			className={cn(
				"rounded-xl border bg-fd-card p-6 text-fd-card-foreground shadow-sm",
				className,
			)}
		>
			<div className="mb-4 flex items-start gap-3">
				<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
					<HeartIcon className="h-4 w-4 text-amber-500" />
				</div>
				<div>
					<h3 className="font-semibold text-sm">Support this project</h3>
					<p className="mt-0.5 text-xs text-fd-muted-foreground">
						nx-factory-cli is free and open-source. If it saves you time,
						consider supporting its development.
					</p>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				{DONATE_LINKS.map(
					({ id, label, hint, href, icon: Icon, color, bg }) => (
						<a
							key={id}
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							className={cn(
								"flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
								bg,
							)}
						>
							<Icon className={cn("h-4 w-4 shrink-0", color)} />
							<div className="min-w-0">
								<span className="block text-sm font-medium">{label}</span>
								<span className="block text-xs text-fd-muted-foreground">
									{hint}
								</span>
							</div>
							<ExternalLinkIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-fd-muted-foreground/50" />
						</a>
					),
				)}
			</div>

			<p className="mt-4 text-center text-xs text-fd-muted-foreground/60">
				Every contribution helps keep the project maintained.
			</p>
		</div>
	);
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function HeartIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="currentColor"
			className={className}
			aria-hidden="true"
		>
			<path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
		</svg>
	);
}

function StarIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="currentColor"
			className={className}
			aria-hidden="true"
		>
			<path
				fillRule="evenodd"
				d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

function KofiIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="currentColor"
			className={className}
			aria-hidden="true"
		>
			<path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z" />
		</svg>
	);
}

function ExternalLinkIcon({ className }: { className?: string }) {
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
			<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
		</svg>
	);
}
