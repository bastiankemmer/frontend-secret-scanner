import { describe, expect, it } from "vitest";
import { initializeSecretDetector } from "./detector.ts";
import { ruleFromShape, suggestShape } from "./shape.ts";

describe("ruleFromShape", () => {
  it("learns a prefix from one token and flags the next token of that shape", () => {
    const example = `zz-live-${"g".repeat(12)}`;
    const shape = suggestShape(example);
    expect(shape).toEqual({
      prefix: "zz-live-",
      body: "letters-digits",
      minLength: 12,
    });

    const rule = ruleFromShape({ label: "ZZ live key", ...shape });
    expect(rule.source).not.toContain("g".repeat(12));

    const detector = initializeSecretDetector({ rules: [rule] });
    const sibling = `zz-live-${"z".repeat(12)}`;
    expect(detector.onChange(`token ${sibling} end`).pass).toBe(false);
    expect(detector.onChange("zz-live-short").pass).toBe(true);
    expect(detector.onChange("an ordinary sentence").pass).toBe(true);
  });

  it("guesses a letter prefix when the token has no separator", () => {
    expect(suggestShape("AKIAIOSFODNN7EXAMPLE").prefix).toBe("AKIA");
  });
});
