import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadAnalyticsProjectConfig } from "../tooling/project-config.js";

test("loads the configured deprecation period", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-config-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, "analytics.config.json"),
    JSON.stringify({ deprecationGracePeriodDays: 90 }),
  );

  assert.deepEqual(loadAnalyticsProjectConfig(root), {
    deprecationGracePeriodDays: 90,
  });
});

test("rejects invalid deprecation periods", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-config-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, "analytics.config.json"),
    JSON.stringify({ deprecationGracePeriodDays: -1 }),
  );

  assert.throws(
    () => loadAnalyticsProjectConfig(root),
    /analytics\.config\.json is invalid/,
  );
});
