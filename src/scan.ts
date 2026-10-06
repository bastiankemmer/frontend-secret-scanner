/**
 * Split a sentence into tokens, then ask each token if it is a secret.
 * The first matching rule wins, so a more specific prefix stays above a
 * broader one. A secret glued into a larger word is a different token and
 * is not reported, except after a delimiter: NAME=value, "key":"value",
 * ?token=value&other and {"k":"v","x":1} each try the part after =, :, a
 * quote, a comma or &. That part must match to the next field separator
 * or the end of the token, so the next field is not swallowed.
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

const edgePunctuation = new Set(".,;:!?\"'`()[]{}<>“”‘’*|\\/#@");
const valueDelimiters = new Set("=:\"',&“”‘’|\\");
/** Ends a value. Colon, slash and @ stay inside a database URL. */
const fieldSeps = new Set(["&", ",", '"', "'", "“", "”", "‘", "’", "|", "\\"]);

const expectString = (input: unknown) => {
  if (typeof input !== "string") throw new Error("Expected a string.");
};

const stripFormats = (input: string) => {
  const map: number[] = [];
  let text = "";
  let last = 0;
  for (const hit of input.matchAll(/\p{Cf}/gu)) {
    const index = hit.index;
    if (index === undefined) continue;
    text += input.slice(last, index);
    for (let at = last; at < index; at += 1) map.push(at);
    last = index + hit[0].length;
  }
  text += input.slice(last);
  for (let at = last; at < input.length; at += 1) map.push(at);
  map.push(input.length);
  return { text, map };
};

const readTokens = (stripped: string): TextToken[] => {
  const tokens: TextToken[] = [];
  for (const match of stripped.matchAll(/\S+/g)) {
    const raw = match[0];
    const rawStart = match.index;
    if (rawStart === undefined) continue;
    const token = trimEdges(raw, rawStart);
    if (token.text.length === 0) continue;
    tokens.push(token);
  }
  return tokens;
};

export const tokensOf = (input: string): TextToken[] => {
  expectString(input);
  const { text, map } = stripFormats(input);
  return readTokens(text).map((token) => ({
    text: token.text,
    start: map[token.start]!,
    end: map[token.end]!,
  }));
};

/**
 * Every secret in the input, in order. Most rules test one token. A rule with
 * scope "text" is searched in the whole input and can cover many tokens, like
 * a PEM private key block. A token that overlaps such a block is not reported
 * again.
 */
export const findSecrets = (
  input: string,
  rules: readonly SecretRule[],
): SecretMatch[] => {
  expectString(input);
  if (rules.length === 0) return [];
  const tokenRules = rules.filter((rule) => rule.scope !== "text");
  const wideRules = tokenRules.filter(
    (rule) => rule.source.includes("\\S") || rule.source.includes("[^\\s"),
  );
  const blocks = textMatches(
    input,
    rules.filter((rule) => rule.scope === "text"),
  ).sort((left, right) => left.start - right.start || left.end - right.end);
  const { text, map } = stripFormats(input);
  const tokens = readTokens(text);
  const found: SecretMatch[] = [...blocks];
  const seen = new Set<string>();
  let cursor = 0;
  for (const [index, token] of tokens.entries()) {
    const originStart = map[token.start]!;
    const originEnd = map[token.end]!;
    while (cursor < blocks.length && (blocks[cursor]?.end ?? 0) <= originStart) {
      cursor += 1;
    }
    const block = blocks[cursor];
    if (block && block.start < originEnd) continue;
    const atAhead = atFrom(token.text);
    for (const offset of valueStarts(token.text)) {
      const value = token.text.slice(offset);
      const matched = matchValue(value, tokenRules, wideRules, atAhead[offset] === 1, (rule) =>
        keywordNear(tokens, index, rule),
      );
      if (!matched) continue;
      const start = map[token.start + offset]!;
      const end = map[token.start + offset + matched.text.length]!;
      const span = `${start}:${end}`;
      if (seen.has(span)) continue;
      seen.add(span);
      found.push({
        text: matched.text,
        start,
        end,
        rule: matched.rule.rule,
        label: matched.rule.label,
      });
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

const patternFor = (source: string) => {
  let pattern = compiled.get(source);
  if (!pattern) {
    // Ends on a value delimiter or the end of the slice. The slice itself
    // already stops at & , quotes, | and \, so \S+ cannot swallow the next field.
    pattern = new RegExp(`^(?:${source})(?=$|[=:,"'&“”‘’|\\\\])`);
    compiled.set(source, pattern);
  }
  return pattern;
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

const nextField = (text: string, from: number) => {
  for (let index = from; index < text.length; index += 1) {
    if (fieldSeps.has(text.charAt(index))) return index;
  }
  return text.length;
};

const atFrom = (text: string) => {
  const mark = new Uint8Array(text.length + 1);
  for (let index = text.length - 1; index >= 0; index -= 1) {
    mark[index] = text.charCodeAt(index) === 64 || mark[index + 1] === 1 ? 1 : 0;
  }
  return mark;
};

const firstRule = (
  slice: string,
  rules: readonly SecretRule[],
  keywordOk: (rule: SecretRule) => boolean,
) => {
  if (slice.length === 0) return undefined;
  for (const rule of rules) {
    const match = patternFor(rule.source).exec(slice);
    if (!match || match[0].length === 0 || !keywordOk(rule)) continue;
    return { text: match[0], rule };
  }
  return undefined;
};

/**
 * The slice up to the next field separator must match a rule. A comma inside
 * a password is not that separator: when an @ is still ahead, widen to the
 * next separator and try again. ponytail: the widen stops at the first hit,
 * and "postgres://a:a," repeated has no @ so each offset stays one short slice.
 */
const matchValue = (
  value: string,
  rules: readonly SecretRule[],
  wideRules: readonly SecretRule[],
  atAhead: boolean,
  keywordOk: (rule: SecretRule) => boolean,
) => {
  let end = nextField(value, 0);
  let found = firstRule(value.slice(0, end), rules, keywordOk);
  if (!found && atAhead) {
    while (!found && end < value.length) {
      end = nextField(value, end + 1);
      found = firstRule(value.slice(0, end), wideRules, keywordOk);
    }
  }
  return found;
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
