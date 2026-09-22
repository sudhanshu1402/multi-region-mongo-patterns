#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace';
const CELL = 8.4;
const LINE = 22;
const PAD = 26;
const BAR = 38;

const COLOR = {
  bg: '#0d1117',
  bar: '#161b22',
  chrome: '#30363d',
  head: '#e6edf3',
  dim: '#7d8590',
  text: '#c9d1d9',
  good: '#3fb950',
  warn: '#d29922',
  bad: '#f85149',
  cool: '#58a6ff',
};

function escape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attr(text) {
  return escape(text).replace(/"/g, '&quot;');
}

// SVG collapses runs of spaces, so column alignment is held by non-breaking spaces of the same width.
function cells(text) {
  return escape(text).replace(/ /g, '\u00a0');
}

function frame(width, height, title) {
  const dots = ['#ff5f57', '#febc2e', '#28c840']
    .map((fill, i) => `<circle cx="${20 + i * 18}" cy="19" r="6" fill="${fill}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${attr(title)}">
  <rect width="${width}" height="${height}" rx="10" fill="${COLOR.bg}" stroke="${COLOR.chrome}"/>
  <path d="M0 10a10 10 0 0 1 10-10h${width - 20}a10 10 0 0 1 10 10v28H0z" fill="${COLOR.bar}"/>
  ${dots}
  <text x="${PAD + 48}" y="23" font-family="${MONO}" font-size="12" fill="${COLOR.dim}">${escape(title)}</text>`;
}

function box(lines, title) {
  return {
    width: Math.round(Math.max(...lines.map((l) => l.length), title.length + 24) * CELL + PAD * 2),
    height: BAR + lines.length * LINE + PAD,
  };
}

function colorOf(line) {
  if (/\bfailed\b/.test(line) || /"status":409/.test(line)) return COLOR.bad;
  if (/\bpassed\b/.test(line) || /"ok":true/.test(line)) return COLOR.good;
  if (/^\$/.test(line)) return COLOR.head;
  return COLOR.text;
}

function demo(lines, title) {
  const { width, height } = box(lines, title);
  const rows = lines
    .map(
      (line, i) =>
        `<text x="${PAD}" y="${BAR + 16 + i * LINE}" font-family="${MONO}" font-size="14" font-weight="500" fill="${colorOf(line)}">${cells(line)}</text>`
    )
    .join('\n    ');
  return `${frame(width, height, title)}
    ${rows}
</svg>
`;
}

// A blank or changed capture must fail the build, not quietly redraw the picture.
function must(lines, expected) {
  for (const want of expected) {
    if (!lines.some((line) => want.test(line))) {
      throw new Error(`${want} is missing from the captured output:\n${lines.join('\n')}`);
    }
  }
  return lines;
}

// GitHub Actions colours vitest output, which made the summary filter match nothing.
function plain(out) {
  return out.replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, '');
}

// The picture is real program output: a broken test shows up in the image, not just in CI.
function runNpmTest() {
  const proc = spawnSync('npm', ['test'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, TZ: 'UTC', CI: 'true', NO_COLOR: '1' },
  });
  const text = plain(`${proc.stdout}\n${proc.stderr}`);
  // Non-TTY vitest logs a per-file line carrying a duration, so only the totals are reproducible.
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(Test Files|Tests)\s/.test(line));
  if (!lines.length) throw new Error(`no test output captured:\n${text}`);
  return lines;
}

const DEMO_FILE = 'scripts/demo-residency.ts';

// The 409 is the whole point of the repo, so the picture shows the real guard rejecting a write.
function runResidency() {
  const proc = spawnSync(process.execPath, [join(ROOT, 'node_modules/.bin/ts-node'), DEMO_FILE], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, TZ: 'UTC', NO_COLOR: '1' },
  });
  if (proc.status !== 0) throw new Error(`residency capture failed:\n${proc.stderr}`);
  return plain(proc.stdout).trim().split('\n');
}

function testDemo() {
  const guard = must(runResidency(), [/"ok":true/, /"status":409/, /data residency violation/]);
  // Assert the shape, not the count. Pinning the exact number meant every test
  // added to the suite broke `npm run assets`, and with it the CI step that checks
  // the committed diagrams are current. The guard's job is to catch a blank or
  // failing capture, which `[1-9]\d* passed` still does.
  const lines = must(runNpmTest(), [/Test Files\s+[1-9]\d* passed \(\d+\)/, /^Tests\s+[1-9]\d* passed \(\d+\)/]);
  const passed = lines.find((line) => /^Tests\s/.test(line))?.match(/([1-9]\d*) passed/)?.[1];
  if (!passed) throw new Error(`could not read a pass count from:\n${lines.join('\n')}`);
  return {
    passed,
    markup: demo(
      [`$ ts-node ${DEMO_FILE}`, ...guard, '', '$ npm test', ...lines],
      'proof it runs, offline'
    ),
  };
}

// The count is filled in from the run that just happened, never typed here. A
// literal drifts the moment a test is added, and a glance card that misstates its
// own evidence is worse than one that shows no number at all.
const tilesFor = (passed) => [
  ['PATTERN', 'zone sharding', 'one string, 3 real zones', COLOR.head],
  ['SHARD KEY', 'region first', 'else every read scatters', COLOR.cool],
  ['RESIDENCY', '409', 'zone mismatch rejected', COLOR.bad],
  ['VERIFIED', `${passed} tests`, 'offline, no cluster', COLOR.good],
];

function glance(passed) {
  const TILES = tilesFor(passed);
  // 195px tile holds 24 glyphs at font-size 12, 14 at font-size 16.
  for (const [, big, small] of TILES) {
    if (small.length > 24 || big.length > 14) throw new Error(`tile text too long: ${big} / ${small}`);
  }
  const width = 880;
  const height = 150;
  const tiles = TILES.map(([role, big, small, fill], i) => {
    const x = 20 + i * 215;
    return `<rect x="${x}" y="30" width="195" height="96" rx="8" fill="${COLOR.bar}" stroke="${COLOR.chrome}"/>
    <text x="${x + 16}" y="56" fill="${COLOR.dim}" font-size="11" letter-spacing="1">${role}</text>
    <text x="${x + 16}" y="82" fill="${fill}" font-size="16" font-weight="600">${cells(big)}</text>
    <text x="${x + 16}" y="106" fill="${COLOR.dim}" font-size="12">${cells(small)}</text>`;
  }).join('\n    ');
  const label =
    `multi-region-mongo-patterns at a glance: zone sharding, region leads the shard key or every read scatters, a residency mismatch returns 409, ${passed} tests verified offline with no cluster needed`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${attr(label)}">
  <rect width="${width}" height="${height}" rx="10" fill="${COLOR.bg}" stroke="${COLOR.chrome}"/>
  <g font-family="${MONO}">
    ${tiles}
  </g>
</svg>
`;
}

mkdirSync(join(ROOT, 'assets'), { recursive: true });
// The suite runs once; both pictures are drawn from that single capture, so the
// glance card can never claim a different number from the terminal beside it.
const { passed, markup: demoMarkup } = testDemo();
for (const [name, markup] of [
  ['glance.svg', glance(passed)],
  ['demo.svg', demoMarkup],
]) {
  writeFileSync(join(ROOT, 'assets', name), markup);
  process.stdout.write(`wrote assets/${name}\n`);
}
