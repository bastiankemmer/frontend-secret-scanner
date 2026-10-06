import { describe, expect, it } from "vitest";
import { initializeSecretDetector } from "./detector.ts";
import { ruleFromShape, suggestShape } from "./shape.ts";

const named = (label: string) =>
  ruleFromShape({
    label,
    prefix: "zz-live-",
    body: "letters-digits",
    minLength: 12,
  });

describe("ruleFromShape", () => {
  it("learns a prefix from one token and flags the next token of that shape", () => {
    const example = `zz-live-${"g".repeat(12)}`;
    const shape = suggestShape(example);
    expect(shape).toEqual({
      prefix: "zz-live-",
      body: "letters-digits",
      minLength: 12,
    });

    const rule = ruleFromShape({ label: "ZZ live key", ...shape }, example);
    expect(rule.source).not.toContain("g".repeat(12));
    expect(new RegExp(`^(?:${rule.source})$`).test(example)).toBe(true);

    const detector = initializeSecretDetector({ rules: [rule] });
    const sibling = `zz-live-${"z".repeat(12)}`;
    expect(detector.check(`token ${sibling} end`).pass).toBe(false);
    expect(detector.check("zz-live-short").pass).toBe(true);
    expect(detector.check("an ordinary sentence").pass).toBe(true);
  });

  it("does not take four leading letters as a prefix when the token has no separator", () => {
    const token = "wxyz" + "Q".repeat(12);
    expect(suggestShape(token).prefix).toBe("");
  });

  it("does not take a mixed-case head with a digit and a late hyphen as the prefix", () => {
    const head = "ZxQ7f" + "n".repeat(8);
    const example = `${head}-${"b".repeat(12)}`;
    expect(suggestShape(example).prefix).toBe("");
  });

  it("keeps one early delimiter even when the head has a digit", () => {
    const example = `ab1-${"c".repeat(12)}`;
    expect(suggestShape(example).prefix).toBe("ab1-");
  });

  it("rejects a one-character prefix with minimum length 1", () => {
    expect(() =>
      ruleFromShape({
        label: "Short key",
        prefix: "a",
        body: "letters-digits",
        minLength: 1,
      }),
    ).toThrow(/at least 8/);
  });

  it("allows an empty prefix when a keyword and a long enough body are set", () => {
    const rule = ruleFromShape({
      label: "Acme key",
      prefix: "",
      body: "hex",
      minLength: 8,
      keywords: ["acme"],
    });
    expect(rule.keywords).toEqual(["acme"]);
    expect(rule.source).toBe("[0-9A-Fa-f]{8,}");
  });

  it("rejects a shape that cannot match its example", () => {
    const example = `zz-live-${"+".repeat(12)}`;
    const shape = suggestShape(example);
    expect(() => ruleFromShape({ label: "ZZ live key", ...shape }, example)).toThrow(
      /does not match the example/,
    );
  });

  it("turns Schlüssel into the id schlussel", () => {
    expect(named("Schlüssel").rule).toBe("schlussel");
  });

  it("ids a non-Latin label without throwing", () => {
    const rule = named("密钥");
    expect(rule.rule).toMatch(/^[a-z0-9-]+$/);
    expect(rule.rule.length).toBeGreaterThan(0);
  });

  it("does not reuse the built-in openai id", () => {
    expect(named("OpenAI").rule).not.toBe("openai");
  });
});
