import { describe, expect, it } from "vitest";
import { initializeSecretDetector } from "./detector.ts";
import { secretRules } from "./rules.ts";

const openaiKey = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";
const sentence = `use ${openaiKey} for the call`;

describe("initializeSecretDetector", () => {
  it("uses the default checklist when no config is passed", () => {
    const detector = initializeSecretDetector();
    const result = detector.onChange("please add an API key");
    expect(result).toEqual({ pass: true, allowSend: true, report: "detail" });
    expect(detector.config.strict).toBe(true);
    expect(detector.config.when).toBe("onChange");
    expect(detector.config.rules.map((rule) => rule.rule)).toEqual(
      secretRules.map((rule) => rule.rule),
    );
  });

  it("refuses send in strict mode and names the token label", () => {
    const result = initializeSecretDetector().onChange(sentence);
    expect(result.pass).toBe(false);
    expect(result.allowSend).toBe(false);
    if (result.pass || result.report !== "detail") {
      throw new Error("expected a detailed failure");
    }
    expect(result.error.message).toBe(
      "Don't send secrets. This looks like: OpenAI API key.",
    );
    expect(result.error.message).not.toContain(openaiKey);
    expect(result.error.matches[0]?.text).toBe(openaiKey);
  });

  it("allows send when strict mode is off", () => {
    const result = initializeSecretDetector({ strict: false }).onLiveChange(
      sentence,
    );
    expect(result).toMatchObject({ pass: false, allowSend: true });
  });

  it("returns a boolean and leaves the secret out of the result", () => {
    const result = initializeSecretDetector({ report: "boolean" }).onChange(
      sentence,
    );
    expect(result).toEqual({
      pass: false,
      allowSend: false,
      report: "boolean",
    });
    expect(JSON.stringify(result)).not.toContain(openaiKey);
  });

  it("checks only the rules it was given", () => {
    const awsOnly = secretRules.filter((rule) => rule.rule === "aws-access-key");
    const detector = initializeSecretDetector({ rules: awsOnly });
    expect(detector.onChange(sentence).pass).toBe(true);
    expect(detector.onChange("key AKIAIOSFODNN7EXAMPLE in the env").pass).toBe(
      false,
    );
  });

  it("checks on both events with the same result", () => {
    const detector = initializeSecretDetector({ when: "onLiveChange" });
    expect(detector.onLiveChange(sentence)).toEqual(detector.onChange(sentence));
    expect(detector.config.when).toBe("onLiveChange");
  });

  it("rebuilds from the config it exposes", () => {
    const detector = initializeSecretDetector({
      strict: false,
      when: "onLiveChange",
      report: "boolean",
    });
    const again = initializeSecretDetector(JSON.parse(JSON.stringify(detector.config)));
    expect(again.onChange(sentence)).toEqual(detector.onChange(sentence));
  });

  it("rejects a config that is not a detector config", () => {
    expect(() => initializeSecretDetector({ strict: "yes" })).toThrow(/strict/);
    expect(() => initializeSecretDetector({ when: "submit" })).toThrow(/when/);
    expect(() => initializeSecretDetector([])).toThrow(/object/);
  });
});
