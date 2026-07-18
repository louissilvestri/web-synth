# Contributing

Thanks for wanting to contribute!

## Where development happens

The v2 rewrite lives on the **`v2` branch** until it ships (then it merges to
`main`). Base feature branches on `v2` and open PRs against it. The v1 app is
preserved at the `v1.0` tag.

Work is tracked on the [project board](https://github.com/users/louissilvestri/projects)
and grouped into [milestones](https://github.com/louissilvestri/web-synth/milestones) —
see [docs/PLAN.md](docs/PLAN.md) for the full build plan.

## Local dev

```bash
npm install
npm run dev        # Next.js dev server → http://localhost:3000
```

## Quality gates (CI runs all of these)

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest — engine/DSP unit tests
npm run build      # Next.js static export
```

## Code layout

- `engine/` — framework-free TypeScript audio engine (module graph mirroring
  the subtractive signal chain; unit-testable without an AudioContext).
- `app/` — Next.js App Router UI. React never touches the audio graph directly.
- `styles/signature-style.css` — design tokens/components, consumed verbatim
  from the design system. Don't edit ad hoc; UI work builds on these tokens.

When opening a PR, ensure all four quality gates pass.
