// markdown-fast — bounty driver for make.fun `markdown-render-speed-02`.
//
// Reads the whole case list, renders each document in isolation via
// the pure `parse()` entry point in `./parse.js`, and emits the
// resulting HTML strings (in input order) as a JSON array.
//
// Input / output locations follow the harness contract:
//   * inside the grading container they are `/input` and `/output`;
//   * outside a container the `MAKEFUN_INPUT_DIR` / `MAKEFUN_OUTPUT_DIR`
//     environment variables override them (useful for local runs).
//
// Every case is rendered by exactly one `parse()` call. `parse()` keeps
// no state between calls and the driver keeps no cache, so the output
// for a case depends solely on that case's markdown — the same isolation
// the grader applies when it renders the reference with marked.
//
// The driver is deliberately thin: all of the work (and all of the
// speed) lives in `parse.js`. This file only handles the harness
// I/O contract — finding `cases.json`, decoding it, driving the
// render loop, and writing `html.json` — so that the parser itself
// remains a pure, dependency-free function that can be benchmarked
// and tested in isolation.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

// Where the harness places `cases.json`, and where it expects `html.json`.
// The environment variables serve as the local-development override; the
// container defaults (`/input`, `/output`) agree with the grading harness.
const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// One practice or grading case: a stable id plus the markdown source.
// The id is carried through solely for debugging; the output array is
// positional (index `i` of `html.json` holds the rendering of case `i`
// of `cases.json`), so the driver never reorders or drops cases.
interface Case {
  id: string;
  markdown: string;
}

// `cases.json` holds either a bare array or an object with a `cases` key;
// accept both so a local re-run never trips on the wrapper shape.
// The JSON is parsed a single time, up front; there is no streaming because
// the whole set is small and the render loop below is the hot path.
const decoded: unknown = JSON.parse(
  readFileSync(join(inputDir, 'cases.json'), 'utf8'),
);
const cases: Case[] = Array.isArray(decoded)
  ? decoded
  : (decoded as { cases: Case[] }).cases;

// Render in sequence. Preallocating the output array keeps the loop
// allocation-free along the hot path; `parse()` itself is pure, so
// each iteration stands alone and the loop could be parallelised
// without altering any output — but the harness expects the cases
// in input order, and a single-threaded in-order loop already runs
// far faster than the reference, so there is no cause to add the
// complexity of workers or batching.
const html: string[] = new Array<string>(cases.length);
for (let i = 0; i < cases.length; i++) {
  html[i] = parse(cases[i].markdown);
}

// Emit the results. The output directory is created recursively
// (the harness may point at a fresh path), and the JSON is emitted
// as a single array — one HTML string per case, preserving input order.
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'html.json'), JSON.stringify(html));
