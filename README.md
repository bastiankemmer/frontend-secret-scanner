# frontend-secret-scanner

Browser-side check for text a person is about to send. The sentence is split into tokens. If a token matches a known secret shape, the caller keeps that text on the client and tells them not to send it.

The package does not draw UI. The host app passes in its input with `attach` (or calls `check` with a string) and shows the result.

New here? Read the [getting started guide](docs/getting-started.html), an HTML page with screenshots. Open `docs/getting-started.html` in a browser.

## Install

```bash
npm install frontend-secret-scanner
```

The package is plain JavaScript with type declarations. It uses no Node APIs and runs in the browser. The published package is ESM only, with no `require` export.

## Develop

Working on this repo needs Node `^20.19.0` or `>=22.12.0` (Vite). That is not an `engines` constraint of the published package.

```bash
git clone https://github.com/bastiankemmer/frontend-secret-scanner.git
cd frontend-secret-scanner
npm install
```

## Use

Initialize a detector. With no config, it uses the default checklist, strict mode, detailed results, and `when: "onChange"`.

```ts
import { initializeSecretDetector } from "frontend-secret-scanner";

const detector = initializeSecretDetector({ when: "onLiveChange" });

const stop = detector.attach(textarea, (result) => {
  warning.hidden = result.pass;
  sendButton.disabled = !result.allowSend;
});
// stop() removes the listeners.
```

`attach` takes a text input, a textarea, or a contenteditable element, and throws for anything else. `when: "onLiveChange"` listens to `input`. `when: "onChange"` listens to `change`, and on a contenteditable element to `focusout` (that element does not fire `change`). A send control that keeps focus (`mousedown` and `preventDefault`) never blurs the field, so use `onLiveChange` there. Enter is checked in both modes. In strict mode, Enter with a secret in the text is stopped before handlers on the field see it, so a send-on-Enter handler never runs and a form does not submit. The guard is a capture listener on `window`, and it only acts when `composedPath()` includes the field. Listeners on the field run after it. A capture listener already registered on `window` before `attach` still runs first. It does not stop a click on your Send button, so disable the button from the callback as above. Enter is blocked while `isComposing` or `keyCode` is 229 only when the text fails the check; a clean field still commits. Shift+Enter is not blocked.

To wire it up yourself, `detector.check(text)` checks a string:

```ts
input.addEventListener("input", () => {
  const result = detector.check(input.value);
  if (!result.allowSend) {
    // Show a warning. Do not POST the text.
  }
});
```

```ts
const detector = initializeSecretDetector({
  strict: true,
  when: "onLiveChange",
  report: "boolean",
});
```

`strict: true` sets `allowSend` to false when a token is a secret. `strict: false` still reports the secret and sets `allowSend` to true.

`report: "detail"` adds an error with the rule label and the token span. The message does not repeat the secret. `report: "boolean"` returns `{ pass, allowSend, report }` and does not include the token.

`message` is the text of `error.message`. `{labels}` is replaced by the kinds of key found, such as `OpenAI API key`. The default is `Don't send secrets. This looks like: {labels}.`

```ts
initializeSecretDetector({ message: "Remove the {labels} before you send this." });
```

It is plain text with no code, so it survives the JSON the config page builds. A message with no `{labels}` is used as it is. With `report: "boolean"` there is no error and so no message.

`rules` replaces the checklist. Omit it to use the built-in shapes.

## What a token can be

The default rules, in `src/rules.ts`. The bundle is 4,574 bytes minified and gzipped, with no dependencies.

- **AI providers:** Anthropic, OpenAI, OpenRouter, Groq, xAI, Perplexity, Hugging Face, Replicate, Google API key and OAuth secret
- **Cloud and hosting:** AWS, DigitalOcean, Fly.io, Heroku, Supabase, Databricks, Doppler, Grafana, age
- **Source and packages:** GitHub (classic and fine-grained), GitLab, npm, PyPI, Postman, Linear, Atlassian, Shopify
- **Messaging and payments:** Slack (bot, app, webhook), Stripe live, Stripe webhook, SendGrid, Twilio, Square, Telegram bot, Discord bot, JSON Web Token
- **Private keys:** PEM blocks (`PRIVATE KEY`, `RSA`, `EC`, `DSA`, `OPENSSH`, `ENCRYPTED`, `PGP`)
- **Passwords in a URL:** database connection strings and `https://user:password@host`
- **Generic keys that need a keyword:** Mailgun, Heroku, HubSpot, Cloudflare, Discord, Netlify, Sentry, Bitbucket, Codecov, Okta, LaunchDarkly, Telegram, AWS secret access key

Shapes were checked against the default rules of [gitleaks](https://github.com/gitleaks/gitleaks) (MIT).

### Private keys

A private key spans many tokens, so it has a rule with `scope: "text"`, which is searched in the whole input instead of one token. It needs the `-----BEGIN ... PRIVATE KEY-----` header and at least 20 base64 characters after it. The footer is optional, because a paste cut off halfway is still a leaked key. These are flagged:

- a normal multi-line block, one with its line breaks turned into spaces, and one inside JSON where they are a literal `\n`, as in a cloud service account file
- header lines such as `Proc-Type` and `Version`, and a `>`, `#`, `|` or `*` line prefix
- the whole block is one match, so the result points at all of it and the tokens inside are not reported again

These are not: a public key, a certificate, a long ordinary word after the header, and a sentence that only names the header, like "what does -----BEGIN RSA PRIVATE KEY----- mean?".

### Keyword rules

A key like `key-` plus 32 hex characters is too generic to flag on its own. A rule with `keywords` only matches when one of them appears, in any case, within 8 tokens of the key:

```
this is my key for mailgun key-0123...   flagged
this is my key for mailgun XYZ           not flagged, XYZ has no key shape
this is my key 0123...                   not flagged, no keyword near it
```

The rule checks the shape of the key, not the words around it. Warning on "mailgun" plus the word "key" alone would flag every question about Mailgun.

A key pasted as `NAME=value`, JSON (`"apiKey":"..."`) or a URL query (`?token=...`) is one token. The value is also taken after `=`, `:`, quotes, a comma or `&`, and the result points at the value only. Smart quotes, markdown `*`, and pipes are trimmed from the edges, as is a leading `/`, `#` or `@`. Zero-width format characters inside a key are flagged.

Not detected:

- A password, or a custom key with no known prefix. Guessing from entropy flags ordinary words, so that is not the approach.
- A secret glued to a word with no delimiter.
- A key split by a newline.
- `https://user:pa/ss@host` (a slash inside an https password). A database URL may still contain `/`.

To cover a provider that is missing, click its key on the config page. A key with a stable start gets a prefix. A key without one gets a keyword, such as the provider name. Or pass your own `rules`:

```ts
initializeSecretDetector({
  rules: [{ rule: "acme", label: "Acme key", keywords: ["acme"], source: "[a-f0-9]{32}" }],
});
```

`source` is a regular expression for one whole token, with no `^`, `$` or `\b`.

## Config page

```bash
npm run demo
```

Vite prints a local URL. Type a sentence, check the tokens, turn strict mode and the result shape on or off, and add a shape from a token that the checklist missed. Build copies a config object for `initializeSecretDetector`.

## Speed

Default detector, the default rules, `npm run benchmark` on an Apple M4 with Node 24:

| Input | Time per check |
| --- | --- |
| Sentence, 12 words | 0.02 ms |
| Chat message, 100 words | 0.12 ms |
| Paste, 1,000 words | 1.1 ms |
| Document, 10,000 words | 11 ms |
| Document, 100,000 words | 120 ms |

Ordinary text grows roughly with its length: about 1.1 ms per 1,000 words, whether or not a secret is in it. A private key adds about 0.1 ms. Worst-case shapes (one 100 kB token, 20,000 delimiters in one token, 5,000 private key headers with no body) take 0.6 to 26 ms. Use `when: "onLiveChange"` for chat-sized input; for very large pastes, use `when: "onChange"`.

## Scripts

```bash
npm test
npm run typecheck
npm run build   # emits dist/
npm run benchmark   # speed of the full suite, one rule at a time, worst cases
npm run demo
```

## License

MIT. See `LICENSE`.

## Publishing

Publishing is automatic. Pushing a version tag runs `.github/workflows/publish.yml`, which tests, builds, runs `npm publish` with provenance, and creates the GitHub release. The release notes are the section of [`CHANGELOG.md`](CHANGELOG.md) for that version. It uses npm trusted publishing, so there is no npm token. `ci.yml` runs the same checks on every push to `main` and on pull requests.

One-time setup (a trusted publisher can only be added to a package that already exists):

1. Publish the first version by hand: `npm login`, then `npm publish`.
2. On npmjs.com, open the package, Settings, Trusted publishing, choose GitHub Actions: user `bastiankemmer`, repository `frontend-secret-scanner`, workflow `publish.yml`.
3. Optional: under Publishing access, choose "Require two-factor authentication and disallow tokens".

Per release:

1. In `CHANGELOG.md`, rename the "Unreleased" heading to `## <version> - <date>`, add a fresh "Unreleased" above it if you like, and merge.
2. Bump and tag: `npm version minor` (or `patch`, `major`). It sets `version` in `package.json`, commits, and creates the tag `v<version>`.
3. Push: `git push --follow-tags`.

The workflow fails before publishing if the tag and `package.json` differ, or if `CHANGELOG.md` has no section with entries for that version.
