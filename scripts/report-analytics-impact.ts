import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { loadEventCatalog } from "../tooling/event-catalog.js";
import { LANGUAGE_NEUTRAL_CATALOG_SCHEMA_VERSION } from "../tooling/generate-catalog.js";
import {
  compareAnalyticsImpact,
  formatAnalyticsImpactReport,
} from "../tooling/analytics-impact.js";
import {
  impactCatalogFromEventCatalog,
  parseImpactCatalog,
} from "../tooling/property-set-impact.js";

type CommandOptions = Readonly<{
  base: string;
  json: boolean;
  help: boolean;
}>;

const USAGE = `Usage: pnpm impact [--base <git-ref>] [--json]

Reports event, view, user-trait, and property-set changes relative to a committed catalog.

Options:
  --base <git-ref>  Compare with the catalog committed at this ref (default: HEAD)
  --json            Print the complete report as JSON instead of Markdown
  --help            Show this help`;

export function parseCommandOptions(args: readonly string[]): CommandOptions {
  let base = "HEAD";
  let json = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;

    if (argument === "--json") {
      json = true;
    } else if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument === "--base") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--base requires a git ref");
      }
      base = value;
      index += 1;
    } else if (argument.startsWith("--base=")) {
      const value = argument.slice("--base=".length);
      if (!value) {
        throw new Error("--base requires a git ref");
      }
      base = value;
    } else {
      throw new Error(`Unknown option ${JSON.stringify(argument)}`);
    }
  }

  return { base, json, help };
}

function readCatalogAtRef(rootDirectory: string, base: string): unknown {
  const catalogPath = "generated/analytics-catalog.json";

  let contents: string;
  try {
    contents = execFileSync("git", ["show", `${base}:${catalogPath}`], {
      cwd: rootDirectory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      `Could not read ${catalogPath} at git ref ${JSON.stringify(base)}`,
    );
  }

  try {
    return JSON.parse(contents) as unknown;
  } catch {
    throw new Error(
      `${catalogPath} at git ref ${JSON.stringify(base)} is not valid JSON`,
    );
  }
}

export function run(args: readonly string[], rootDirectory: string): string {
  const options = parseCommandOptions(args);

  if (options.help) {
    return USAGE;
  }

  const previous = parseImpactCatalog(
    readCatalogAtRef(rootDirectory, options.base),
  );
  const proposed = impactCatalogFromEventCatalog(
    loadEventCatalog(rootDirectory),
    LANGUAGE_NEUTRAL_CATALOG_SCHEMA_VERSION,
  );
  const report = compareAnalyticsImpact(previous, proposed, options.base);

  return options.json
    ? JSON.stringify(report, null, 2)
    : formatAnalyticsImpactReport(report);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(run(process.argv.slice(2), process.cwd()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
