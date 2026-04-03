import inquirer from "inquirer";
import path from "path";
import { pathExists, readJson, writeJson } from "../files.js";
import { loadConfig } from "../config.js";
import { run, runInDir, detectPackageManager } from "../exec.js";
import {
	c,
	q,
	createStepRunner,
	printSection,
	printSuccess,
	printError,
	printWarn,
} from "../ui.js";

type BumpType = "patch" | "minor" | "major";

interface PublishOptions {
	tag?: string; // npm dist-tag (default: "latest")
	dryRun?: boolean;
	yes?: boolean;
}

interface UiPackageJson {
	name: string;
	version: string;
	private?: boolean;
}

export async function publishCommand(options: PublishOptions): Promise<void> {
	const cfg = await loadConfig();
	const uiPkgDir = await detectUiPackageDir(cfg?.uiPackage);

	if (!uiPkgDir) {
		printError({
			title: "UI package not found",
			detail: "Run from the monorepo root.",
			recovery: [
				{ label: "", cmd: "cd <monorepo-root> && nx-factory-cli publish" },
			],
		});
		process.exit(1);
		return;
	}

	// ─── Read current package.json ────────────────────────────────────────────
	const pkgJsonPath = path.join(uiPkgDir, "package.json");
	if (!(await pathExists(pkgJsonPath))) {
		printError({
			title: "No package.json found in UI package",
			recovery: [{ label: "", cmd: "nx-factory-cli doctor" }],
		});
		process.exit(1);
		return;
	}

	const pkgJson = await readJson<UiPackageJson>(pkgJsonPath);

	if (pkgJson.private) {
		printWarn(
			`${pkgJson.name} is marked private: true`,
			"Remove 'private' from package.json to publish, or use --dry-run to preview.",
		);
		if (!options.yes) {
			const { confirmed } = await inquirer.prompt({
				type: "confirm",
				name: "confirmed",
				message: q("Continue anyway?"),
				default: false,
			});
			if (!confirmed) {
				console.log(`\n  ${c.dim("Aborted.")}\n`);
				return;
			}
		}
	}

	const currentVersion = pkgJson.version ?? "0.0.0";
	const pm = (await detectPackageManager()) ?? cfg?.pkgManager ?? "pnpm";

	// ─── Prompts ──────────────────────────────────────────────────────────────
	const defaults = {
		bumpType: "patch" as BumpType,
		tag: options.tag ?? "latest",
		registry: "https://registry.npmjs.org",
	};

	const answers = options.yes
		? defaults
		: await inquirer.prompt([
				{
					type: "select",
					name: "bumpType",
					message: q("Version bump", `current: ${currentVersion}`),
					choices: [
						{
							name: `patch   ${bumpVersion(currentVersion, "patch")}`,
							value: "patch",
						},
						{
							name: `minor   ${bumpVersion(currentVersion, "minor")}`,
							value: "minor",
						},
						{
							name: `major   ${bumpVersion(currentVersion, "major")}`,
							value: "major",
						},
					],
					default: defaults.bumpType,
				},
				{
					type: "input",
					name: "tag",
					message: q("npm dist-tag", "latest · next · beta · canary"),
					default: defaults.tag,
				},
				{
					type: "input",
					name: "registry",
					message: q("npm registry", "leave blank for default (npmjs.org)"),
					default: defaults.registry,
				},
			]);

	const bumpType = (answers.bumpType ?? defaults.bumpType) as BumpType;
	const distTag = (answers.tag ?? defaults.tag) as string;
	const registry = (answers.registry ?? defaults.registry) as string;
	const nextVersion = bumpVersion(currentVersion, bumpType);
	const pkgName = pkgJson.name;

	printSection(
		`${options.dryRun ? "[dry run] " : ""}Publishing ${pkgName}@${nextVersion}`,
	);

	const step = createStepRunner(5, options.dryRun);

	// ─── Step 1: Check npm auth ────────────────────────────────────────────────
	await step("Verify npm authentication", async () => {
		try {
			await run("npm", ["whoami", `--registry=${registry}`]);
		} catch {
			printError({
				title: "Not logged in to npm",
				recovery: [
					{ label: "Log in first:", cmd: `npm login --registry=${registry}` },
				],
			});
			process.exit(1);
			return;
		}
	});

	// ─── Step 2: Bump version ─────────────────────────────────────────────────
	await step(`Bump version ${currentVersion} → ${nextVersion}`, async () => {
		const updated = { ...pkgJson, version: nextVersion };
		await writeJson(pkgJsonPath, updated);
	});

	// ─── Step 3: Build ────────────────────────────────────────────────────────
	await step("Build package (tsc)", async () => {
		await runInDir(uiPkgDir, pm, ["run", "build"]);
	});

	// ─── Step 4: Write changelog entry ────────────────────────────────────────
	await step("Append changelog entry", async () => {
		const changelogPath = path.join(uiPkgDir, "CHANGELOG.md");
		const { default: fs } = await import("fs-extra");
		const date = new Date().toISOString().split("T")[0];
		const entry = `\n## ${nextVersion} — ${date}\n\n- ${bumpType} release\n`;
		const existing = (await pathExists(changelogPath))
			? await fs.readFile(changelogPath, "utf-8")
			: "# Changelog\n";
		const header = existing.startsWith("# Changelog")
			? existing
			: "# Changelog\n" + existing;
		const lines = header.split("\n");
		// Insert after the first line (the # Changelog heading)
		lines.splice(1, 0, entry);
		await fs.writeFile(changelogPath, lines.join("\n"), "utf-8");
	});

	// ─── Step 5: Publish ──────────────────────────────────────────────────────
	await step(`Publish to npm (tag: ${distTag})`, async () => {
		const publishArgs = [
			"publish",
			"--access=public",
			`--tag=${distTag}`,
			`--registry=${registry}`,
		];
		if (options.dryRun) publishArgs.push("--dry-run");
		await runInDir(uiPkgDir, "npm", publishArgs);
	});

	printSuccess({
		title: `${pkgName}@${nextVersion} published`,
		commands: [
			{
				cmd: `npm install ${pkgName}@${nextVersion}`,
				comment: "install in a new project",
			},
			{ cmd: `npm dist-tag ls ${pkgName}`, comment: "verify dist-tags" },
		],
		tips: options.dryRun
			? [
					{
						label: "This was a dry run — nothing was published.",
						cmd: "Remove --dry-run to publish for real",
					},
				]
			: [
					{
						label: "View on npm:",
						cmd: `https://www.npmjs.com/package/${pkgName}`,
					},
				],
	});
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function bumpVersion(version: string, type: BumpType): string {
	const parts = version.split(".").map(Number);
	const [major = 0, minor = 0, patch = 0] = parts;
	if (type === "major") return `${major + 1}.0.0`;
	if (type === "minor") return `${major}.${minor + 1}.0`;
	return `${major}.${minor}.${patch + 1}`;
}

async function detectUiPackageDir(uiPackage?: string): Promise<string | null> {
	const base = uiPackage ?? "ui";
	const configured = path.join(process.cwd(), "packages", base);
	if (await pathExists(path.join(configured, "components.json")))
		return configured;
	if (await pathExists(path.join(process.cwd(), "components.json")))
		return process.cwd();
	const packagesDir = path.join(process.cwd(), "packages");
	if (await pathExists(packagesDir)) {
		const { default: fs } = await import("fs-extra");
		const dirs = await fs.readdir(packagesDir);
		for (const d of dirs) {
			const candidate = path.join(packagesDir, d);
			if (await pathExists(path.join(candidate, "components.json")))
				return candidate;
		}
	}
	return null;
}
