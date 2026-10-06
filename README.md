# frontend-secret-scanner

Browser-side check for text a person is about to send. The sentence is split into tokens. If a token matches a known secret shape, the caller keeps that text on the client and tells them not to send it.

The package does not draw UI. The host app calls `onLiveChange` or `onChange` and shows the result.

## Install

```bash
npm install frontend-secret-scanner
```

The package is plain JavaScript with type declarations. It uses no Node APIs and runs in the browser.

## Develop

Node `^20.19.0` or `>=22.12.0`.

```bash
git clone https://github.com/bastiankemmer/frontend-secret-scanner.git
cd frontend-secret-scanner
npm install
```

## Use

Initialize a detector. With no config, it uses the default checklist, strict mode, detailed results, and `onChange`.

```ts
import { initializeSecretDetector } from "frontend-secret-scanner";

const detector = initializeSecretDetector();

input.addEventListener("change", () => {
  const result = detector.onChange(input.value);
  if (!result.allowSend) {
    // Show a warning. Do not POST the text.
  }
});
```

`onLiveChange` is the same check for an `input` event. Set `when` to record which one the app should call.

```ts
const detector = initializeSecretDetector({
  strict: true,
  when: "onLiveChange",
  report: "boolean",
  rules: [],
});
```

`strict: true` sets `allowSend` to false when a token is a secret. `strict: false` still reports the secret and sets `allowSend` to true.

`report: "detail"` adds an error with the rule label and the token span. The message does not repeat the secret. `report: "boolean"` returns `{ pass, allowSend }` and does not include the token.

`rules` replaces the checklist. Omit it to use the built-in shapes.

## What a token can be

Known shapes only, in `src/rules.ts`:

- Anthropic API key
- OpenAI API key
- AWS access key
- GitHub personal access token
- Stripe live secret key
- Slack token
- JSON Web Token
- Database connection string with a password

A password or a custom key with no known prefix is not a secret token. Guessing from entropy flags ordinary words, so that is not the approach. A secret stuck to another word is a different token and is not reported.

## Config page

```bash
npm run demo
```

Vite prints a local URL. Type a sentence, check the tokens, turn strict mode and the result shape on or off, and add a shape from a token that the checklist missed. Build copies a config object for `initializeSecretDetector`.

## Scripts

```bash
npm test
npm run typecheck
npm run build   # emits dist/
npm run demo
```

## License

MIT. See `LICENSE`.

## Publishing

Publishing is automatic. Creating a GitHub release runs `.github/workflows/publish.yml`, which tests, builds, and runs `npm publish` with provenance. `ci.yml` runs the same checks on every push to `main` and on pull requests.

One-time setup:

1. On npmjs.com, create an automation access token that can publish.
2. In the GitHub repo, add it under Settings, Secrets and variables, Actions, as `NPM_TOKEN`.

Per release:

1. Set `version` in `package.json` and merge it.
2. Create a GitHub release with the tag `v<version>`, for example `v0.1.0`. The workflow fails if the tag and `package.json` differ.
