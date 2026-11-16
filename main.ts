// markdown-fast — bounty driver for make.fun `markdown-render-speed-02`.
//
// Reads the whole case list, renders every document in isolation with
// the pure `parse()` entry point from `./parse.js`, and writes the
// resulting HTML strings (in input order) as a JSON array.
//
// Input / output locations follow the harness contract:
//   * inside the grading container they are `/input` and `/output`;
//   * outside a container the `MAKEFUN_INPUT_DIR` / `MAKEFUN_OUTPUT_DIR`
//     environment variables override them (handy for local runs).
//
// Each case is rendered by exactly one `parse()` call. `parse()` keeps
// no state between calls and the driver keeps no cache, so the output
// for a case depends only on that case's markdown — the same isolation
// the grader applies when it renders the reference with marked.
//
// The driver is deliberately thin: all of the work (and all of the
// speed) lives in `parse.js`. This file only handles the harness
// I/O contract — locating `cases.json`, decoding it, driving the
// render loop, and writing `html.json` — so that the parser itself
// stays a pure, dependency-free function that can be benchmarked
// and tested in isolation.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

// Where the harness puts `cases.json`, and where it expects `html.json`.
// The environment variables are the local-development override; the
// container defaults (`/input`, `/output`) match the grading harness.
const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// One practice/grading case: a stable id plus the markdown source.
// The id is carried through only for debugging; the output array is
// positional (index `i` of `html.json` is the rendering of case `i`
// of `cases.json`), so the driver never reorders or filters cases.
interface Case {
  id: string;
  markdown: string;
}

// `cases.json` is either a bare array or an object with a `cases` key;
// accept both so a local re-run never fails on the wrapper shape.
// The JSON is parsed once, up front; there is no streaming because
// the whole set is small and the render loop below is the hot path.
const decoded: unknown = JSON.parse(
  readFileSync(join(inputDir, 'cases.json'), 'utf8'),
);
const cases: Case[] = Array.isArray(decoded)
  ? decoded
  : (decoded as { cases: Case[] }).cases;

// Render in order. Preallocating the output array keeps the loop
// allocation-free in the hot path; `parse()` itself is pure, so
// each iteration is independent and the loop could be parallelised
// without changing any output — but the harness expects the cases
// in input order, and a single-threaded in-order loop is already
// far faster than the reference, so there is no reason to add the
// complexity of workers or batching here.
const html: string[] = new Array<string>(cases.length);
for (let i = 0; i < cases.length; i++) {
  html[i] = parse(cases[i].markdown);
}

// Write the results. The output directory is created recursively
// (the harness may point at a fresh path), and the JSON is written
// as a single array — one HTML string per case, in input order.
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'html.json'), JSON.stringify(html));
