# markdown-fast

[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/Brackenzig/markdown-fast/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/Brackenzig/markdown-fast/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

A dependency-free renderer that reproduces **marked 18.1.3** byte for
byte (default options, GFM on), built for the make.fun bounty **"Make
Markdown rendering faster"** (`markdown-render-speed-02`).

`parse(markdown)` returns exactly the HTML marked 18.1.3 returns.
`main.ts` is the harness driver: it reads each case from
`/input/cases.json`, renders it alone with `parse`, and writes
`/output/html.json`.

## How it works

The approach takes cues from the fastest leaderboard entries - an
index/cursor scanner rather than a token tree, one pass over inline
content, deopt-free hot loops, first-byte dispatch, char-code lookup
tables - combined into a structure of its own:

- **Block parser.** A container-stack parser (document, quote, list,
  item, plus leaf blocks). Each line is checked against the open
  containers outside-in, then either continues the tip block or opens
  fresh blocks. Rendering is a second pass, so link reference
  definitions placed anywhere in the document resolve. Tab widths
  come from the starting column of the remainder in the original line
  (column-aware stripping), which is what makes the tab cases -
  fenced code inside containers, indented code, list markers - come
  out byte-identical.
- **Inline scanner.** A flat segment list, never a token tree.
  Segments are raw text, finished HTML (code span, autolink, inline
  HTML), delimiter objects (`*`, `_`, `~`), link/image markers, and
  hard breaks. Emphasis runs the CommonMark delimiter-stack
  algorithm over that flat list, with link text resolved in its own
  scope so delimiters can never pair across a link edge. GFM
  extended autolinks (`www.`, `scheme://`, `scheme:email/path`, bare
  email) are found by a single regex pass per inline string, with
  trailing punctuation, unbalanced `)`, and `]` handling that mirrors
  marked's backpedal, plus the email rule that a `__` closer counts
  as a delimiter rather than a word character.
- **HTML blocks.** Whether an HTML block keeps its trailing newline
  depends on what comes next: it stays when a sibling block follows
  with no blank line (at any nesting depth), goes away after a truly
  empty blank line, and goes away when the block is its parent's last
  child. A whitespace-only blank line does not remove it.
- **Fast paths.** An inline string with no special characters, no
  `www.` / `://` / `@`, and no hard break gets escaping only. The hot
  loops avoid allocations and stay monomorphic.

No caching between cases: `parse` is pure per call. No input
recognition: there are no lookup tables holding case outputs. The
output is deterministic.

## Marked quirks reproduced

Beyond the CommonMark core, this parser reproduces several
marked-specific behaviours that the generated README cases cover.
Each one is documented at the place it is implemented in `parse.js`:

- **Autolink `]`-cut.** A GFM autolink regex match can span two
  URLs (`...](https://...)`); the match is cut at the `]` when it
  opens a balanced group that starts with a URL, so the second URL
  is found on its own. When the destination group runs past the match
  (nested parens plus a title), the cut is still taken when the group
  text begins with a URL scheme. The cut applies only when the `]`
  closes a link that can genuinely form; when the label already holds
  a link, the whole span stays one autolink.
- **3-star strong closer.** When a `**` opener is closed by a `***`
  run and the span holds an inner `*...*` emphasis whose closing `*`
  is immediately followed by a non-space character, marked swallows
  all three stars and the leftover `*` lands *inside* the `<strong>`.
  Otherwise the leftover `*` stays outside. The closer is flagged
  and the assembler emits its leftover stars before the close tag in
  that case.
- **Phantom code span.** A link whose label holds an unmatched single
  backtick (not inside a formed code span, with no matching single
  run after it in the label) opens a code-span-like region in marked:
  all emphasis after the link stays literal until the final single
  backtick in the string. An intermediate code span does not end it.
  The region does not reach inside a link label (a label is lexed in
  its own scope), and it opens only when a single backtick genuinely
  follows the link in the same inline string.
- **Backtick code span inside a link label.** A code span in a link
  label must close before the label's `]` when the link forms; when
  the label is backtick-blocked, the `]` is not a label closer and
  the span may cross it. Emphasis is not formed over a code span
  delimited by 2+ backticks whose content contains a backtick when
  the span sits within a link label - but only when the emphasis
  genuinely starts before that label's closing `]`; an opener whose
  label already closed does not count.
- **Email autolink inside emphasis.** An email autolink forms inside
  `_..._` emphasis when the trailing `_` serves as its closer; a bare
  trailing `_` (gfm-632/633) still blocks it.

## Files

- `parse.js` - the parser (dependency-free ES module, `parse(markdown)`).
- `main.ts` - the harness driver (reads `/input/cases.json`, writes `/output/html.json`).
- `LICENSE` - MIT.
- `README.md` - this file.

## Practice results (local, Node 24, practice set)

- **720 / 720 cases byte-identical** to marked 18.1.3 on the practice
  set (round 3). All 680 CommonMark + GFM spec examples pass, and all
  40 generated READMEs pass.
- **~982–1,015 µs CPU per document** (fresh 5-run benchmark) vs
  **~1,144 µs** for marked on the same set — about **1.13–1.17×
  faster than marked**. Correctness gates timing: only all-matching
  entries are timed, so this entry now qualifies as a prize contender.

## Usage

```sh
# inside the harness container (or with the env vars set locally):
MAKEFUN_INPUT_DIR=./practice/input MAKEFUN_OUTPUT_DIR=./out \
  npx tsx main.ts
```

## Scoring

The kit scorer renders every case in `practice/input` with `main.ts`,
then compares the output against `practice/reference` byte-for-byte:

```sh
MAKEFUN_INPUT_DIR=../markdown-render-speed-02-kit/practice/input \
MAKEFUN_OUTPUT_DIR=/tmp/md-out node main.ts
MAKEFUN_OUTPUT_DIR=/tmp/md-out \
MAKEFUN_REFERENCE_DIR=../markdown-render-speed-02-kit/practice/reference \
MAKEFUN_SCORES_DIR=/tmp/md-scores \
node ../markdown-render-speed-02-kit/program/scorer/main.ts
```

The score is the count of byte-identical cases out of 720. Only a
720/720 entry is timed for the prize.
