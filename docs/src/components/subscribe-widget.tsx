import * as React from "react";
import { cn } from "@/lib/cn";

interface SubscribeWidgetProps {
	className?: string;
}

type SubmitStatus = "idle" | "loading" | "success" | "duplicate" | "error";

export function SubscribeWidget({ className }: SubscribeWidgetProps) {
	const [email, setEmail] = React.useState("");
	const [firstName, setFirstName] = React.useState("");
	const [status, setStatus] = React.useState<SubmitStatus>("idle");
	const [errorMsg, setErrorMsg] = React.useState("");

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!email.trim()) return;

		setStatus("loading");
		setErrorMsg("");

		try {
			const res = await fetch("/api/subscribe", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: email.trim(), firstName: firstName.trim() }),
			});

			const data = (await res.json()) as {
				ok: boolean;
				alreadySubscribed?: boolean;
				message?: string;
			};

			if (!data.ok) throw new Error(data.message ?? "Subscription failed");

			setStatus(data.alreadySubscribed ? "duplicate" : "success");
			setEmail("");
			setFirstName("");
		} catch (err) {
			setStatus("error");
			setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
		}
	}

	const isTerminal = status === "success" || status === "duplicate";

	return (
		<div
			className={cn(
				"rounded-xl border bg-fd-card p-6 text-fd-card-foreground shadow-sm",
				className,
			)}
		>
			<div className="mb-4 flex items-start gap-3">
				<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fd-primary/10">
					<BellIcon className="h-4 w-4 text-fd-primary" />
				</div>
				<div>
					<h3 className="font-semibold text-sm">Stay in the loop</h3>
					<p className="mt-0.5 text-xs text-fd-muted-foreground">
						Get notified about new commands, releases, and breaking changes.
					</p>
				</div>
			</div>

			{status === "success" && (
				<div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2.5 text-sm text-green-600 dark:text-green-400">
					<CheckIcon className="h-4 w-4 shrink-0" />
					<span>You&apos;re subscribed — we&apos;ll be in touch!</span>
				</div>
			)}

			{status === "duplicate" && (
				<div className="flex items-center gap-2 rounded-lg bg-fd-secondary px-3 py-2.5 text-sm text-fd-muted-foreground">
					<CheckIcon className="h-4 w-4 shrink-0" />
					<span>You&apos;re already subscribed. Thanks for being here!</span>
				</div>
			)}

			{!isTerminal && (
				<form onSubmit={handleSubmit} className="flex flex-col gap-2">
					<input
						type="text"
						value={firstName}
						onChange={(e) => setFirstName(e.target.value)}
						placeholder="First name (optional)"
						disabled={status === "loading"}
						className={cn(
							"h-9 w-full rounded-lg border bg-fd-background px-3 text-sm",
							"placeholder:text-fd-muted-foreground/60",
							"focus:outline-none focus:ring-2 focus:ring-fd-primary/40",
							"disabled:opacity-50",
						)}
					/>
					<div className="flex gap-2">
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="your@email.com"
							required
							disabled={status === "loading"}
							className={cn(
								"h-9 flex-1 min-w-0 rounded-lg border bg-fd-background px-3 text-sm",
								"placeholder:text-fd-muted-foreground/60",
								"focus:outline-none focus:ring-2 focus:ring-fd-primary/40",
								"disabled:opacity-50",
							)}
						/>
						<button
							type="submit"
							disabled={status === "loading" || !email.trim()}
							className={cn(
								"h-9 shrink-0 rounded-lg bg-fd-primary px-4 text-sm font-medium text-fd-primary-foreground",
								"transition-opacity hover:opacity-90",
								"disabled:pointer-events-none disabled:opacity-50",
							)}
						>
							{status === "loading" ? "Subscribing…" : "Subscribe"}
						</button>
					</div>
					{status === "error" && (
						<p className="text-xs text-red-500">{errorMsg}</p>
					)}
					<p className="text-xs text-fd-muted-foreground/70">
						No spam. Unsubscribe any time.
					</p>
				</form>
			)}
		</div>
	);
}

function BellIcon({ className }: { className?: string }) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
			<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
			<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
		</svg>
	);
}

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
			<path d="M20 6 9 17l-5-5" />
		</svg>
	);
}
