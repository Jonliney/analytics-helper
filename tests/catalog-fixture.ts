import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";

export const validEvent = {
  name: "Signup Completed",
  key: "signupCompleted",
  description: "A user signs up",
  properties: {
    method: { type: "string", enum: ["email", "google"] },
    campaign_id: { type: "string", optional: true },
  },
} as const;

export function createCatalogFixture(
  context: TestContext,
  eventFiles: Readonly<Record<string, unknown>>,
  propertySetFiles: Readonly<Record<string, unknown>> = {},
  viewFiles: Readonly<Record<string, unknown>> = {},
  userTraitFiles: Readonly<Record<string, unknown>> = {},
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-catalog-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const definitions = path.join(root, "src", "definitions");

  for (const [relativePath, value] of Object.entries(eventFiles)) {
    const file = path.join(definitions, "events", relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }

  for (const [relativePath, value] of Object.entries(propertySetFiles)) {
    const file = path.join(definitions, "property-sets", relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }

  for (const [relativePath, value] of Object.entries(viewFiles)) {
    const file = path.join(definitions, "views", relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }

  for (const [relativePath, value] of Object.entries(userTraitFiles)) {
    const file = path.join(definitions, "traits", relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }

  return root;
}
