export type ContractProperties<Expected, Candidate> =
  string extends keyof Expected
    ? Expected
    : Candidate & Record<Exclude<keyof Candidate, keyof Expected>, never>;
