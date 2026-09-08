import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";

const schemaPath = path.join(process.cwd(), "event-definition.schema.json");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

const EVENTS_DIR = path.join(process.cwd(), "events");

function findJsonFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return findJsonFiles(fullPath);
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      return [fullPath];
    }

    return [];
  });
}

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

const files = findJsonFiles(EVENTS_DIR);

let hasErrors = false;

for (const file of files) {
  const relativePath = path.relative(process.cwd(), file);
  const contents = fs.readFileSync(file, "utf8").trim();

  // Check for empty files
  if (!contents) {
    console.error(`❌ ${relativePath}: file is empty`);
    hasErrors = true;
    continue;
  }

  let event: unknown;

  // Check for malformed JSON
  try {
    event = JSON.parse(contents);
  } catch (error) {
    console.error(`❌ ${relativePath}: invalid JSON`);

    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    }

    hasErrors = true;
    continue;
  }

  // Check against analytics schema
  const valid = validate(event);

  if (!valid) {
    console.error(`❌ ${relativePath}: schema validation failed`);

    for (const error of validate.errors ?? []) {
      console.error(`   ${error.instancePath || "/"} ${error.message}`);
    }

    hasErrors = true;
    continue;
  }

  console.log(`✅ ${relativePath}`);
}

if (hasErrors) {
  console.error("\nAnalytics validation failed.");
  process.exit(1);
}

console.log(`\nAll ${files.length} analytics event files are valid.`);
