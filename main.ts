// markdown-fast - driver for the make.fun bounty
// `markdown-render-speed-02`.
//
// Loads every case, renders each document on its own through the
// pure `parse()` entry point in `./parse.js`, and writes the HTML
// strings out (input order kept) as one JSON array.
//
// Where input and output live is set by the harness contract:
//   - in the grading container they are `/input` and `/output`;
//   - outside a container, `MAKEFUN_INPUT_DIR` and
//     `MAKEFUN_OUTPUT_DIR` override them (handy for local runs).
//
// One `parse()` call per case, nothing shared. `parse()` holds no
// state between calls and the driver holds no cache, so a case's
// output depends only on that case's markdown - the same isolation
// the grader uses when it renders the reference with marked.
//
// This file stays thin on purpose: all the work (and all the
// speed) sits in `parse.js`. Here there is only the harness I/O
// contract - locate `cases.json`, decode it, run the render loop,
// write `html.json` - so the parser stays a pure, dependency-free
// function that can be benchmarked and tested on its own.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

// `cases.json` lives here, `html.json` goes here. The environment
// variables are the local-development override; the container
// defaults (`/input`, `/output`) match the grading harness.
const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// One practice or grading case: a stable id plus markdown source.
// The id is only for debugging; the output array is positional
// (index `i` of `html.json` is the rendering of case `i` of
// `cases.json`), so the driver never reorders or drops a case.
interface Case {
  id: string;
  markdown: string;
}

// `cases.json` is either a bare array or an object with a `cases`
// key; both are accepted so a local re-run never trips on the
// wrapper shape. The JSON is decoded once, up front - no streaming,
// because the whole set is small and the render loop below is the
// hot path.
const decoded: unknown = JSON.parse(
  readFileSync(join(inputDir, 'cases.json'), 'utf8'),
);
const cases: Case[] = Array.isArray(decoded)
  ? decoded
  : (decoded as { cases: Case[] }).cases;

// Render in order. Preallocating the output array keeps the loop
// allocation-free on the hot path. `parse()` is pure, so each
// iteration stands alone and the loop could run in parallel without
// changing any output - but the harness wants the cases in input
// order, and a single-threaded in-order loop already runs far
// faster than the reference, so workers or batching would only add
// complexity for nothing.
const html: string[] = new Array<string>(cases.length);
for (let i = 0; i < cases.length; i++) {
  html[i] = parse(cases[i].markdown);
}

// Write the results. The output directory is created recursively
// (the harness may point at a fresh path), and the JSON goes out
// as a single array - one HTML string per case, input order kept.
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'html.json'), JSON.stringify(html));
