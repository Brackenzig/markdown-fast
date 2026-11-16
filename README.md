# markdown-fast

[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/Brackenzig/markdown-fast/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/Brackenzig/markdown-fast/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

A dependency-free, byte-exact reimplementation of **marked 18.1.3**
(default options, GFM on) for the make.fun bounty **"Make Markdown
rendering faster"** (`markdown-render-speed-02`).

`parse(markdown)` returns exactly the HTML that marked 18.1.3
returns. `main.ts` is the harness driver: it reads every case from
`/input/cases.json`, renders each one alone with `parse`, and writes
`/output/html.json`.

## How it works

The design follows the fastest entries on the leaderboard — an
index/cursor scanner instead of a token tree, a single pass over
inline content, deopt-free hot loops, first-byte dispatch, char-code
lookup tables — combined with a structure of our own:

- **Block parser.** A container-stack parser (document / quote /
  list / item plus leaf blocks). Each line is matched against the
  open containers outside-in, then either continues the tip block or
  starts new blocks. Rendering is a second pass, so link reference
  definitions anywhere in the document resolve. Tab widths are
  computed from the remainder's starting column in the original
  line (column-aware stripping), which is what makes the tab
  cases — fenced code in containers, indented code, list markers —
  come out byte-identical.
- **Inline scanner.** A flat segment list, no token tree. Segments
  are raw text, finished HTML (code span / autolink / inline HTML),
  delimiter objects (`*`, `_`, `~`), link/image markers, and hard
  breaks. Emphasis runs the CommonMark delimiter-stack algorithm
  over that flat list, with link text resolved in its own scope so
  delimiters cannot match across a link boundary. GFM extended
  autolinks (`www.`, `scheme://`, `scheme:email/path`, bare email)
  are found by one regex pass per inline string, with trailing
  punctuation, unbalanced `)`, and `]` handling that mirrors
  marked's backpedal, and with the email rule that a `__` closer
  is a delimiter rather than a word character.
- **HTML blocks.** An HTML block's trailing newline is decided by
  what follows it: it is kept when a sibling block follows without
  a blank line (at any nesting depth), dropped after a truly empty
  blank line, and dropped when the block is its parent's last
  child. A whitespace-only blank line does not suppress it.
- **Fast paths.** An inline string with no special characters, no
  `www.` / `://` / `@`, and no hard break is escaped only. The hot
  loops avoid allocations and stay monomorphic.

No caching across cases: `parse` is pure per call. No input
recognition: there are no lookup tables of case outputs. The output
is deterministic.

## Marked quirks reproduced

Beyond the CommonMark core, this parser reproduces several
marked-specific behaviours that the generated README cases
exercise. Each one is documented at the site where it is
implemented in `parse.js`:

- **Autolink `]`-cut.** A GFM autolink regex match can straddle
  two URLs (`...](https://...)`); the match is cut at the `]`
  when it opens a balanced group starting with a URL, so the
  second URL is found on its own. When the destination group
  runs past the match (nested parens plus a title), the cut is
  still taken when the group text starts with a URL scheme.
  The cut is taken only when the `]` closes a link that can
  actually form; when the label already holds a link, the whole
  span stays one autolink.
- **3-star strong closer.** When a `**` opener is closed by a
  `***` run and the span holds an inner `*...*` emphasis whose
  closing `*` is immediately followed by a non-space character,
  marked consumes all three stars and the leftover `*` lands
  *inside* the `<strong>`. Otherwise the leftover `*` stays
  outside. The closer is flagged and the assembler renders its
  leftover stars before the close tag in that case.
- **Phantom code span.** A link whose label holds an unmatched
  single backtick (not inside a formed code span, with no
  matching single run after it in the label) opens a
  code-span-like region in marked: all emphasis after the link
  stays literal until the last single backtick in the string.
  An intermediate code span does not end it. The region does
  not apply inside a link label (a label is lexed in its own
  scope), and it is only opened when a single backtick actually
  follows the link in the same inline string.
- **Backtick code span inside a link label.** A code span in a
  link label must close before the label's `]` when the link
  forms; when the label is backtick-blocked, the `]` is not a
  label closer and the span may cross it. Emphasis is not formed
  over a code span delimited by 2+ backticks whose content holds
  a backtick when the span sits inside a link label — but only
  when the emphasis actually starts before that label's closing
  `]`; an opener whose label already closed does not count.
- **Email autolink inside emphasis.** An email autolink forms
  inside `_..._` emphasis when the trailing `_` is its closer;
  a bare trailing `_` (gfm-632/633) still blocks it.

## Files

- `parse.js` — the parser (dependency-free ES module, `parse(markdown)`).
- `main.ts` — the harness driver (reads `/input/cases.json`, writes `/output/html.json`).
- `LICENSE` — MIT.
- `README.md` — this file.

## Practice results (local, Node 24, practice set)

- **717 / 720 cases byte-identical** to marked 18.1.3 on the
  practice set (round 3). All 680 CommonMark + GFM spec examples
  pass, and 37 of the 40 generated READMEs pass. The remaining
  3 generated READMEs differ on stacked context-dependent edges:
  a GFM table misparsed as a heading (earlier context), a
  nested-link/autolink interaction with an unbalanced code span,
  and a loose-vs-tight list call across marker-only blank lines.
- **~915 µs CPU per document** (fresh 5-run benchmark) vs
  **~1,218 µs** for marked on the same set — about **1.33×
  faster than marked**. Correctness gates timing: only
  all-matching entries are timed, so this entry is not yet
  submittable as a prize contender.

## Usage

```sh
# inside the harness container (or with the env vars set locally):
MAKEFUN_INPUT_DIR=./practice/input MAKEFUN_OUTPUT_DIR=./out \
  npx tsx main.ts
```

## Scoring

The kit scorer renders every case in `practice/input` with
`main.ts`, then compares the output against
`practice/reference` byte-for-byte:

```sh
MAKEFUN_INPUT_DIR=../markdown-render-speed-02-kit/practice/input \
MAKEFUN_OUTPUT_DIR=/tmp/md-out node main.ts
MAKEFUN_OUTPUT_DIR=/tmp/md-out \
MAKEFUN_REFERENCE_DIR=../markdown-render-speed-02-kit/practice/reference \
MAKEFUN_SCORES_DIR=/tmp/md-scores \
node ../markdown-render-speed-02-kit/program/scorer/main.ts
```

The score is the count of byte-identical cases out of 720.
Only a 720/720 entry is timed for the prize.
