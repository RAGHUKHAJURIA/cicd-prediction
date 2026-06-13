import { detectAndParse } from '../parsers';

export const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\{REPLACE_WITH_[A-Z0-9_]+\}/,
  /\{[A-Z0-9_]+_HERE\}/,
  /YOUR_[A-Z0-9_]+_HERE/,
  /\bTODO\b\s*:/,
  /\bFIXME\b\s*:/,
  /<[A-Z][A-Z0-9_]*>/,
  /\bPLACEHOLDER\b/i,
  /\bXXX_/,
];

export function containsPlaceholder(text: string): boolean {
  if (!text) return false;
  return PLACEHOLDER_PATTERNS.some(re => re.test(text));
}

export function findPlaceholderMatches(text: string): string[] {
  const matches: string[] = [];
  for (const re of PLACEHOLDER_PATTERNS) {
    const m = text.match(re);
    if (m) matches.push(m[0]);
  }
  return matches;
}

export interface GuardedContent {
  safe: boolean;
  content: string;
  rejectedReason: string | null;
  rejectedMatches: string[];
}

export function guardFileContent(
  candidateContent: string,
  fallbackContent: string,
  context: { filePath: string; ruleId?: string; source: string }
): GuardedContent {

  // STEP 1 — Placeholder check:
  const matches = findPlaceholderMatches(candidateContent);
  if (matches.length > 0) {
    console.warn(
      `[file-output-guard] REJECTED content for ${context.filePath} ` +
      `(rule: ${context.ruleId ?? 'n/a'}, source: ${context.source}): ` +
      `found placeholder tokens: ${matches.join(', ')}`
    );
    return {
      safe: false,
      content: fallbackContent,
      rejectedReason: 'Contains unresolved placeholder tokens',
      rejectedMatches: matches,
    };
  }

  // STEP 2 — Parse validation (only for known CI/CD file types and full file content):
  if (context.source !== 'finding-patch' && /\.(ya?ml)$/i.test(context.filePath)) {
    try {
      const result = detectAndParse(candidateContent, context.filePath, 'guard-check');
      if (!result.success) {
        console.warn(
          `[file-output-guard] REJECTED content for ${context.filePath}: ` +
          `parse error: ${result.errors?.[0]?.message}`
        );
        return {
          safe: false,
          content: fallbackContent,
          rejectedReason: `Invalid ${context.filePath.endsWith('.yml') ? 'YAML' : 'syntax'}: ${result.errors?.[0]?.message ?? 'unknown'}`,
          rejectedMatches: [],
        };
      }
    } catch (err) {
      // if detectAndParse throws for unsupported file types, do NOT reject
    }
  }

  // STEP 3 — Approve:
  return {
    safe: true,
    content: candidateContent,
    rejectedReason: null,
    rejectedMatches: [],
  };
}

export function guardFinding(finding: {
  ruleId: string;
  filePath: string;
  patch?: { before: string; after: string } | null;
}): {
  displayPatch: { before: string; after: string } | null;
  requiresManualReview: boolean;
  manualReason: string | null;
} {
  if (!finding.patch) {
    return { displayPatch: null, requiresManualReview: false, manualReason: null };
  }

  const guarded = guardFileContent(
    finding.patch.after,
    finding.patch.before,
    { filePath: finding.filePath, ruleId: finding.ruleId, source: 'finding-patch' }
  );

  if (!guarded.safe) {
    return {
      displayPatch: null,
      requiresManualReview: true,
      manualReason: guarded.rejectedReason,
    };
  }

  return {
    displayPatch: { before: finding.patch.before, after: guarded.content },
    requiresManualReview: false,
    manualReason: null,
  };
}
