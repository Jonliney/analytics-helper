import assert from "node:assert/strict";
import test from "node:test";

import {
  compareAnalyticsImpact,
  formatAnalyticsImpactReport,
} from "../tooling/analytics-impact.js";
import { parseImpactCatalog } from "../tooling/property-set-impact.js";

function catalog(propertySets: unknown[], events: unknown[]) {
  return parseImpactCatalog({ schemaVersion: 4, propertySets, events });
}

const signupEvent = {
  name: "Signup Completed",
  domain: "auth",
  key: "signupCompleted",
  propertySets: [],
  description: "A signup succeeds",
  properties: {
    method: { type: "string", optional: false },
  },
  status: "active",
};

test("reports direct event contract and metadata changes", () => {
  const previous = catalog([], [signupEvent]);
  const proposed = catalog([], [
    {
      ...signupEvent,
      description: "A user completes signup",
      allowAdditionalProperties: true,
      properties: {
        ...signupEvent.properties,
        campaign_id: { type: "string", optional: true },
      },
    },
  ]);

  const report = compareAnalyticsImpact(previous, proposed, "origin/main");

  assert.equal(report.recommendedVersionBump, "minor");
  assert.deepEqual(report.summary, {
    eventsAdded: 0,
    eventsRemoved: 0,
    eventsChanged: 1,
    eventsDeprecated: 0,
    propertySetsChanged: 0,
    affectedEvents: 1,
  });
  assert.equal(report.events[0]?.classification, "additive");
  assert.deepEqual(
    report.events[0]?.fields.map((impact) => impact.field),
    ["description", "allowAdditionalProperties"],
  );
  assert.equal(report.events[0]?.properties[0]?.property, "campaign_id");
});

test("reports event additions and removals as one release impact", () => {
  const previous = catalog([], [signupEvent]);
  const proposed = catalog([], [
    {
      ...signupEvent,
      name: "Application Opened",
      domain: undefined,
      key: "applicationOpened",
    },
  ]);

  const report = compareAnalyticsImpact(previous, proposed, "HEAD");

  assert.equal(report.recommendedVersionBump, "major");
  assert.equal(report.summary.eventsAdded, 1);
  assert.equal(report.summary.eventsRemoved, 1);
});

test("uses a stable scoped key to identify a provider event rename", () => {
  const previous = catalog([], [signupEvent]);
  const proposed = catalog([], [
    { ...signupEvent, name: "Registration Completed" },
  ]);

  const report = compareAnalyticsImpact(previous, proposed, "HEAD");

  assert.equal(report.summary.eventsAdded, 0);
  assert.equal(report.summary.eventsRemoved, 0);
  assert.equal(report.summary.eventsChanged, 1);
  assert.equal(report.events[0]?.fields[0]?.field, "name");
  assert.equal(report.events[0]?.classification, "breaking");
});

test("identifies properties inherited from a changed property set", () => {
  const previous = catalog(
    [{ name: "session_context", properties: {} }],
    [{ ...signupEvent, propertySets: ["session_context"] }],
  );
  const proposed = catalog(
    [
      {
        name: "session_context",
        properties: { session_id: { type: "string", optional: false } },
      },
    ],
    [
      {
        ...signupEvent,
        propertySets: ["session_context"],
        properties: {
          ...signupEvent.properties,
          session_id: { type: "string", optional: false },
        },
      },
    ],
  );

  const report = compareAnalyticsImpact(previous, proposed, "origin/main");
  const markdown = formatAnalyticsImpactReport(report);

  assert.equal(report.recommendedVersionBump, "major");
  assert.equal(
    report.events[0]?.properties.find(
      (property) => property.property === "session_id",
    )?.inheritedFrom,
    "session_context",
  );
  assert.match(markdown, /^# Analytics contract impact/);
  assert.match(markdown, /inherited from `session_context`/);
  assert.match(markdown, /Affected events \(1\)/);
});

test("reports deprecation without treating it as a breaking removal", () => {
  const previous = catalog([], [signupEvent]);
  const proposed = catalog([], [
    {
      ...signupEvent,
      status: "deprecated",
      deprecatedSince: "2026-09-14",
      replacement: "Registration Completed",
    },
  ]);

  const report = compareAnalyticsImpact(previous, proposed, "HEAD");

  assert.equal(report.recommendedVersionBump, "minor");
  assert.equal(report.summary.eventsDeprecated, 1);
});

test("renders a ticket-ready empty report", () => {
  const unchanged = catalog([], [signupEvent]);
  const report = compareAnalyticsImpact(unchanged, unchanged, "HEAD");

  assert.equal(report.recommendedVersionBump, "none");
  assert.equal(
    formatAnalyticsImpactReport(report),
    "# Analytics contract impact\n\nBase: `HEAD`  \nRecommended version change: **none**\n\nNo analytics contract changes found.",
  );
});
