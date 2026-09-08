import { execFileSync } from "node:child_process";

import {
  compareCatalogs,
  isVersionBumpSufficient,
  type CatalogComparison,
  type VersionBump,
} from "./tooling/catalog-compatibility.js";
import { parseCatalogSnapshot } from "./tooling/catalog-snapshot.js";
import {
  loadEventCatalog,
  type EventDefinition,
} from "./tooling/event-catalog.js";

type SelectedBump = Exclude<VersionBump, "none">;
type OutputFormat = "text" | "markdown";
const SELECTED_BUMPS = new Set<SelectedBump>(["patch", "minor", "major"]);

type CommandOptions = Readonly<{
  baseRef: string;
  bump?: SelectedBump;
  format: OutputFormat;
}>;

function usage(): string {
  return [
    "Usage:",
    "  pnpm compatibility --base-ref <git-ref> [--bump patch|minor|major] [--format text|markdown]",
  ].join("\n");
}

function isSelectedBump(value: string): value is SelectedBump {
  return SELECTED_BUMPS.has(value as SelectedBump);
}

function parseArguments(arguments_: readonly string[]): CommandOptions {
  let baseRef: string | undefined;
  let bump: SelectedBump | undefined;
  let format: OutputFormat = "text";

  for (let index = 0; index < arguments_.length; index += 1) {
    const option = arguments_[index];
    const value = arguments_[index + 1];

    if (!value) {
      throw new Error(`Missing value for ${option ?? "argument"}.\n${usage()}`);
    }

    switch (option) {
      case "--base-ref":
        baseRef = value;
        break;
      case "--bump":
        if (!isSelectedBump(value)) {
          throw new Error(`Invalid version bump ${JSON.stringify(value)}.\n${usage()}`);
        }
        bump = value;
        break;
      case "--format":
        if (value !== "text" && value !== "markdown") {
          throw new Error(`Invalid output format ${JSON.stringify(value)}.\n${usage()}`);
        }
        format = value;
        break;
      default:
        throw new Error(`Unknown option ${JSON.stringify(option)}.\n${usage()}`);
    }

    index += 1;
  }

  if (!baseRef) {
    throw new Error(`--base-ref is required.\n${usage()}`);
  }

  return { baseRef, ...(bump ? { bump } : {}), format };
}

function readCatalogAtRef(baseRef: string): readonly EventDefinition[] {
  const catalogPath = "generated/analytics-catalog.json";
  let contents: string;

  try {
    contents = execFileSync(
      "git",
      ["show", `${baseRef}:${catalogPath}`],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    throw new Error(
      `Could not read ${catalogPath} at Git ref ${JSON.stringify(baseRef)}.`,
      { cause: error },
    );
  }

  return parseCatalogSnapshot(contents, `${baseRef}:${catalogPath}`);
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatComparison(
  comparison: CatalogComparison,
  format: OutputFormat,
  selectedBump?: SelectedBump,
): string {
  const sufficient = selectedBump
    ? isVersionBumpSufficient(selectedBump, comparison.requiredBump)
    : undefined;

  if (format === "markdown") {
    const lines = [
      "## Analytics contract compatibility",
      "",
      `Minimum version bump: **${comparison.requiredBump}**.`,
    ];

    if (selectedBump) {
      lines.push(
        `Selected version bump: **${selectedBump}** (${sufficient ? "sufficient" : "insufficient"}).`,
      );
    }

    if (comparison.changes.length === 0) {
      lines.push("", "No contract changes detected.");
      return lines.join("\n");
    }

    lines.push("", "| Impact | Contract | Change |", "| --- | --- | --- |");
    for (const change of comparison.changes) {
      lines.push(
        `| ${change.impact} | \`${escapeMarkdown(change.path)}\` | ${escapeMarkdown(change.message)} |`,
      );
    }

    return lines.join("\n");
  }

  const lines = [`Minimum version bump: ${comparison.requiredBump}`];
  if (selectedBump) {
    lines.push(
      `Selected version bump: ${selectedBump} (${sufficient ? "sufficient" : "insufficient"})`,
    );
  }
  for (const change of comparison.changes) {
    lines.push(`[${change.impact.toUpperCase()}] ${change.path}: ${change.message}`);
  }
  if (comparison.changes.length === 0) {
    lines.push("No contract changes detected.");
  }

  return lines.join("\n");
}

try {
  const options = parseArguments(process.argv.slice(2));
  const previousEvents = readCatalogAtRef(options.baseRef);
  const currentEvents = loadEventCatalog(process.cwd()).events;
  const comparison = compareCatalogs(previousEvents, currentEvents);

  console.log(formatComparison(comparison, options.format, options.bump));

  if (
    options.bump &&
    !isVersionBumpSufficient(options.bump, comparison.requiredBump)
  ) {
    console.error(
      `Selected ${options.bump} bump is insufficient; ${comparison.requiredBump} is required.`,
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
