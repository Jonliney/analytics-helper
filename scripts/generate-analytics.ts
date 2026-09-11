import { buildAnalyticsProject } from "../tooling/build-project.js";

const rootDirectory = process.cwd();

try {
  const result = buildAnalyticsProject(rootDirectory);

  console.log(
    `Generated ${result.eventCount} analytics event${result.eventCount === 1 ? "" : "s"} and ${result.propertySetCount} property set${result.propertySetCount === 1 ? "" : "s"}:`,
  );

  for (const artifact of result.artifacts) {
    console.log(`  ${artifact}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
