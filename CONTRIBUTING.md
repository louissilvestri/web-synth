# Contributing

Thanks for wanting to contribute! A few quick notes to get started:

- Install dependencies: `npm install`
- Keep code linted: `npm run lint`
- Keep tests passing: `npm test`

Utility sync:

- A single canonical implementation of `sliderToGain` lives in `lib/sliderToGain.cjs`.
- To make the client-side ES module up-to-date, run: `npm run sync-utils` (this creates `public/js/sliderToGain.js`).

Local dev:

- Start a local server: `npm start` or `npm run dev` for automatic reloads.

When opening a PR, please ensure linting and tests pass.
