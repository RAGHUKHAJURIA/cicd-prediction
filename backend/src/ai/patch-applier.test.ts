import assert from 'assert';
import { PatchApplier, SkipReason } from './patch-applier';
import { PatchResult, PatchType } from './patch-builder';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makePatch(overrides: Partial<PatchResult> = {}): PatchResult {
  return {
    ruleId: 'test-rule',
    filePath: '.github/workflows/ci.yml',
    patchType: PatchType.REPLACE_VALUE,
    before: 'run: npm install',
    after: 'run: npm ci',
    explanation: 'Use npm ci for reproducible installs',
    isFullFile: false,
    confidence: 'certain',
    ...overrides,
  };
}

const SAMPLE_WORKFLOW = `name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install
        run: npm install
      - name: Test
        run: npm test
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  const applier = new PatchApplier();
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err: any) {
      console.log(`  ❌ ${name}: ${err.message}`);
      failed++;
    }
  }

  console.log('\n🧪 PatchApplier Tests\n');

  // ── applyPatches ────────────────────────────────────────────────────────

  console.log('── applyPatches ──');

  test('applies certain-confidence patch correctly', () => {
    const patch = makePatch({ confidence: 'certain' });
    const result = applier.applyPatches(SAMPLE_WORKFLOW, [patch]);

    assert.ok(result.content.includes('run: npm ci'), 'Should contain patched text');
    assert.ok(!result.content.includes('run: npm install'), 'Should not contain original text');
    assert.strictEqual(result.appliedPatches.length, 1);
    assert.strictEqual(result.skippedPatches.length, 0);
    assert.strictEqual(result.manualReviewPatches.length, 0);
  });

  test('applies likely-confidence patch correctly', () => {
    const patch = makePatch({ confidence: 'likely' });
    const result = applier.applyPatches(SAMPLE_WORKFLOW, [patch]);

    assert.ok(result.content.includes('run: npm ci'));
    assert.strictEqual(result.appliedPatches.length, 1);
    assert.strictEqual(result.manualReviewPatches.length, 0);
  });

  test('excludes manual-review-required patches from output', () => {
    const patch = makePatch({ confidence: 'manual-review-required' });
    const result = applier.applyPatches(SAMPLE_WORKFLOW, [patch]);

    assert.ok(result.content.includes('run: npm install'), 'Original text should remain');
    assert.strictEqual(result.appliedPatches.length, 0);
    assert.strictEqual(result.manualReviewPatches.length, 1);
    assert.strictEqual(result.manualReviewPatches[0].ruleId, 'test-rule');
  });

  test('skips patches with placeholder tokens', () => {
    const patch = makePatch({
      confidence: 'certain',
      before: 'uses: actions/checkout@v3',
      after: 'uses: actions/checkout@{REPLACE_WITH_SHA}  # was: v3',
    });
    const result = applier.applyPatches(SAMPLE_WORKFLOW, [patch]);

    assert.ok(result.content.includes('uses: actions/checkout@v3'), 'Original should remain');
    assert.strictEqual(result.appliedPatches.length, 0);
    assert.strictEqual(result.skippedPatches.length, 1);
    assert.strictEqual(result.skippedPatches[0].reason, SkipReason.PLACEHOLDER_DETECTED);
  });

  test('skips patches when anchor text is not found', () => {
    const patch = makePatch({
      confidence: 'certain',
      before: 'this text does not exist in the file',
      after: 'replacement text',
    });
    const result = applier.applyPatches(SAMPLE_WORKFLOW, [patch]);

    assert.strictEqual(result.appliedPatches.length, 0);
    assert.strictEqual(result.skippedPatches.length, 1);
    assert.strictEqual(result.skippedPatches[0].reason, SkipReason.ANCHOR_NOT_FOUND);
  });

  test('detects overlapping patches and skips the later one', () => {
    const patch1 = makePatch({
      confidence: 'certain',
      before: 'run: npm install',
      after: 'run: npm ci',
    });
    // Overlapping patch — same region
    const patch2 = makePatch({
      ruleId: 'test-rule-2',
      confidence: 'certain',
      before: 'run: npm install',
      after: 'run: yarn install --frozen-lockfile',
    });
    const result = applier.applyPatches(SAMPLE_WORKFLOW, [patch1, patch2]);

    // First patch should be applied, second should be skipped (anchor not found after first replacement)
    assert.strictEqual(result.appliedPatches.length, 1);
    assert.strictEqual(result.appliedPatches[0].ruleId, 'test-rule');
    // The second patch's before text won't be found since it was already replaced
    assert.strictEqual(result.skippedPatches.length, 1);
  });

  test('applies multiple non-overlapping patches', () => {
    const patch1 = makePatch({
      ruleId: 'rule-1',
      confidence: 'certain',
      before: 'run: npm install',
      after: 'run: npm ci',
    });
    const patch2 = makePatch({
      ruleId: 'rule-2',
      confidence: 'certain',
      before: 'run: npm test',
      after: 'run: npm test -- --ci',
    });
    const result = applier.applyPatches(SAMPLE_WORKFLOW, [patch1, patch2]);

    assert.ok(result.content.includes('run: npm ci'));
    assert.ok(result.content.includes('run: npm test -- --ci'));
    assert.strictEqual(result.appliedPatches.length, 2);
    assert.strictEqual(result.skippedPatches.length, 0);
  });

  test('mixed confidence levels — only auto-applies certain/likely', () => {
    const certainPatch = makePatch({
      ruleId: 'certain-rule',
      confidence: 'certain',
      before: 'run: npm install',
      after: 'run: npm ci',
    });
    const manualPatch = makePatch({
      ruleId: 'manual-rule',
      confidence: 'manual-review-required',
      before: 'uses: actions/checkout@v3',
      after: 'uses: actions/checkout@{REPLACE_WITH_SHA}',
    });
    const result = applier.applyPatches(SAMPLE_WORKFLOW, [certainPatch, manualPatch]);

    assert.ok(result.content.includes('run: npm ci'));
    assert.ok(result.content.includes('uses: actions/checkout@v3'), 'Manual patch should NOT be applied');
    assert.strictEqual(result.appliedPatches.length, 1);
    assert.strictEqual(result.manualReviewPatches.length, 1);
  });

  // ── containsPlaceholder ─────────────────────────────────────────────────

  console.log('\n── containsPlaceholder ──');

  test('detects {REPLACE_WITH_SHA}', () => {
    assert.ok(applier.containsPlaceholder('uses: actions/checkout@{REPLACE_WITH_SHA}'));
  });

  test('detects YOUR_COMMAND_HERE', () => {
    assert.ok(applier.containsPlaceholder('command: YOUR_COMMAND_HERE'));
  });

  test('detects TODO:', () => {
    assert.ok(applier.containsPlaceholder('# TODO: fill in the real value'));
  });

  test('detects FIXME:', () => {
    assert.ok(applier.containsPlaceholder('# FIXME: this needs attention'));
  });

  test('detects PLACEHOLDER', () => {
    assert.ok(applier.containsPlaceholder('value: PLACEHOLDER'));
  });

  test('detects YOUR_TOKEN_HERE', () => {
    assert.ok(applier.containsPlaceholder('token: YOUR_TOKEN_HERE'));
  });

  test('returns false for clean text', () => {
    assert.ok(!applier.containsPlaceholder('run: npm ci'));
    assert.ok(!applier.containsPlaceholder('uses: actions/checkout@abc123'));
    assert.ok(!applier.containsPlaceholder('timeout-minutes: 30'));
  });

  // ── reindentBlock ───────────────────────────────────────────────────────

  console.log('\n── reindentBlock ──');

  test('re-indents a block to target indentation', () => {
    const block = 'key: value\n  nested: true';
    const result = applier.reindentBlock(block, 4);
    assert.strictEqual(result, '    key: value\n      nested: true');
  });

  test('preserves relative indentation within block', () => {
    const block = '  parent:\n    child: value\n      grandchild: deep';
    const result = applier.reindentBlock(block, 6);
    const lines = result.split('\n');
    assert.strictEqual(lines[0], '      parent:');
    assert.strictEqual(lines[1], '        child: value');
    assert.strictEqual(lines[2], '          grandchild: deep');
  });

  test('handles zero-indent target', () => {
    const block = '    indented: value';
    const result = applier.reindentBlock(block, 0);
    assert.strictEqual(result, 'indented: value');
  });

  test('handles empty lines in block', () => {
    const block = 'line1: a\n\nline3: c';
    const result = applier.reindentBlock(block, 2);
    const lines = result.split('\n');
    assert.strictEqual(lines[0], '  line1: a');
    assert.strictEqual(lines[1], '');
    assert.strictEqual(lines[2], '  line3: c');
  });

  // ── findPlaceholders ────────────────────────────────────────────────────

  console.log('\n── findPlaceholders ──');

  test('returns all found placeholder tokens', () => {
    const text = 'uses: owner/repo@{REPLACE_WITH_SHA}\ncommand: YOUR_COMMAND_HERE';
    const found = applier.findPlaceholders(text);
    assert.ok(found.length >= 2, `Expected at least 2 placeholders, got ${found.length}`);
  });

  test('returns empty array for clean text', () => {
    const found = applier.findPlaceholders('run: npm ci');
    assert.strictEqual(found.length, 0);
  });

  // ── Summary ─────────────────────────────────────────────────────────────

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
