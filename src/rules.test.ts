import { describe, expect, it } from "vitest";
import { secretRules } from "./rules.ts";
import { secretTokens } from "./scan.ts";

// Built at runtime so the repo holds no key-shaped literal.
const x = (char: string, count: number) => char.repeat(count);
const uuid = () => `${x("a", 8)}-${x("a", 4)}-${x("a", 4)}-${x("a", 4)}-${x("a", 12)}`;

// One minimum-length fake key per rule. A new rule without a sample fails below.
const samples: Record<string, string> = {
  anthropic: `sk-ant-${x("a", 20)}`,
  openrouter: `sk-or-v1-${x("a", 64)}`,
  openai: `sk-${x("a", 20)}`,
  groq: `gsk_${x("a", 52)}`,
  xai: `xai-${x("a", 80)}`,
  perplexity: `pplx-${x("a", 48)}`,
  huggingface: `hf_${x("a", 34)}`,
  replicate: `r8_${x("a", 37)}`,
  "google-api-key": `AIza${x("a", 35)}`,
  "google-oauth-secret": `GOCSPX-${x("a", 28)}`,
  "aws-access-key": `AKIA${x("A", 16)}`,
  digitalocean: `dop_v1_${x("a", 64)}`,
  "fly-io": `fo1_${x("a", 43)}`,
  heroku: `HRKU-AA${x("a", 58)}`,
  supabase: `sbp_${x("a", 40)}`,
  databricks: `dapi${x("a", 32)}`,
  doppler: `dp.pt.${x("a", 43)}`,
  "grafana-service-account": `glsa_${x("a", 32)}_${x("a", 8)}`,
  "age-secret-key": `AGE-SECRET-KEY-1${x("A", 58)}`,
  "github-token": `ghp_${x("a", 36)}`,
  "github-fine-grained-pat": `github_pat_${x("a", 82)}`,
  "gitlab-pat": `glpat-${x("a", 20)}`,
  "npm-token": `npm_${x("a", 36)}`,
  "pypi-token": `pypi-AgEIcHlwaS5vcmc${x("a", 50)}`,
  postman: `PMAK-${x("a", 24)}-${x("a", 34)}`,
  linear: `lin_api_${x("a", 40)}`,
  atlassian: `ATATT3${x("a", 186)}`,
  shopify: `shpat_${x("a", 32)}`,
  slack: `xoxb-${x("1", 10)}`,
  "slack-app-token": `xapp-1-${x("A", 9)}-${x("1", 10)}-${x("a", 64)}`,
  "slack-webhook": `https://hooks.slack.com/services/${x("a", 43)}`,
  "stripe-live": `sk_live_${x("a", 10)}`,
  sendgrid: `SG.${x("a", 22)}.${x("a", 43)}`,
  twilio: `SK${x("a", 32)}`,
  square: `EAAA${x("a", 60)}`,
  "telegram-bot": `${x("1", 8)}:${x("a", 35)}`,
  jwt: `eyJ${x("a", 10)}.${x("a", 10)}.${x("a", 10)}`,
  "discord-bot": `M${x("a", 23)}.${x("a", 6)}.${x("a", 27)}`,
  // These only count next to their keyword, which `around` adds.
  "mailgun-key": `key-${x("a", 32)}`,
  "heroku-api-key": uuid(),
  "hubspot-api-key": uuid(),
  "cloudflare-key": x("a", 40),
  "discord-secret": x("a", 32),
  "netlify-token": x("a", 40),
  "sentry-token": x("a", 64),
  "bitbucket-secret": x("a", 32),
  "codecov-token": x("a", 32),
  "okta-token": `00${x("a", 40)}`,
  "launchdarkly-token": x("a", 40),
  "private-key": `-----BEGIN PRIVATE KEY----- ${x("a", 20)}`,
  "database-url": "postgres://u:p@h",
  "url-with-password": "https://u:p@h",
};

// The sentence a person would type: the keyword first when the rule needs one.
const around = (id: string, sample: string) => {
  const keyword = secretRules.find((rule) => rule.rule === id)?.keywords?.[0];
  return keyword ? `my ${keyword} secret is ${sample} ok` : `see ${sample} now`;
};

describe("secretRules", () => {
  it("has a sample for every rule and no sample for a missing rule", () => {
    expect(Object.keys(samples).sort()).toEqual(
      secretRules.map((rule) => rule.rule).sort(),
    );
  });

  it("uses unique rule ids and valid patterns", () => {
    const ids = secretRules.map((rule) => rule.rule);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of secretRules) {
      expect(() => new RegExp(rule.source)).not.toThrow();
    }
  });

  it.each(Object.entries(samples))(
    "%s: its own rule claims the sample, not an earlier one",
    (id, sample) => {
      const [match] = secretTokens(around(id, sample), secretRules);
      expect(match?.rule).toBe(id);
      expect(match?.text).toBe(sample);
    },
  );

  it.each(Object.entries(samples))(
    "%s: a key one character short is not detected as this rule",
    (id, sample) => {
      const short = around(id, sample.slice(0, -1));
      const rules = secretTokens(short, secretRules).map((match) => match.rule);
      expect(rules).not.toContain(id);
    },
  );

  it.each(
    secretRules.filter((rule) => rule.keywords).map((rule) => rule.rule),
  )("%s: is not detected without its keyword", (id) => {
    const rules = secretTokens(`my secret is ${samples[id]} ok`, secretRules);
    expect(rules.map((match) => match.rule)).not.toContain(id);
  });

  it("leaves ordinary writing alone", () => {
    const sentence = [
      "please add an API key field to the docs site",
      "the sketch uses sk-short and ghp_short",
      "call me at 12345678: tomorrow",
      "see https://example.com:8080/docs for the guide",
      "my password is hunter2 and the token is abc",
    ].join(". ");
    expect(secretTokens(sentence, secretRules)).toEqual([]);
  });

  it("lets a more specific sk- rule win over openai", () => {
    expect(secretTokens(samples.anthropic ?? "", secretRules)[0]?.rule).toBe(
      "anthropic",
    );
    expect(secretTokens(samples.openrouter ?? "", secretRules)[0]?.rule).toBe(
      "openrouter",
    );
    expect(secretTokens(`sk-proj-${x("a", 40)}`, secretRules)[0]?.rule).toBe(
      "openai",
    );
  });
});
