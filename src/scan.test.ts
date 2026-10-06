import { describe, expect, it } from "vitest";
import { secretRules } from "./rules.ts";
import { secretTokens, tokensOf } from "./scan.ts";

const anthropicKey = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
const openaiKey = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";

describe("tokensOf", () => {
  it("splits a sentence on whitespace and drops wrapping punctuation", () => {
    const input = `please send ${openaiKey}, today`;
    expect(tokensOf(input).map((token) => token.text)).toEqual([
      "please",
      "send",
      openaiKey,
      "today",
    ]);
    const key = tokensOf(input)[2];
    expect(input.slice(key?.start, key?.end)).toBe(openaiKey);
  });

  it("keeps a database url as one token", () => {
    const url = "postgres://user:secret@localhost/app";
    expect(tokensOf(`url ${url}`).map((token) => token.text)).toEqual([
      "url",
      url,
    ]);
  });
});

describe("secretTokens", () => {
  it("finds no secret token in an ordinary sentence", () => {
    expect(secretTokens("please add an API key for the docs site", secretRules)).toEqual(
      [],
    );
    expect(secretTokens("my password is hunter2", secretRules)).toEqual([]);
  });

  it("flags only the token that is a known secret", () => {
    const input = `use ${openaiKey} for the call`;
    const found = secretTokens(input, secretRules);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      rule: "openai",
      label: "OpenAI API key",
      text: openaiKey,
    });
    expect(input.slice(found[0]?.start, found[0]?.end)).toBe(openaiKey);
  });

  it("lets the earlier Anthropic rule win the same token", () => {
    const [match] = secretTokens(anthropicKey, secretRules);
    expect(match?.rule).toBe("anthropic");
  });

  it("does not flag a short sk- token", () => {
    expect(secretTokens("the sketch uses sk-short", secretRules)).toEqual([]);
  });

  it("does not flag a secret glued into a larger word", () => {
    expect(secretTokens(`prefix${openaiKey}`, secretRules)).toEqual([]);
  });

  it("flags a key written as NAME=value, JSON or a query string", () => {
    for (const input of [
      `OPENAI_API_KEY=${openaiKey}`,
      `{"apiKey":"${openaiKey}"}`,
      `curl "https://x.test/?token=${openaiKey}"`,
    ]) {
      const [match] = secretTokens(input, secretRules);
      expect(match?.rule).toBe("openai");
      expect(input.slice(match?.start, match?.end)).toBe(openaiKey);
    }
  });

  it("flags AWS's documented example key", () => {
    const [match] = secretTokens("key AKIAIOSFODNN7EXAMPLE in the env", secretRules);
    expect(match?.rule).toBe("aws-access-key");
  });
});
