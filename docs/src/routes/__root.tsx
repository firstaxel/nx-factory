import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import * as React from "react";
import appCss from "@/styles/app.css?url";
import { RootProvider } from "fumadocs-ui/provider/tanstack";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "nx-factory — Nx monorepos, done right" },
			{
				name: "description",
				content:
					"One CLI to scaffold an Nx monorepo with shared shadcn/ui, Tailwind v4, auth, and production-ready TypeScript config.",
			},
			{ name: "og:title", content: "nx-factory" },
			{
				name: "og:description",
				content: "Scaffold production-ready Nx monorepos in seconds.",
			},
			{ name: "og:type", content: "website" },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: "nx-factory" },
			{
				name: "twitter:description",
				content: "Scaffold production-ready Nx monorepos in seconds.",
			},
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		<html suppressHydrationWarning lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="flex flex-col min-h-screen">
				<RootProvider>
					<Outlet />
				</RootProvider>
				<Scripts />
			</body>
		</html>
	);
}
