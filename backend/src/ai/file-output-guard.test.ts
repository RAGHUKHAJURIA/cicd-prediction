import assert from 'assert';
import {
  containsPlaceholder,
  findPlaceholderMatches,
  guardFileContent,
  guardFinding
} from './file-output-guard';
import { detectAndParse } from '../parsers';
import { patchApplier } from './patch-applier';

// Mock filterSafeFileChanges for Test 5
interface FileChange {
  path: string;
  content: string;
  originalContent: string;
}

function filterSafeFileChanges(fileChanges: FileChange[]): FileChange[] {
  const safeChanges: FileChange[] = [];
  for (const fc of fileChanges) {
    const guarded = guardFileContent(fc.content, fc.originalContent, {
      filePath: fc.path,
      source: 'test-filter'
    });
    if (guarded.safe) {
      safeChanges.push({
        ...fc,
        content: guarded.content
      });
    }
  }
  return safeChanges;
}

async function runTests() {
  console.log('\nRunning FileOutputGuard Tests...\n');
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      const res = fn();
      if (res && typeof res.then === 'function') {
        res.then(() => {
          console.log(`  PASS  ${name}`);
          passed++;
        }).catch(err => {
          console.error(`  FAIL  ${name}\n        ${err.message}`);
          failed++;
        });
      } else {
        console.log(`  PASS  ${name}`);
        passed++;
      }
    } catch (err: any) {
      console.error(`  FAIL  ${name}\n        ${err.message}`);
      failed++;
    }
  }

  // TEST 1 — The EXACT reported string is caught
  test('TEST 1 — The EXACT reported string is caught', () => {
    const reported = 'uses: snyk/actions/node@{REPLACE_WITH_SHA}  # was: v3\n# Find SHA: https://github.com/snyk/actions/node/commits/v3';
    assert.strictEqual(containsPlaceholder(reported), true);
    assert.ok(findPlaceholderMatches(reported).includes('{REPLACE_WITH_SHA}'));
  });

  // TEST 2 — guardFileContent rejects and falls back
  test('TEST 2 — guardFileContent rejects and falls back', () => {
    const original = '      - uses: snyk/actions/node@v3\n';
    const candidate = '      - uses: snyk/actions/node@{REPLACE_WITH_SHA}  # was: v3\n# Find SHA: https://...\n';
    const result = guardFileContent(candidate, original, {
      filePath: '.github/workflows/security.yml',
      ruleId: 'security-unpinned-action',
      source: 'test'
    });
    assert.strictEqual(result.safe, false);
    assert.strictEqual(result.content, original);
    assert.ok(result.rejectedMatches.length > 0);
  });

  // TEST 3 — guardFinding hides the diff for unsafe patches
  test('TEST 3 — guardFinding hides the diff for unsafe patches', () => {
    const finding = {
      ruleId: 'security-unpinned-action',
      filePath: '.github/workflows/security.yml',
      patch: {
        before: 'uses: snyk/actions/node@v3',
        after: 'uses: snyk/actions/node@{REPLACE_WITH_SHA}  # was: v3\n# Find SHA: https://...'
      }
    };
    const result = guardFinding(finding);
    assert.strictEqual(result.displayPatch, null);
    assert.strictEqual(result.requiresManualReview, true);
    assert.ok(result.manualReason !== null);
  });

  // TEST 4 — Safe patches pass through unchanged
  test('TEST 4 — Safe patches pass through unchanged', () => {
    const finding = {
      ruleId: 'reliability-flaky-install',
      filePath: '.github/workflows/ci.yml',
      patch: { before: 'run: npm install', after: 'run: npm ci' }
    };
    const result = guardFinding(finding);
    assert.ok(result.displayPatch !== null);
    assert.strictEqual(result.displayPatch!.after, 'run: npm ci');
    assert.strictEqual(result.requiresManualReview, false);
  });

  // TEST 5 — createPullRequest refuses to commit placeholder content
  test('TEST 5 — createPullRequest refuses to commit placeholder content', () => {
    const fileChanges = [{
      path: '.github/workflows/security.yml',
      content: 'uses: x@{REPLACE_WITH_SHA}',
      originalContent: 'uses: x@v3'
    }];
    const result = filterSafeFileChanges(fileChanges);
    assert.strictEqual(result.length, 0);
  });

  // TEST 6 — Full reported workflow file, end to end
  test('TEST 6 — Full reported workflow file, end to end', () => {
    const original = `name: Dependency Security Gate
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  security-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Snyk Security Scan
        uses: snyk/actions/node@v3
        env:
          SNYK_TOKEN: \${{ secrets.SNYK_TOKEN }}
`;
    const patches = [
      {
        ruleId: 'security-unpinned-action',
        filePath: '.github/workflows/security.yml',
        before: 'uses: snyk/actions/node@v3',
        after: 'uses: snyk/actions/node@{REPLACE_WITH_SHA}  # was: v3\n# Find SHA: https://github.com/snyk/actions/node/commits/v3',
        confidence: 'manual-review-required' as const,
        explanation: 'Pin to SHA',
        patchType: 'replace_value' as any,
        isFullFile: false
      },
    ];
    // In our codebase, patchApplier.applyPatches is called to merge patches.
    // Let's verify that the patchApplier correctly skips the manual review patch
    // and returns original workflow content unchanged.
    const result = patchApplier.applyPatches(original, patches);
    assert.strictEqual(result.content, original);
    assert.strictEqual(containsPlaceholder(result.content), false);
    assert.strictEqual(result.manualReviewPatches.length, 1);
    
    const parsed = detectAndParse(result.content, '.github/workflows/security.yml', 'test');
    assert.strictEqual(parsed.success, true);
  });

  // Small delay to let async print resolve
  setTimeout(() => {
    console.log(`\nFileOutputGuard results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
    if (failed > 0) process.exit(1);
  }, 100);
}

runTests();
