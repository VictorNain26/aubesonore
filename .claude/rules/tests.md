---
description: Writing or changing tests — loaded when opening a test file
paths:
  - "**/*.test.{ts,tsx,mjs,sh}"
  - "**/tests/**"
---

# tests

A test earns its place by the regression it would catch. Before writing or keeping one, name the
change to the code that would make it fail; if none comes to mind, it is not worth its upkeep.

- **Assert what the user or the caller sees**: text, accessible roles and states, returned values,
  database rows, HTTP responses. Not CSS classes, config values, constants or the arguments handed
  to a mock: those break on a refactor and miss real bugs. ([Testing Library's guiding
  principle](https://testing-library.com/docs/guiding-principles/); _Software Engineering at
  Google_, ch. 12: test via public APIs, test state not interactions.) Only when the effect cannot
  happen in the test environment (a document navigation in jsdom) is the call to the boundary what
  the test reads (_ibid._, ch. 13: interaction testing when state testing is not possible).
- **The look belongs to the visual suite** (`site/apps/frontend/visual/`): no unit test restates it.
- **Don't test a library** (Base UI, zustand, valibot, pydantic, argparse…): its own tests do that.
- **What a tool can enforce goes to the tool**: lint rule, type checker, CI step. Not a test that
  reads the sources.
- **Check what already covers the behaviour** before adding a test: another test, a lint rule, a
  build invariant, a CI step. Extend that one rather than repeat it.
- **No test for a one-off data migration** once it has run in production.
- **Measure before deleting or weakening a test**: run a mutation tool on the code it covers
  (mutmut for Python, StrykerJS for TypeScript) and keep the test, or its assertion, if it fails
  on a change no other test fails on. Reading alone is not enough: a prune made on reading
  (8b3c2970) dropped the fade timings and the test of the kept tracks' clear(), which a mutation
  run then found unguarded.
