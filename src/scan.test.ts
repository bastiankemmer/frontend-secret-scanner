import { describe, expect, it } from "vitest";
import { secretRules } from "./rules.ts";
import { findSecrets, tokensOf } from "./scan.ts";

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

describe("findSecrets", () => {
  it("finds no secret token in an ordinary sentence", () => {
    expect(findSecrets("please add an API key for the docs site", secretRules)).toEqual(
      [],
    );
    expect(findSecrets("my password is hunter2", secretRules)).toEqual([]);
  });

  it("flags only the token that is a known secret", () => {
    const input = `use ${openaiKey} for the call`;
    const found = findSecrets(input, secretRules);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      rule: "openai",
      label: "OpenAI API key",
      text: openaiKey,
    });
    expect(input.slice(found[0]?.start, found[0]?.end)).toBe(openaiKey);
  });

  it("lets the earlier Anthropic rule win the same token", () => {
    const [match] = findSecrets(anthropicKey, secretRules);
    expect(match?.rule).toBe("anthropic");
  });

  it("does not flag a short sk- token", () => {
    expect(findSecrets("the sketch uses sk-short", secretRules)).toEqual([]);
  });

  it("does not flag a secret glued into a larger word", () => {
    expect(findSecrets(`prefix${openaiKey}`, secretRules)).toEqual([]);
  });

  it("flags a key written as NAME=value, JSON or a query string", () => {
    for (const input of [
      `OPENAI_API_KEY=${openaiKey}`,
      `{"apiKey":"${openaiKey}"}`,
      `curl "https://x.test/?token=${openaiKey}"`,
    ]) {
      const [match] = findSecrets(input, secretRules);
      expect(match?.rule).toBe("openai");
      expect(input.slice(match?.start, match?.end)).toBe(openaiKey);
    }
  });

  it("flags AWS's documented example key", () => {
    const [match] = findSecrets("key AKIAIOSFODNN7EXAMPLE in the env", secretRules);
    expect(match?.rule).toBe("aws-access-key");
  });

  it("flags a key before & and before the next JSON field", () => {
    const key = "sk-" + "a".repeat(29) + "7";
    for (const input of [`?token=${key}&x=1`, `{"apiKey":"${key}","x":1}`]) {
      const found = findSecrets(input, secretRules).filter((match) => match.rule === "openai");
      expect(found).toHaveLength(1);
      expect(found[0]?.text).toBe(key);
      expect(input.slice(found[0]?.start, found[0]?.end)).toBe(key);
    }
  });

  it("flags a database url, including a slash inside the password", () => {
    for (const url of ["postgres://u:p@host", "postgres://u:pa/ss@host", "postgres://u:pa,ss@host"]) {
      const [match] = findSecrets(url, secretRules);
      expect(match?.rule).toBe("database-url");
      expect(match?.text).toBe(url);
      expect(url.slice(match?.start, match?.end)).toBe(url);
    }
  });

  it("flags a key in markdown, smart quotes, table pipes, or escaped quotes", () => {
    const key = "sk-" + "b".repeat(29) + "7";
    const escaped = `\\"apiKey\\":\\"${key}\\"`;
    for (const input of [`**${key}**`, `“${key}”`, `|${key}|`, escaped]) {
      const [match] = findSecrets(input, secretRules);
      expect(match?.rule).toBe("openai");
      expect(match?.text).toBe(key);
      expect(input.slice(match?.start, match?.end)).toBe(key);
    }
  });

  it("flags a key glued to a leading slash, hash, or at sign", () => {
    const key = "sk-" + "c".repeat(29) + "7";
    for (const input of [`/${key}`, `#${key}`, `@${key}`]) {
      const [match] = findSecrets(input, secretRules);
      expect(match?.text).toBe(key);
      expect(input.slice(match?.start, match?.end)).toBe(key);
    }
  });

  it("flags a key split by a zero-width character and keeps original indexes", () => {
    const key = "sk-" + "d".repeat(29) + "7";
    const input = key.slice(0, 8) + "\u200B" + key.slice(8);
    const [match] = findSecrets(input, secretRules);
    expect(match?.rule).toBe("openai");
    expect(match?.text).toBe(key);
    expect(input.slice(match?.start, match?.end).replace(/\p{Cf}/gu, "")).toBe(key);
  });

  it("does not join a key split by a newline into one match", () => {
    const input = "sk-" + "a".repeat(15) + "\n" + "a".repeat(15);
    expect(findSecrets(input, secretRules).filter((match) => match.rule === "openai")).toEqual(
      [],
    );
    const split = "sk-" + "a".repeat(15) + "\n" + "a".repeat(14) + "7";
    const joined = split.replace("\n", "");
    expect(findSecrets(split, secretRules).some((match) => match.text === joined)).toBe(false);
  });

  it("skips a token that runs into a text-scope block", () => {
    const key = "sk-" + "e".repeat(30);
    const block = {
      rule: "block",
      label: "Block",
      scope: "text" as const,
      source: "BEGIN_BLOCK_[A-Z]+",
    };
    const input = `${key}BEGIN_BLOCK_AB`;
    const found = findSecrets(input, [
      block,
      {
        rule: "openai",
        label: "OpenAI API key",
        source: String.raw`sk-(?:proj-)?[A-Za-z0-9_-]{20,}`,
      },
    ]);
    expect(found.map((match) => match.rule)).toEqual(["block"]);
  });

  it("reports two separate text-scope blocks", () => {
    const block = {
      rule: "block",
      label: "Block",
      scope: "text" as const,
      source: "BEGIN_BLOCK_[A-Z]+",
    };
    const input = "BEGIN_BLOCK_AA and BEGIN_BLOCK_BB";
    expect(findSecrets(input, [block]).map((match) => match.text)).toEqual([
      "BEGIN_BLOCK_AA",
      "BEGIN_BLOCK_BB",
    ]);
  });

  it("reports both secrets in one comma-separated token", () => {
    const first = "sk-" + "a".repeat(29) + "7";
    const second = "sk-" + "b".repeat(29) + "7";
    const input = `${first},${second}`;
    const found = findSecrets(input, secretRules);
    expect(found.map((match) => match.text)).toEqual([first, second]);
    expect(input.slice(found[0]?.start, found[0]?.end)).toBe(first);
    expect(input.slice(found[1]?.start, found[1]?.end)).toBe(second);
  });

  it("throws a clear error when the input is not a string", () => {
    expect(() => findSecrets(undefined as never, secretRules)).toThrow("Expected a string.");
    expect(() => findSecrets(null as never, secretRules)).toThrow("Expected a string.");
    expect(() => tokensOf(undefined as never)).toThrow("Expected a string.");
    expect(() => tokensOf(null as never)).toThrow("Expected a string.");
  });

  it("stays under a second on a long comma-separated database prefix", () => {
    const input = "postgres://a:a,".repeat(1000);
    const started = performance.now();
    const found = findSecrets(input, secretRules);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(found.every((match) => match.text.length < 40)).toBe(true);
  });
});
