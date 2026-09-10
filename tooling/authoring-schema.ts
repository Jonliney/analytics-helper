import { z } from "zod";

const EVENT_NAME_PATTERN = /^\S(?:.*\S)?$/;
const OWNER_PATTERN = /^[a-z][a-z0-9_-]*$/;
const PROPERTY_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

const descriptionSchema = z.string().min(1);
const eventNameSchema = z
  .string()
  .min(1)
  .regex(EVENT_NAME_PATTERN)
  .describe(
    "Stable event name sent to the analytics provider exactly as authored. Naming style is unrestricted; surrounding whitespace is not allowed.",
  );
const optionalSchema = z.boolean().default(false);
const enumValuesSchema = z
  .array(z.string())
  .min(1)
  .refine((values) => new Set(values).size === values.length, {
    message: "Enum values must be unique",
  });

const propertyMetadata = {
  description: descriptionSchema.optional(),
  optional: optionalSchema,
};

const allowOtherValuesSchema = z
  .boolean()
  .optional()
  .meta({
    default: false,
    description:
      "Treat enum entries as recommended values rather than an exhaustive set. Defaults to false.",
  });

const stringPropertySchema = z
  .strictObject({
    type: z.literal("string"),
    ...propertyMetadata,
    enum: enumValuesSchema.optional(),
    allowOtherValues: allowOtherValuesSchema,
  })
  .superRefine((property, context) => {
    if (
      property.allowOtherValues !== undefined &&
      property.enum === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["allowOtherValues"],
        message: "allowOtherValues requires enum",
      });
    }
  })
  .describe(
    "A string property may optionally declare exhaustive or recommended values.",
  );

function scalarPropertySchema(type: "number" | "boolean") {
  return z.strictObject({
    type: z.literal(type),
    ...propertyMetadata,
  });
}

const normalizedPropertyDefinitionSchema = z
  .object({
    type: z.enum(["string", "number", "boolean"]),
    description: z.string().optional(),
    optional: z.boolean(),
    enum: z.array(z.string()).optional(),
    allowOtherValues: z.boolean(),
  })
  .readonly();

export const authoredPropertyDefinitionSchema = z
  .discriminatedUnion("type", [
    stringPropertySchema,
    scalarPropertySchema("number"),
    scalarPropertySchema("boolean"),
  ])
  .transform((property) => ({
    type: property.type,
    ...(property.description === undefined
      ? {}
      : { description: property.description }),
    optional: property.optional,
    ...(property.type === "string" && property.enum !== undefined
      ? { enum: property.enum }
      : {}),
    allowOtherValues:
      property.type === "string"
        ? (property.allowOtherValues ?? false)
        : false,
  }))
  .pipe(normalizedPropertyDefinitionSchema)
  .meta({ id: "propertyDefinition" });

const eventDefinitionShape = {
  name: eventNameSchema,
  description: descriptionSchema,
  owner: z
    .string()
    .regex(OWNER_PATTERN)
    .describe("Team responsible for the event definition."),
  allowAdditionalProperties: z
    .boolean()
    .default(false)
    .describe(
      "Allow undeclared event properties while continuing to enforce declared required properties. Defaults to false.",
    ),
  properties: z
    .record(
      z.string().regex(PROPERTY_NAME_PATTERN),
      authoredPropertyDefinitionSchema,
    )
    .readonly(),
};

const activeEventDefinitionSchema = z.strictObject({
  ...eventDefinitionShape,
  status: z
    .literal("active")
    .default("active")
    .describe("Lifecycle status. Defaults to active."),
});

const deprecatedEventDefinitionSchema = z.strictObject({
  ...eventDefinitionShape,
  status: z.literal("deprecated"),
  deprecatedSince: z
    .iso.date()
    .describe("ISO date on which consumers were told to migrate."),
  replacement: eventNameSchema
    .optional()
    .describe("Active event that consumers should use instead, when available."),
});

const normalizedEventDefinitionShape = {
  name: z.string(),
  description: z.string(),
  owner: z.string(),
  allowAdditionalProperties: z.boolean(),
  properties: z
    .record(z.string(), normalizedPropertyDefinitionSchema)
    .readonly(),
};

const normalizedEventDefinitionSchema = z
  .discriminatedUnion("status", [
    z.object({
      ...normalizedEventDefinitionShape,
      status: z.literal("active"),
    }),
    z.object({
      ...normalizedEventDefinitionShape,
      status: z.literal("deprecated"),
      deprecatedSince: z.iso.date(),
      replacement: eventNameSchema.optional(),
    }),
  ])
  .readonly();

export const authoredEventDefinitionSchema = z
  .discriminatedUnion("status", [
    activeEventDefinitionSchema,
    deprecatedEventDefinitionSchema,
  ])
  .transform((event) => ({
    name: event.name,
    description: event.description,
    owner: event.owner,
    allowAdditionalProperties: event.allowAdditionalProperties,
    properties: event.properties,
    status: event.status,
    ...(event.status === "deprecated"
      ? {
          deprecatedSince: event.deprecatedSince,
          ...(event.replacement === undefined
            ? {}
            : { replacement: event.replacement }),
        }
      : {}),
  }))
  .pipe(normalizedEventDefinitionSchema)
  .readonly()
  .meta({ id: "eventDefinition" });

const authoredEventDefinitionArraySchema = z
  .array(authoredEventDefinitionSchema)
  .min(1);

export const authoredEventDefinitionFileSchema = z
  .union([
    authoredEventDefinitionSchema,
    authoredEventDefinitionArraySchema,
  ])
  .meta({
    title: "Analytics event definition file",
    description:
      "A file may contain one event definition or an array of event definitions.",
  });

export type AuthoredPropertyDefinition = z.input<
  typeof authoredPropertyDefinitionSchema
>;
export type AuthoredEventDefinition = z.input<
  typeof authoredEventDefinitionSchema
>;
export type PropertyDefinition = z.output<
  typeof authoredPropertyDefinitionSchema
>;
export type EventDefinition = z.output<typeof authoredEventDefinitionSchema>;
export type EventDefinitionFile = z.output<
  typeof authoredEventDefinitionFileSchema
>;

export function parseAuthoredEventDefinitionFile(
  value: unknown,
): EventDefinitionFile {
  // Selecting the branch by the JSON shape gives authors focused errors while
  // retaining the union as the schema used for type inference and JSON output.
  return Array.isArray(value)
    ? authoredEventDefinitionArraySchema.parse(value)
    : authoredEventDefinitionSchema.parse(value);
}

export function renderEventDefinitionJsonSchema(): string {
  const generatedSchema = z.toJSONSchema(
    authoredEventDefinitionFileSchema,
    {
      target: "draft-07",
      io: "input",
      override({ zodSchema, jsonSchema }) {
        // Readonly protects normalized in-memory definitions. It must not mark
        // the author-editable JSON fields as readonly in the published schema.
        delete jsonSchema.readOnly;

        if (zodSchema === enumValuesSchema) {
          jsonSchema.uniqueItems = true;
        }

        if (zodSchema === stringPropertySchema) {
          Object.assign(jsonSchema, {
            dependencies: { allowOtherValues: ["enum"] },
          });
        }
      },
    },
  );
  const { $schema, ...schema } = generatedSchema;

  return `${JSON.stringify(
    {
      $schema,
      $id: "https://company.example/schemas/analytics-event-definition.schema.json",
      ...schema,
    },
    null,
    2,
  )}\n`;
}
