# Proofline

Paste an invoice, agreement or meeting notes; inspect extracted facts against their exact source text and review a short AI-drafted next step.

New project started 9 November 2026 for the Clocked Build Challenge. The interface, API pipeline and initial tests were built with AI assistance in Noah: https://trynoah.ai/playground/6af1fd261b878a049a8041a1. Deployment packaging and verification were completed with Codex. Unused starter-template components are excluded from this repository.

## Real Clocked integration

The browser sends a same-origin POST to `/.netlify/functions/analyze`. The server calls Clocked `/decide` to choose an extraction schema, then `/extract` and `/fill` concurrently. The response contains facts, exact Unicode code-point source spans, confidence, and a labeled AI draft. Missing facts stay missing; invalid spans are never highlighted. If drafting fails, extracted evidence is still available with a partial-result warning.

Each analysis uses one request UUID and stable, separate idempotency keys for each endpoint. A retry with unchanged text reuses the same keys. There are no automatic retries.

## Run and verify

Requires Node 20.19+ or Node 22.12+.

```sh
npm ci
npm run check
```

`check` runs the unit and integration tests, TypeScript checking, lint and the production build. Tests use an injected fake upstream service and do not require credentials. They cover missing fields, Unicode and malformed spans, input limits, schema routing, failures, partial results and retry identifiers.

For local full-stack development, configure `CLOCKED_API_KEY` in an untracked `.env` file and run `npx netlify dev`. A Vite-only preview cannot execute the server function.

## Deployment

Connect this repository to Netlify. Use `npm run build`, publish `dist`, and deploy functions from `netlify/functions`. Store `CLOCKED_API_KEY` as a production secret in Netlify. It is never a `VITE_` variable or included in the browser bundle. The free plan makes secrets available to Builds, Functions and Runtime; only the server function reads this key.

The API accepts same-origin JSON POSTs, at most 12,000 Unicode code points and 32 KB. It has a 50-second upstream budget, per-instance rate limiting and Netlify IP rate limiting. Responses use `no-store`; there is no database or document logging.

## Manual live checks

- Invoice: the corrected total is €2,480.00, not €2,840.00. Clicking it must highlight the corrected source line, including correct offsets after emoji.
- Agreement: do not invent a missing effective date; prefer the amended deadline.
- Notes: keep the absent meeting date missing; show explicit action items.
- Copy and JSON download must reflect the actual result; Clear must remove the document and result from the tab.

Automated tests do not establish live API success. A release should only be described as live-verified after these checks pass against its deployed function.

## Privacy and limits

Clicking Analyze sends the full text to Clocked through the server. Only use documents you are authorized to send. Proofline does not persist source text or results; they stay in browser memory until Clear or closing the tab. The JSON export includes source text only when the user requests a download. Hosting and Clocked operate under their own service policies. AI output can be incorrect and must be reviewed. Plain text only; no PDF upload, login, payment or blockchain integration.

## License

MIT. Sample documents are fictional and use example.com addresses.
