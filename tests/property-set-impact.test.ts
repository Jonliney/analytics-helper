import assert from "node:assert/strict";
import test from "node:test";

import { parseCommandOptions } from "../tooling/commands/report-analytics-impact.js";
import {
  comparePropertySetImpact,
  formatPropertySetImpactReport,
  parseImpactCatalog,
} from "../tooling/property-set-impact.js";

function catalog(
  propertySets: unknown[],
  events: unknown[] = [],
) {
  return parseImpactCatalog({ schemaVersion: 4, propertySets, events });
}

const sessionEvent = {
  name: "Signup Completed",
  domain: "auth",
  key: "signupCompleted",
  propertySets: ["session_context"],
};

test("reports required shared properties as breaking and lists affected contracts", () => {
  const previous = catalog(
    [
      {
        name: "session_context",
        properties: { session_id: { type: "string", optional: true } },
      },
    ],
    [sessionEvent],
  );
  const proposed = catalog(
    [
      {
        name: "session_context",
        properties: {
          session_id: { type: "string", optional: true },
          device_id: { type: "string", optional: false },
        },
      },
    ],
    [
      sessionEvent,
      {
        name: "Checkout Started",
        domain: "checkout",
        key: "checkoutStarted",
        propertySets: ["session_context"],
      },
    ],
  );

  const report = comparePropertySetImpact(previous, proposed, "origin/main");

  assert.equal(report.recommendedVersionBump, "major");
  assert.equal(report.impacts.length, 1);
  assert.equal(report.impacts[0]?.classification, "breaking");
  assert.deepEqual(report.impacts[0]?.affectedDomains, ["auth", "checkout"]);
  assert.deepEqual(
    report.impacts[0]?.affectedEvents.map((event) => event.name),
    ["Checkout Started", "Signup Completed"],
  );
  assert.deepEqual(report.impacts[0]?.properties[0]?.summary, [
    "added as required",
  ]);
});

test("reports optional shared properties as additive", () => {
  const previous = catalog([
    { name: "session_context", properties: {} },
  ]);
  const proposed = catalog([
    {
      name: "session_context",
      properties: { locale: { type: "string", optional: true } },
    },
  ]);

  const report = comparePropertySetImpact(previous, proposed, "HEAD");

  assert.equal(report.recommendedVersionBump, "minor");
  assert.equal(report.impacts[0]?.classification, "additive");
  assert.equal(report.impacts[0]?.properties[0]?.classification, "additive");
});

test("detects a new required set attached to an existing event", () => {
  const previous = catalog([], [
    { ...sessionEvent, propertySets: [] },
  ]);
  const proposed = catalog(
    [
      {
        name: "session_context",
        properties: { session_id: { type: "string", optional: false } },
      },
    ],
    [sessionEvent],
  );

  const report = comparePropertySetImpact(previous, proposed, "HEAD");

  assert.equal(report.recommendedVersionBump, "major");
  assert.equal(report.impacts[0]?.classification, "breaking");
});

test("classifies restrictive enum changes as breaking", () => {
  const previous = catalog([
    {
      name: "session_context",
      properties: { platform: { type: "string", optional: false } },
    },
  ]);
  const proposed = catalog([
    {
      name: "session_context",
      properties: {
        platform: {
          type: "string",
          optional: false,
          enum: ["web", "ios"],
        },
      },
    },
  ]);

  const report = comparePropertySetImpact(previous, proposed, "HEAD");

  assert.equal(report.recommendedVersionBump, "major");
  assert.equal(report.impacts[0]?.properties[0]?.classification, "breaking");
});

test("reports property-set description changes as metadata", () => {
  const previous = catalog([
    {
      name: "session_context",
      description: "Session details",
      properties: {},
    },
  ]);
  const proposed = catalog([
    {
      name: "session_context",
      description: "Context for the current session",
      properties: {},
    },
  ]);

  const report = comparePropertySetImpact(previous, proposed, "HEAD");

  assert.equal(report.recommendedVersionBump, "patch");
  assert.equal(report.impacts[0]?.fields[0]?.field, "description");
});

test("returns an empty informational report when property sets are unchanged", () => {
  const unchanged = catalog([]);
  const report = comparePropertySetImpact(unchanged, unchanged, "HEAD");

  assert.equal(report.recommendedVersionBump, "none");
  assert.deepEqual(report.impacts, []);
  assert.equal(
    formatPropertySetImpactReport(report),
    "No property set changes found relative to HEAD.",
  );
});

test("accepts catalogs created before property sets and stable keys existed", () => {
  const earlierCatalog = parseImpactCatalog({
    schemaVersion: 1,
    events: [{ name: "Application Opened" }],
  });

  assert.deepEqual(earlierCatalog.propertySets, []);
  assert.deepEqual(earlierCatalog.views, []);
  assert.equal(earlierCatalog.userTraits, null);
  assert.equal(earlierCatalog.events[0]?.key, undefined);
  assert.deepEqual(earlierCatalog.events[0]?.propertySets, []);
});

test("parses --json and both --base forms", () => {
  assert.deepEqual(parseCommandOptions([]), {
    base: "HEAD",
    json: false,
    help: false,
  });
  assert.deepEqual(parseCommandOptions(["--json", "--base", "origin/main"]), {
    base: "origin/main",
    json: true,
    help: false,
  });
  assert.equal(parseCommandOptions(["--base=v1.2.3"]).base, "v1.2.3");
  assert.throws(() => parseCommandOptions(["--base"]), /requires a git ref/);
  assert.throws(() => parseCommandOptions(["--wat"]), /Unknown option/);
});
