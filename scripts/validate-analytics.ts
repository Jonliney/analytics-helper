import { loadEventCatalog } from "../tooling/event-catalog.js";
import { loadAnalyticsProjectConfig } from "../tooling/project-config.js";

try {
  loadAnalyticsProjectConfig(process.cwd());
  const catalog = loadEventCatalog(process.cwd());

  for (const source of catalog.sources) {
    console.log(`✅ ${source}`);
  }

  console.log(
    `\nAll ${catalog.sources.length} analytics event file${catalog.sources.length === 1 ? " is" : "s are"} valid (${catalog.events.length} event${catalog.events.length === 1 ? "" : "s"}).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
