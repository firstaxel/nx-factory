#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "node:module";
import { addAppCommand } from "./commands/add-app.js";
import { addAuthCommand } from "./commands/add-auth.js";
import { addComponentCommand } from "./commands/add-component.js";
import { addLibCommand } from "./commands/add-lib.js";
import { addStorybookCommand } from "./commands/add-storybook.js";
import { doctorCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";
import { listCommand } from "./commands/list.js";
import { cleanupMigrationBackups, migrateCommand } from "./commands/migrate.js";
import { publishCommand } from "./commands/publish.js";
import { removeComponentCommand } from "./commands/remove-component.js";
import { updateCommand } from "./commands/update.js";
import { printBanner } from "./ui.js";

const _require = createRequire(import.meta.url);
const _pkg = _require("../package.json") as { version: string };

const program = new Command();

printBanner();

program
	.name("nx-factory")
	.description(
		"Initialize and manage an Nx monorepo with shared shadcn/ui components",
	)
	.version(_pkg.version);

program
	.command("init")
	.description("Initialize a new Nx monorepo with a shared UI package")
	.option("-n, --name <n>", "Workspace name")
	.option("-p, --pkg-manager <manager>", "Package manager (npm|pnpm|yarn|bun)")
	.option("-y, --yes", "Skip all prompts and use defaults")
	.option(
		"--dry-run",
		"Preview files that would be created without writing anything",
	)
	.action(initCommand);

program
	.command("add-app")
	.description(
		"Scaffold a new app inside the monorepo that consumes the shared UI",
	)
	.option("-n, --name <n>", "App name")
	.option("-f, --framework <framework>", "Framework (nextjs|vite|remix|expo)")
	.option("-y, --yes", "Skip all prompts and use defaults")
	.option(
		"--dry-run",
		"Preview files that would be created without writing anything",
	)
	.action(addAppCommand);

program
	.command("add-component")
	.description("Add a shadcn component to the shared UI package")
	.argument("[components...]", "Component name(s) to add")
	.option("--dry-run", "Preview what would be added without writing anything")
	.action(addComponentCommand);

program
	.command("remove-component")
	.description("Remove a shadcn component from the shared UI package")
	.argument("[components...]", "Component name(s) to remove")
	.option("-y, --yes", "Skip confirmation prompts")
	.option("--dry-run", "Preview what would be removed without writing anything")
	.action((components, opts) => removeComponentCommand(components, opts));

program
	.command("update")
	.description("Update installed shadcn components to their latest versions")
	.argument(
		"[components...]",
		"Specific components to update (defaults to all)",
	)
	.option("-y, --yes", "Skip confirmation, update all without prompting")
	.option("--dry-run", "Preview what would be updated without writing anything")
	.action((components, opts) => updateCommand(components, opts));

program
	.command("list")
	.description("List installed shadcn components and their usage across apps")
	.action(listCommand);

program
	.command("doctor")
	.description("Validate workspace health and auto-fix barrel export issues")
	.action(doctorCommand);

program
	.command("add-lib")
	.description("Scaffold a generic shared library in packages/")
	.option("-n, --name <n>", "Library name")
	.option("-t, --type <type>", "Library type (utils|hooks|config|types|api)")
	.option("-y, --yes", "Skip all prompts and use defaults")
	.option(
		"--dry-run",
		"Preview files that would be created without writing anything",
	)
	.action(addLibCommand);

program
	.command("add-storybook")
	.description(
		"Add Storybook to the shared UI package with auto-generated component stories",
	)
	.option("--dry-run", "Preview what would be created without writing anything")
	.action(addStorybookCommand);

program
	.command("publish")
	.description("Build and publish the shared UI package to npm")
	.option("--tag <tag>", "npm dist-tag (default: latest)")
	.option("-y, --yes", "Skip all prompts and use defaults")
	.option("--dry-run", "Preview the publish steps without actually publishing")
	.action(publishCommand);

program
	.command("add-auth")
	.description("Add authentication to an app (Clerk | Better Auth | WorkOS)")
	.option("-a, --app <name>", "Target app in apps/")
	.option(
		"-p, --provider <provider>",
		"Auth provider (clerk|better-auth|workos)",
	)
	.option("-f, --framework <framework>", "Framework (nextjs|vite|remix|expo)")
	.option("-y, --yes", "Skip all prompts and use defaults")
	.option("--dry-run", "Preview what would be created without writing anything")
	.action(addAuthCommand);

program
	.command("migrate")
	.description(
		"Migrate an existing nx-factory-cli workspace to the latest configuration",
	)
	.option("-y, --yes", "Skip confirmation prompts")
	.option("--dry-run", "Preview what would be changed without writing anything")
	.action(migrateCommand);

program
	.command("cleanup-backups")
	.description(
		"Delete all .migration-backup files left by a previous migrate run",
	)
	.option(
		"--dry-run",
		"Preview which files would be deleted without deleting them",
	)
	.action(async (opts: { dryRun?: boolean }) => {
		const { requireMonorepoRoot, MonorepoRootNotFoundError } = await import(
			"./resolve-root.js"
		);
		const { printError, printSuccess, c } = await import("./ui.js");
		let root: string;
		try {
			root = await requireMonorepoRoot();
		} catch (err) {
			if (err instanceof MonorepoRootNotFoundError) {
				printError({
					title: "Could not find workspace root",
					detail: String(err),
					recovery: [{ label: "", cmd: "cd <workspace-root>" }],
				});
			} else {
				printError({
					title: "Unexpected error",
					detail: String(err),
					recovery: [],
				});
			}
			process.exit(1);
		}
		const count = await cleanupMigrationBackups(root, opts.dryRun);
		if (count === 0) {
			console.log(`\n  ${c.green("✓")}  No .migration-backup files found.\n`);
		} else if (opts.dryRun) {
			console.log(
				`\n  ${c.dim("○")}  Would delete ${count} .migration-backup file(s). Run without --dry-run to apply.\n`,
			);
		} else {
			printSuccess({
				title: `Deleted ${count} .migration-backup file(s)`,
				commands: [],
				tips: [],
			});
		}
	});

program.parse();
