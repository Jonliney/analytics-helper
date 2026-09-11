import { z } from "zod";

import { GENERATED_IDENTIFIER_PATTERN } from "./event-identifiers.js";

const EVENT_NAME_PATTERN = /^\S(?:.*\S)?$/;
const OWNER_PATTERN = /^[a-z][a-z0-9_-]*$/;
const PROPERTY_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const PROPERTY_SET_NAME_PATTERN = PROPERTY_NAME_PATTERN;

const descriptionSchema = z.string().min(1);
const generatedIdentifierSchema = z
  .string()
  .regex(
    GENERATED_IDENTIFIER_PATTERN,
    "Must be a lower-camel identifier such as auth or signupCompleted",
  )
  .describe(
    "Lower-camel identifier used in generated APIs, such as auth or signupCompleted.",
  );
const eventNameSchema = z
  .string()
  .min(1)
  .regex(EVENT_NAME_PATTERN)
  .describe(
    "Stable event name sent to the analytics provider exactly as authored. Naming style is unrestricted; surrounding whitespace is not allowed.",
  );
const optionalSchema = z.boolean().default(false);
const propertySetNameSchema = z
  .string()
  .regex(
    PROPERTY_SET_NAME_PATTERN,
    "Must be a snake_case identifier such as session_context",
  );
const propertySetReferencesSchema = z
  .array(propertySetNameSchema)
  .refine((names) => new Set(names).size === names.length, {
    message: "Property set references must be unique",
  })
  .default([])
  .describe("Reusable property sets to include in this event.");
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
  domain: generatedIdentifierSchema
    .optional()
    .describe(
      "Optional top-level group in generated eventNames. Omit to expose the event at the root.",
    ),
  key: generatedIdentifierSchema
    .optional()
    .describe(
      "Optional eventNames property override. Omit to derive it from the event name.",
    ),
  propertySets: propertySetReferencesSchema,
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
  domain: generatedIdentifierSchema.optional(),
  key: generatedIdentifierSchema.optional(),
  propertySets: z.array(propertySetNameSchema),
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
    ...(event.domain === undefined ? {} : { domain: event.domain }),
    ...(event.key === undefined ? {} : { key: event.key }),
    propertySets: [...event.propertySets],
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

const propertySetDefinitionShape = {
  name: propertySetNameSchema.describe(
    "Globally unique property set name referenced by events.",
  ),
  description: descriptionSchema,
  owner: z
    .string()
    .regex(OWNER_PATTERN)
    .describe("Team responsible for the shared property contract."),
  properties: z
    .record(
      z.string().regex(PROPERTY_NAME_PATTERN),
      authoredPropertyDefinitionSchema,
    )
    .readonly(),
};

export const authoredPropertySetDefinitionSchema = z
  .strictObject(propertySetDefinitionShape)
  .readonly()
  .meta({ id: "propertySetDefinition" });

const authoredPropertySetDefinitionArraySchema = z
  .array(authoredPropertySetDefinitionSchema)
  .min(1);

export const authoredPropertySetDefinitionFileSchema = z
  .union([
    authoredPropertySetDefinitionSchema,
    authoredPropertySetDefinitionArraySchema,
  ])
  .meta({
    title: "Analytics property set definition file",
    description:
      "A file may contain one reusable property set or an array of property sets.",
  });

export type AuthoredPropertyDefinition = z.input<
  typeof authoredPropertyDefinitionSchema
>;
export type AuthoredEventDefinition = z.input<
  typeof authoredEventDefinitionSchema
>;
export type AuthoredPropertySetDefinition = z.input<
  typeof authoredPropertySetDefinitionSchema
>;
export type PropertyDefinition = z.output<
  typeof authoredPropertyDefinitionSchema
>;
export type EventDefinition = z.output<typeof authoredEventDefinitionSchema>;
export type EventDefinitionFile = z.output<
  typeof authoredEventDefinitionFileSchema
>;
export type PropertySetDefinition = z.output<
  typeof authoredPropertySetDefinitionSchema
>;
export type PropertySetDefinitionFile = z.output<
  typeof authoredPropertySetDefinitionFileSchema
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

export function parseAuthoredPropertySetDefinitionFile(
  value: unknown,
): PropertySetDefinitionFile {
  return Array.isArray(value)
    ? authoredPropertySetDefinitionArraySchema.parse(value)
    : authoredPropertySetDefinitionSchema.parse(value);
}

function renderAuthoringJsonSchema(
  authoringSchema: z.ZodType,
  id: string,
): string {
  const generatedSchema = z.toJSONSchema(
    authoringSchema,
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

        if (zodSchema === propertySetReferencesSchema) {
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
  const { $schema, ...jsonSchema } = generatedSchema;

  return `${JSON.stringify(
    {
      $schema,
      $id: `https://company.example/schemas/${id}`,
      ...jsonSchema,
    },
    null,
    2,
  )}\n`;
}

export function renderEventDefinitionJsonSchema(): string {
  return renderAuthoringJsonSchema(
    authoredEventDefinitionFileSchema,
    "analytics-event-definition.schema.json",
  );
}

export function renderPropertySetDefinitionJsonSchema(): string {
  return renderAuthoringJsonSchema(
    authoredPropertySetDefinitionFileSchema,
    "analytics-property-set-definition.schema.json",
  );
}
