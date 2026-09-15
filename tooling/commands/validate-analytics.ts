import { loadEventCatalog } from "../event-catalog.js";

try {
  const catalog = loadEventCatalog(process.cwd());

  for (const source of catalog.sources) {
    console.log(`✅ ${source}`);
  }

  console.log(
    `\nAll ${catalog.sources.length} analytics definition file${catalog.sources.length === 1 ? " is" : "s are"} valid (${catalog.events.length} event${catalog.events.length === 1 ? "" : "s"}, ${catalog.views.length} view${catalog.views.length === 1 ? "" : "s"}, ${catalog.propertySets.length} property set${catalog.propertySets.length === 1 ? "" : "s"}, ${catalog.userTraits ? "user traits configured" : "no user traits"}).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
