import { guardrail } from './src/ai';
import { AIPatchResult } from './src/ai/remediation-generator';

async function run() {
  const orig = `name: CI\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm install`;
  const patched = orig.replace('npm install', 'npm ci');
  const f = { ruleId: 'reliability-flaky-install', evidence: 'npm install' } as any;
  const p: AIPatchResult = { patchedContent: patched, explanation: 'x', warnings: [], requiresManualReview: false };
  const res = await guardrail.validatePatch(orig, patched, '.github/workflows/ci.yml', f, p, 'ai-generated');
  console.log(JSON.stringify(res, null, 2));
}
run();
