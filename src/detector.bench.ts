/**
 * How long one check takes. Run with `npm run benchmark`.
 *
 * A live check runs on every keystroke, so the number that matters is the time
 * for one call. A frame is about 16 ms; stay far below it. Inputs are built
 * from a fixed seed so two runs compare, and keys are assembled at runtime so
 * the repo holds no key-shaped text.
 */

import { bench, describe } from "vitest";
import { initializeSecretDetector } from "./detector.ts";
import { secretRules } from "./rules.ts";
import { findSecrets, tokensOf } from "./scan.ts";

let seed = 42;
const next = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed;
};

// Ordinary words, plus near misses that make a rule do real work without
// matching: a keyword with no key, short prefixes, a port, a hex word.
const vocabulary = [
  "please", "add", "the", "api", "key", "to", "docs", "site", "and", "check",
  "token", "for", "mailgun", "heroku", "discord", "sentry", "my", "team",
  "release", "build", "sk-short", "ghp_short", "https://example.com:8080/docs",
  "12345678:", "deadbeef", "version", "2.4.1", "user@example.com", "error:",
  "password", "hunter2", "config.yaml", "KEY=value", "a-b-c", "x_y_z", "today",
];

const prose = (words: number) =>
  Array.from({ length: words }, () => vocabulary[next() % vocabulary.length]).join(" ");

const base64 = (chars: number) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  return Array.from({ length: chars }, () => alphabet[next() % 64]).join("");
};

const pem = (bodyChars: number) =>
  `-----BEGIN PRIVATE KEY-----\n${base64(bodyChars).replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----`;

const openaiKey = `sk-proj-${base64(40).replace(/[+/]/g, "x")}`;
const mailgunKey = `key-${"0123456789abcdef".repeat(2)}`;

const inputs = {
  sentence: prose(12),
  message: prose(100),
  paste: prose(1_000),
  document: prose(10_000),
  hugeDocument: prose(100_000),
  withPrefixKey: `${prose(50)} ${openaiKey} ${prose(50)}`,
  withKeywordKey: `${prose(50)} mailgun ${mailgunKey} ${prose(50)}`,
  withEnvKey: `${prose(50)}\nOPENAI_API_KEY=${openaiKey}\n${prose(50)}`,
  withPrivateKey: `${prose(20)}\n${pem(1600)}\n${prose(20)}`,
  privateKeyInDocument: `${prose(5_000)}\n${pem(1600)}\n${prose(5_000)}`,
  // One whitespace-free token. Minified JSON and base64 blobs look like this.
  minifiedJson: JSON.stringify(
    Object.fromEntries(Array.from({ length: 4_000 }, (_, i) => [`k${i}`, `v${i}`])),
  ),
  base64Blob: base64(100_000),
  manyDelimiters: "a=".repeat(20_000),
  headersWithoutBody: "-----BEGIN PRIVATE KEY----- ".repeat(5_000),
  databaseUrlRepeat: "postgres://a:a,".repeat(1000),
};

const detector = initializeSecretDetector();
const booleanDetector = initializeSecretDetector({ report: "boolean" });

// A bench function must return nothing, so each call is wrapped.
const run = (text: string) => () => {
  detector.check(text);
};

describe("default detector, ordinary text (52 rules)", () => {
  bench("sentence, 12 words", run(inputs.sentence));
  bench("chat message, 100 words", run(inputs.message));
  bench("paste, 1,000 words", run(inputs.paste));
  bench("document, 10,000 words", run(inputs.document));
  bench("huge document, 100,000 words", run(inputs.hugeDocument), {
    time: 1500,
  });
});

describe("default detector, with a secret in the text", () => {
  bench("prefix key (OpenAI)", run(inputs.withPrefixKey));
  bench("keyword key (Mailgun)", run(inputs.withKeywordKey));
  bench("NAME=value key", run(inputs.withEnvKey));
  bench("private key block", run(inputs.withPrivateKey));
  bench("private key in a 10,000 word document", run(inputs.privateKeyInDocument));
  bench("boolean report, prefix key", () => {
    booleanDetector.check(inputs.withPrefixKey);
  });
});

describe("default detector, worst-case shapes", () => {
  bench("one 90 kB token of minified JSON", run(inputs.minifiedJson), {
    time: 1500,
  });
  bench("one 100 kB base64 token", run(inputs.base64Blob));
  bench("one 40 kB token of 20,000 delimiters", run(inputs.manyDelimiters), {
    time: 1500,
  });
  bench("5,000 private key headers, no body", run(inputs.headersWithoutBody));
  bench("1,000 repeated database urls", run(inputs.databaseUrlRepeat));
});

// Each rule alone on a 1,000 word paste: what it costs, not what it finds.
// Splitting into tokens is most of that time, so the first line is the floor.
// A rule's own cost is its line minus the floor.
describe("one rule at a time, 1,000 word paste", () => {
  bench(
    "(floor) tokenizing only",
    () => {
      tokensOf(inputs.paste);
    },
    { time: 100 },
  );
  for (const rule of secretRules) {
    bench(
      rule.rule,
      () => {
        findSecrets(inputs.paste, [rule]);
      },
      { time: 100 },
    );
  }
});
