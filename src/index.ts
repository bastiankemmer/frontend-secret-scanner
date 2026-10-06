export { initializeSecretDetector, defaultConfig } from "./detector.ts";
export type {
  CheckResult,
  Detector,
  DetectorConfig,
  DetectorReport,
  DetectorWhen,
} from "./detector.ts";
export { secretRules } from "./rules.ts";
export type { SecretRule } from "./rules.ts";
export { ruleFromShape, suggestShape } from "./shape.ts";
export type { SecretBody, SecretShape } from "./shape.ts";
export { secretTokens, tokensOf } from "./scan.ts";
export type { SecretMatch, TextToken } from "./scan.ts";
