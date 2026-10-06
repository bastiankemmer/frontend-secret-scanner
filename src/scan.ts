/**
 * Split a sentence into tokens, then ask each token if it is a secret.
 * The first matching rule wins, so a more specific prefix stays above a
 * broader one. A secret glued into a larger word is a different token and
 * is not reported, except after a delimiter: NAME=value, "key":"value" and
 * ?token=value are each one whitespace token, so the part after =, :, a
 * quote or a comma is tried too.
 *
 * A rule with keywords only matches when one of them appears in a nearby
 * token. "mailgun key-<32 hex>" is flagged, a bare "key-<32 hex>" is not.
 */

import type { SecretRule } from "./rules.ts";

export type TextToken = {
  text: string;
  start: number;
  end: number;
};

export type SecretMatch = TextToken & {
  rule: string;
  label: string;
};

/** How many tokens to each side of a candidate may hold its keyword. */
export const keywordWindow = 8;

const edgePunctuation = new Set(".,;:!?\"'`()[]{}<>");
const valueDelimiters = new Set(["=", ":", '"', "'", ","]);

export const tokensOf = (input: string): TextToken[] => {
  const tokens: TextToken[] = [];
  for (const match of input.matchAll(/\S+/g)) {
    const raw = match[0];
    const rawStart = match.index;
    if (rawStart === undefined) continue;
    const token = trimEdges(raw, rawStart);
    if (token.text.length === 0) continue;
    tokens.push(token);
  }
  return tokens;
};

/**
 * Every secret in the input, in order. Most rules test one token. A rule with
 * scope "text" is searched in the whole input and can cover many tokens, like
 * a PEM private key block. Tokens inside such a block are not reported again.
 */
export const secretTokens = (
  input: string,
  rules: readonly SecretRule[],
): SecretMatch[] => {
  if (rules.length === 0) return [];
  const tokenRules = rules.filter((rule) => rule.scope !== "text");
  const blocks = textMatches(
    input,
    rules.filter((rule) => rule.scope === "text"),
  );
  const tokens = tokensOf(input);
  const found: SecretMatch[] = [...blocks];
  for (const [index, token] of tokens.entries()) {
    if (blocks.some((block) => token.start >= block.start && token.start < block.end)) {
      continue;
    }
    for (const offset of valueStarts(token.text)) {
      const value = token.text.slice(offset);
      const rule = tokenRules.find(
        (candidate) =>
          valueIsRule(value, candidate) && keywordNear(tokens, index, candidate),
      );
      if (!rule) continue;
      found.push({
        text: value,
        start: token.start + offset,
        end: token.end,
        rule: rule.rule,
        label: rule.label,
      });
      break;
    }
  }
  return found.sort((left, right) => left.start - right.start);
};

const textMatches = (
  input: string,
  rules: readonly SecretRule[],
): SecretMatch[] => {
  const found: SecretMatch[] = [];
  for (const rule of rules) {
    for (const match of input.matchAll(new RegExp(rule.source, "g"))) {
      const start = match.index;
      if (start === undefined) continue;
      found.push({
        text: match[0],
        start,
        end: start + match[0].length,
        rule: rule.rule,
        label: rule.label,
      });
    }
  }
  return found;
};

// ponytail: one RegExp per source, never evicted. Fine for a checklist of
// dozens of rules. A page that builds thousands of rules should clear it.
const compiled = new Map<string, RegExp>();

const valueIsRule = (value: string, rule: SecretRule) => {
  let pattern = compiled.get(rule.source);
  if (!pattern) {
    pattern = new RegExp(`^(?:${rule.source})$`);
    compiled.set(rule.source, pattern);
  }
  return pattern.test(value);
};

const keywordNear = (
  tokens: readonly TextToken[],
  index: number,
  rule: SecretRule,
) => {
  if (!rule.keywords || rule.keywords.length === 0) return true;
  const from = Math.max(0, index - keywordWindow);
  const near = tokens
    .slice(from, index + keywordWindow + 1)
    .map((token) => token.text.toLowerCase());
  return rule.keywords.some((keyword) => {
    const wanted = keyword.toLowerCase();
    return near.some((text) => text.includes(wanted));
  });
};

/** 0 for the whole token, then the offset just after each delimiter. */
const valueStarts = (text: string): number[] => {
  const starts = [0];
  for (let index = 0; index < text.length - 1; index += 1) {
    if (valueDelimiters.has(text.charAt(index))) starts.push(index + 1);
  }
  return starts;
};

const trimEdges = (raw: string, rawStart: number): TextToken => {
  let start = 0;
  let end = raw.length;
  while (start < end && edgePunctuation.has(raw.charAt(start))) start += 1;
  while (end > start && edgePunctuation.has(raw.charAt(end - 1))) end -= 1;
  return {
    text: raw.slice(start, end),
    start: rawStart + start,
    end: rawStart + end,
  };
};
