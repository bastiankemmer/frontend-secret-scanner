# Changelog

Each release on GitHub shows the section of its version. Keep new entries under
"Unreleased", and rename that heading to `## <version> - <date>` when you
release. The publish workflow fails if the section for the tag is missing.

## 0.3.0 - 2026-10-06

### Added

- `detector.attach(field, onResult)`: pass a text input, a textarea, or a
  contenteditable element. It checks on every edit (`when: "onLiveChange"`) or
  on change (`when: "onChange"`), and on Enter. In strict mode, Enter with a
  secret in the text is stopped before the app's own handlers run.
- `message` option: the text of the error, with `{labels}` for the kinds of key
  found.
- Getting started guide with screenshots, `docs/getting-started.html`.
- `npm run benchmark`: speed of the full suite, one rule at a time, and worst
  cases.

### Changed

- Breaking: `onChange(text)` and `onLiveChange(text)` are now `check(text)`.
  `when` selects the attach event. Call `detector.check(text)` instead, and
  set `when` for the event `attach` listens to.
- Breaking: `defaultConfig` is no longer exported. Read `detector.config`.
- Breaking: `suggestShape`, `ruleFromShape` and `tokensOf` are not imported
  from the package. `secretTokens` was renamed to `findSecrets` and is not
  exported. Call `detector.check`.

### Fixed

- The config page showed "Pass" in red, and did not mark `NAME=value` or PEM tokens.
- The `database-url` rule could freeze the page on crafted text (30 kB took
  39 s, now milliseconds). It also flags a Redis URL with an empty user.
- Keys next to `&`, `,` or another JSON field, in markdown bold, smart quotes,
  table pipes or escaped quotes, or with a zero-width character inside, are found.
  Two keys in one token are both reported.
- Private keys with `Proc-Type`/`Version:` header lines, or pasted as a quote, are found.
  A header followed by an ordinary long word is not.
- `attach`: the Enter guard runs before the app's capture listeners and works in
  shadow DOM; contenteditable checks on `focusout`; Shift+Enter is not blocked.
- Fewer false positives for `sk-` slugs, 16-letter words, Telegram ids and
  `https://host:8080?e=a@b.com`.
- A rule taught from a token must match its own example, and its id is unique.
- Config: unknown keys, an empty `keywords` list, an empty-match pattern and a
  duplicate id throw. Rules are frozen per detector. `check(undefined)` says what is wrong.
- The handover document is removed.

### Added (rules)

- `aws-secret-access-key` (with an `aws` keyword) and `stripe-webhook` (`whsec_`).

## 0.2.0 - 2026-10-06

### Added

- Keyword rules: a key with no prefix is flagged when a keyword such as
  `mailgun` is within 8 tokens. 11 providers.
- Private key detection: PEM blocks, also on one line or inside JSON.
- 52 rules, up from 40.
- Keys pasted as `NAME=value`, JSON, or a URL query are found, and the result
  points at the value.
- Keywords in "Shape from a token" on the config page.
- Benchmark.

### Changed

- Rule patterns no longer use `\b`, which missed keys ending in `-` or `=`.
- Publishing uses npm trusted publishing, with no token.

## 0.1.0 - 2026-10-06

First version. It was not published to npm.

### Added

- Token-based detector: a sentence is split into tokens, and a token that
  matches a known shape is a secret.
- `initializeSecretDetector` with `strict`, `when`, `report` and `rules`.
- Config page to type sentences, teach a shape from a token, and build a config.
