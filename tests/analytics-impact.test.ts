import assert from "node:assert/strict";
import test from "node:test";

import {
  compareAnalyticsImpact,
  formatAnalyticsImpactReport,
} from "../tooling/analytics-impact.js";
import { parseImpactCatalog } from "../tooling/property-set-impact.js";

function catalog(
  propertySets: unknown[],
  events: unknown[],
  views: unknown[] = [],
  userTraits: unknown = null,
) {
  return parseImpactCatalog({
    schemaVersion: 4,
    propertySets,
    events,
    views,
    userTraits,
  });
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

const settingsView = {
  name: "Settings",
  key: "settings",
  description: "A user views settings",
  allowAdditionalProperties: false,
  properties: {},
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
    viewsAdded: 0,
    viewsRemoved: 0,
    viewsChanged: 0,
    userTraitsChanged: false,
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

test("includes views and user traits in the release recommendation", () => {
  const previous = catalog([], [signupEvent]);
  const proposed = catalog(
    [],
    [signupEvent],
    [settingsView],
    {
      description: "Durable user traits",
      allowAdditionalTraits: false,
      traits: {
        account_id: { type: "string", optional: false },
      },
    },
  );

  const report = compareAnalyticsImpact(previous, proposed, "HEAD");
  const markdown = formatAnalyticsImpactReport(report);

  assert.equal(report.recommendedVersionBump, "major");
  assert.equal(report.summary.viewsAdded, 1);
  assert.equal(report.summary.userTraitsChanged, true);
  assert.equal(report.views[0]?.change, "added");
  assert.equal(report.views[0]?.classification, "additive");
  assert.equal(report.userTraits?.classification, "breaking");
  assert.equal(report.userTraits?.properties[0]?.property, "account_id");
  assert.match(markdown, /Added views/);
  assert.match(markdown, /User-trait changes/);
  assert.match(markdown, /Added required property `account_id`/);
});

test("classifies changed and removed views", () => {
  const previous = catalog([], [signupEvent], [settingsView]);
  const changed = catalog([], [signupEvent], [
    {
      ...settingsView,
      properties: {
        section: { type: "string", optional: false },
      },
    },
  ]);
  const removed = catalog([], [signupEvent]);

  const changedReport = compareAnalyticsImpact(previous, changed, "HEAD");
  const removedReport = compareAnalyticsImpact(previous, removed, "HEAD");

  assert.equal(changedReport.recommendedVersionBump, "major");
  assert.equal(changedReport.summary.viewsChanged, 1);
  assert.equal(changedReport.views[0]?.properties[0]?.property, "section");
  assert.equal(removedReport.recommendedVersionBump, "major");
  assert.equal(removedReport.summary.viewsRemoved, 1);
  assert.equal(removedReport.views[0]?.change, "removed");
});

test("classifies optional trait additions as additive and removals as breaking", () => {
  const withoutTraits = catalog([], [signupEvent]);
  const withTraits = catalog([], [signupEvent], [], {
    description: "Durable user traits",
    allowAdditionalTraits: false,
    traits: {
      plan: { type: "string", optional: true },
    },
  });

  const added = compareAnalyticsImpact(withoutTraits, withTraits, "HEAD");
  const removed = compareAnalyticsImpact(withTraits, withoutTraits, "HEAD");

  assert.equal(added.recommendedVersionBump, "minor");
  assert.equal(added.userTraits?.change, "added");
  assert.equal(added.userTraits?.properties[0]?.classification, "additive");
  assert.equal(removed.recommendedVersionBump, "major");
  assert.equal(removed.userTraits?.change, "removed");
  assert.equal(removed.userTraits?.properties[0]?.classification, "breaking");
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
