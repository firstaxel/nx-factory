#!/usr/bin/env node
import { Command } from "commander";
import { printBanner } from "./ui.js";
import { initCommand }            from "./commands/init.js";
import { addAppCommand }          from "./commands/add-app.js";
import { addComponentCommand }    from "./commands/add-component.js";
import { removeComponentCommand } from "./commands/remove-component.js";
import { updateCommand }          from "./commands/update.js";
import { listCommand }            from "./commands/list.js";
import { doctorCommand }          from "./commands/doctor.js";
import { addLibCommand }          from "./commands/add-lib.js";
import { addStorybookCommand }    from "./commands/add-storybook.js";
import { publishCommand }         from "./commands/publish.js";
import { addAuthCommand }         from "./commands/add-auth.js";

const program = new Command();

printBanner();

program
  .name("nx-factory")
  .description("Initialize and manage an Nx monorepo with shared shadcn/ui components")
  .version("1.0.0");

program
  .command("init")
  .description("Initialize a new Nx monorepo with a shared UI package")
  .option("-n, --name <n>",              "Workspace name")
  .option("-p, --pkg-manager <manager>", "Package manager (npm|pnpm|yarn|bun)")
  .option("-y, --yes",                   "Skip all prompts and use defaults")
  .option("--dry-run",                   "Preview files that would be created without writing anything")
  .action(initCommand);

program
  .command("add-app")
  .description("Scaffold a new app inside the monorepo that consumes the shared UI")
  .option("-n, --name <n>",              "App name")
  .option("-f, --framework <framework>", "Framework (nextjs|vite|remix|expo)")
  .option("-y, --yes",                   "Skip all prompts and use defaults")
  .option("--dry-run",                   "Preview files that would be created without writing anything")
  .action(addAppCommand);

program
  .command("add-component")
  .description("Add a shadcn component to the shared UI package")
  .argument("[components...]",           "Component name(s) to add")
  .option("--dry-run",                   "Preview what would be added without writing anything")
  .action(addComponentCommand);

program
  .command("remove-component")
  .description("Remove a shadcn component from the shared UI package")
  .argument("[components...]",           "Component name(s) to remove")
  .option("-y, --yes",                   "Skip confirmation prompts")
  .option("--dry-run",                   "Preview what would be removed without writing anything")
  .action((components, opts) => removeComponentCommand(components, opts));

program
  .command("update")
  .description("Update installed shadcn components to their latest versions")
  .argument("[components...]",           "Specific components to update (defaults to all)")
  .option("-y, --yes",                   "Skip confirmation, update all without prompting")
  .option("--dry-run",                   "Preview what would be updated without writing anything")
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
  .option("-n, --name <n>",       "Library name")
  .option("-t, --type <type>",    "Library type (utils|hooks|config|types|api)")
  .option("-y, --yes",            "Skip all prompts and use defaults")
  .option("--dry-run",            "Preview files that would be created without writing anything")
  .action(addLibCommand);

program
  .command("add-storybook")
  .description("Add Storybook to the shared UI package with auto-generated component stories")
  .option("--dry-run",            "Preview what would be created without writing anything")
  .action(addStorybookCommand);

program
  .command("publish")
  .description("Build and publish the shared UI package to npm")
  .option("--tag <tag>",          "npm dist-tag (default: latest)")
  .option("-y, --yes",            "Skip all prompts and use defaults")
  .option("--dry-run",            "Preview the publish steps without actually publishing")
  .action(publishCommand);

program
  .command("add-auth")
  .description("Add authentication to an app (Clerk | Better Auth | WorkOS)")
  .option("-a, --app <name>",          "Target app in apps/")
  .option("-p, --provider <provider>", "Auth provider (clerk|better-auth|workos)")
  .option("-f, --framework <framework>","Framework (nextjs|vite|remix|expo)")
  .option("-y, --yes",                 "Skip all prompts and use defaults")
  .option("--dry-run",                 "Preview what would be created without writing anything")
  .action(addAuthCommand);

program.parse();
