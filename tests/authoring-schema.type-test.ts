import {
  authoredEventDefinitionSchema,
  type AuthoredEventDefinition,
  type AuthoredPropertyDefinition,
  type EventDefinition,
} from "../tooling/authoring-schema.js";

const authoredEvent: AuthoredEventDefinition = {
  name: "Signup Completed",
  domain: "auth",
  key: "signupFinished",
  description: "A user completes registration",
  owner: "growth",
  properties: {
    method: { type: "string", enum: ["email", "google"] },
  },
};

const normalizedEvent: EventDefinition =
  authoredEventDefinitionSchema.parse(authoredEvent);
const defaultedFlag: boolean = normalizedEvent.allowAdditionalProperties;
const defaultedStatus: "active" | "deprecated" = normalizedEvent.status;
const defaultedPropertyFlag: boolean =
  normalizedEvent.properties.method!.allowOtherValues;
const optionalDomain: string | undefined = normalizedEvent.domain;
const optionalKey: string | undefined = normalizedEvent.key;
void defaultedFlag;
void defaultedStatus;
void defaultedPropertyFlag;
void optionalDomain;
void optionalKey;

const invalidNumberProperty: AuthoredPropertyDefinition = {
  type: "number",
  // @ts-expect-error Only string properties support enum values.
  enum: ["one"],
};
void invalidNumberProperty;
