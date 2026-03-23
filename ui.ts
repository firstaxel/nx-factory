import chalk from "chalk";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

// ─── Palette ──────────────────────────────────────────────────────────────────
// One place to change colors for the whole CLI.
export const c = {
  purple:     chalk.hex("#818cf8"),
  purpleDim:  chalk.hex("#4f46a8"),
  purpleBold: chalk.hex("#818cf8").bold,
  green:      chalk.hex("#86efac"),
  greenBold:  chalk.hex("#86efac").bold,
  yellow:     chalk.hex("#fde68a"),
  red:        chalk.hex("#fca5a5"),
  cyan:       chalk.hex("#67e8f9"),
  white:      chalk.hex("#f1f5f9"),
  whiteBold:  chalk.hex("#f1f5f9").bold,
  dim:        chalk.hex("#6b7280"),
  dimItalic:  chalk.hex("#6b7280").italic,
  muted:      chalk.hex("#4b5563"),
};

// ─── Banner ───────────────────────────────────────────────────────────────────
export function printBanner(): void {
  const version = c.dim(`v${pkg.version}`);
  const logo    = c.purpleBold("NX↗");
  const name    = c.whiteBold("nx-factory");
  const tagline = c.dim("Monorepo scaffold · shadcn/ui + Tailwind v4");

  const pills = [
    pill("Nx",          "green"),
    pill("shadcn/ui",   "yellow"),
    pill("Tailwind v4", "cyan"),
    pill("TypeScript",  "purple"),
  ].join("  ");

  console.log();
  console.log(`  ${logo}  ${name} ${version}`);
  console.log(`     ${tagline}`);
  console.log(`     ${pills}`);
  console.log();
}

function pill(label: string, color: keyof typeof c): string {
  const colorfn = c[color] as (s: string) => string;
  return colorfn(`[${label}]`);
}

// ─── Section header ───────────────────────────────────────────────────────────
// Prints a faint divider with a label — used between major phases of init.
export function printSection(label: string): void {
  const line = c.muted("─".repeat(36));
  console.log(`\n  ${line}`);
  console.log(`  ${c.dim(label)}`);
  console.log(`  ${line}`);
}

// ─── Step progress ────────────────────────────────────────────────────────────
// Usage:
//   const step = createStepRunner(6);
//   await step("Creating Nx workspace", fn);
//   Pass dryRun=true to preview steps without executing them.
export type StepRunner = (
  label: string,
  fn: () => Promise<void>,
) => Promise<void>;

export function createStepRunner(total: number, dryRun = false): StepRunner {
  let current = 0;

  return async (label: string, fn: () => Promise<void>) => {
    current++;
    const counter  = c.dim(`[${current}/${total}]`);
    const dryLabel = dryRun ? c.dim(" [dry run]") : "";

    if (dryRun) {
      console.log(`\n  ${c.purpleDim("│")} ${counter} ${c.dim(label)}${dryLabel}`);
      return;
    }

    process.stdout.write(`\n  ${c.purpleDim("│")} ${counter} ${c.white(label)}…`);

    try {
      await fn();
      process.stdout.write(`\r  ${c.green("│")} ${counter} ${c.white(label)} ${c.green("✓")}\n`);
    } catch (err) {
      process.stdout.write(`\r  ${c.red("│")} ${counter} ${c.white(label)} ${c.red("✗")}\n`);
      throw err;
    }
  };
}

// ─── Prompt prefix ────────────────────────────────────────────────────────────
// Returns a chalk-formatted "? label" string for use in inquirer's `message`.
// Inquirer renders the message as-is, so we pre-color it here.
export function q(label: string, hint?: string): string {
  const base = `  ${c.purple("?")} ${c.white(label)}`;
  return hint ? `${base}\n    ${c.dim(hint)}` : base;
}

// ─── Detected-value label ─────────────────────────────────────────────────────
// Appends a dim "(detected)" label to the default value shown in a list prompt.
export function detected(value: string): string {
  return `${value}  ${c.dim("(detected)")}`;
}

// ─── Success box ──────────────────────────────────────────────────────────────
export interface SuccessOptions {
  title:    string;
  commands: Array<{ cmd: string; comment?: string }>;
  tips?:    Array<{ label: string; cmd: string }>;
}

// Strip ANSI escape codes to get the visible character width
function visibleLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function boxRow(content: string, w: number, borderFn: (s: string) => string): string {
  const pad = w - visibleLen(content);
  return `${borderFn("│")} ${content}${" ".repeat(Math.max(0, pad))} ${borderFn("│")}`;
}

export function printSuccess(opts: SuccessOptions): void {
  const { title, commands, tips = [] } = opts;
  const w   = 56;
  const top = c.green("╭" + "─".repeat(w) + "╮");
  const bot = c.green("╰" + "─".repeat(w) + "╯");
  const row = (s: string) => boxRow(s, w, c.green);
  const blank = row("");

  console.log();
  console.log(`  ${top}`);
  console.log(`  ${row(c.greenBold("✓  " + title))}`);
  console.log(`  ${blank}`);

  for (const { cmd, comment } of commands) {
    const line = comment
      ? c.cyan(cmd) + "  " + c.muted("# " + comment)
      : c.cyan(cmd);
    console.log(`  ${row(line)}`);
  }

  if (tips.length > 0) {
    console.log(`  ${blank}`);
    for (const { label, cmd } of tips) {
      console.log(`  ${row(c.dim(label))}`);
      console.log(`  ${row("  " + c.purple(cmd))}`);
    }
  }

  console.log(`  ${bot}`);
  console.log();
}

// ─── Error box ────────────────────────────────────────────────────────────────
export interface ErrorOptions {
  title:    string;
  detail?:  string;
  recovery: Array<{ label: string; cmd: string }>;
}

export function printError(opts: ErrorOptions): void {
  const { title, detail, recovery } = opts;
  const w   = 56;
  const top = c.red("╭" + "─".repeat(w) + "╮");
  const bot = c.red("╰" + "─".repeat(w) + "╯");
  const row = (s: string) => boxRow(s, w, c.red);
  const blank = row("");

  console.log();
  console.log(`  ${top}`);
  console.log(`  ${row(c.red("✗  " + title))}`);
  if (detail) console.log(`  ${row(c.dim("   " + detail))}`);
  console.log(`  ${blank}`);
  console.log(`  ${row(c.dim("Recover manually:"))}`);

  for (const { label, cmd } of recovery) {
    if (label) console.log(`  ${row(c.dim("  " + label))}`);
    console.log(`  ${row("  " + c.purple(cmd))}`);
  }

  console.log(`  ${bot}`);
  console.log();
}

// ─── Inline step fail (non-fatal) ─────────────────────────────────────────────
// For steps that fail but shouldn't abort the whole command.
export function printWarn(message: string, hint?: string): void {
  console.log(`\n  ${c.yellow("⚠")}  ${c.yellow(message)}`);
  if (hint) console.log(`     ${c.dim(hint)}`);
}
