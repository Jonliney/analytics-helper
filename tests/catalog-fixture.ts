import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

export const validEvent = {
  name: "Signup Completed",
  description: "A user signs up",
  owner: "growth",
  properties: {
    method: { type: "string", enum: ["email", "google"] },
    campaign_id: { type: "string", optional: true },
  },
} as const;

export function createCatalogFixture(
  context: TestContext,
  eventFiles: Readonly<Record<string, unknown>>,
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-catalog-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.cpSync(
    path.join(repositoryRoot, "event-definition.schema.json"),
    path.join(root, "event-definition.schema.json"),
  );

  for (const [relativePath, value] of Object.entries(eventFiles)) {
    const file = path.join(root, "events", relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }

  return root;
}
