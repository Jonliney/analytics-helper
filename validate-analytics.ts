import { loadEventCatalog } from "./tooling/event-catalog.js";

try {
  const catalog = loadEventCatalog(process.cwd());
  const sources = [...new Set(catalog.events.map((event) => event.source))];

  for (const source of sources) {
    console.log(`✅ ${source}`);
  }

  console.log(
    `\nAll ${sources.length} analytics event file${sources.length === 1 ? " is" : "s are"} valid (${catalog.events.length} event${catalog.events.length === 1 ? "" : "s"}).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
