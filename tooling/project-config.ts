import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

const analyticsProjectConfigSchema = z.strictObject({
  deprecationGracePeriodDays: z.number().int().nonnegative(),
});

export type AnalyticsProjectConfig = z.infer<
  typeof analyticsProjectConfigSchema
>;

export function loadAnalyticsProjectConfig(
  rootDirectory: string,
): AnalyticsProjectConfig {
  const configPath = path.join(rootDirectory, "analytics.config.json");

  if (!fs.existsSync(configPath)) {
    throw new Error("analytics.config.json does not exist");
  }

  let value: unknown;

  try {
    value = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(
      `analytics.config.json is not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`,
    );
  }

  const result = analyticsProjectConfigSchema.safeParse(value);

  if (!result.success) {
    throw new Error(
      `analytics.config.json is invalid: ${result.error.issues.map(({ message }) => message).join("; ")}`,
    );
  }

  return result.data;
}
