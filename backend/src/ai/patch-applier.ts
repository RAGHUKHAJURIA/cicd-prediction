import { PatchResult, PatchType } from './patch-builder';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApplyResult {
  /** The merged file content with all safe patches applied */
  content: string;
  /** Patches that were successfully applied */
  appliedPatches: PatchResult[];
  /** Patches that were skipped (placeholder detected or overlap) */
  skippedPatches: SkippedPatch[];
  /** Patches that require manual review (not auto-applied) */
  manualReviewPatches: PatchResult[];
}

export interface SkippedPatch {
  patch: PatchResult;
  reason: SkipReason;
  detail: string;
}

export enum SkipReason {
  PLACEHOLDER_DETECTED = 'placeholder_detected',
  OVERLAP              = 'overlap',
  ANCHOR_NOT_FOUND     = 'anchor_not_found',
  INVALID_PATCH        = 'invalid_patch'
}

// ─── Placeholder tokens ──────────────────────────────────────────────────────

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\{REPLACE_WITH_SHA\}/i,
  /\{REPLACE_WITH[^}]*\}/i,
  /YOUR_COMMAND_HERE/i,
  /YOUR_[A-Z_]+_HERE/i,
  /PLACEHOLDER/i,
  /\bTODO:/i,
  /\bFIXME:/i,
  /REPLACE_WITH(?!_SHA)/i,        // bare REPLACE_WITH (not inside braces)
  /\$\{[A-Z_]*PLACEHOLDER[^}]*\}/i,
];

// ─── PatchApplier ────────────────────────────────────────────────────────────

export class PatchApplier {

  /**
   * Apply safe patches to the original file content.
   * 
   * - Only `certain` and `likely` confidence patches are auto-applied.
   * - `manual-review-required` patches are collected but NOT applied.
   * - Patches containing placeholder tokens are skipped.
   * - Overlapping patches (same region) are detected and the later one is skipped.
   */
  applyPatches(originalContent: string, patches: PatchResult[]): ApplyResult {
    const appliedPatches: PatchResult[] = [];
    const skippedPatches: SkippedPatch[] = [];
    const manualReviewPatches: PatchResult[] = [];

    // Separate manual-review patches first
    const autoPatches: PatchResult[] = [];
    for (const patch of patches) {
      if (patch.confidence === 'manual-review-required') {
        manualReviewPatches.push(patch);
      } else {
        autoPatches.push(patch);
      }
    }

    // Filter out patches with placeholders
    const safePatches: PatchResult[] = [];
    for (const patch of autoPatches) {
      if (this.containsPlaceholder(patch.after)) {
        skippedPatches.push({
          patch,
          reason: SkipReason.PLACEHOLDER_DETECTED,
          detail: `Patch 'after' text contains placeholder token(s): ${this.findPlaceholders(patch.after).join(', ')}`
        });
      } else {
        safePatches.push(patch);
      }
    }

    // Also check manual-review patches for placeholders (annotate but keep in manualReview list)
    // No action needed — they're already excluded from auto-apply

    // Sort patches by their match position in the original content (earliest first)
    // so we can detect overlaps and apply in order
    const positionedPatches = safePatches
      .map(patch => {
        const pos = originalContent.indexOf(patch.before);
        return { patch, position: pos };
      })
      .filter(({ patch, position }) => {
        if (position === -1) {
          skippedPatches.push({
            patch,
            reason: SkipReason.ANCHOR_NOT_FOUND,
            detail: `Could not find 'before' anchor text in the original file content`
          });
          return false;
        }
        return true;
      })
      .sort((a, b) => a.position - b.position);

    // Detect overlaps and apply patches
    let content = originalContent;
    let offset = 0; // track cumulative offset from previous replacements
    let lastEnd = -1; // end position of last applied patch (in original coords)

    for (const { patch, position } of positionedPatches) {
      const patchEnd = position + patch.before.length;

      // Check overlap with previously applied patch
      if (position < lastEnd) {
        skippedPatches.push({
          patch,
          reason: SkipReason.OVERLAP,
          detail: `Patch overlaps with a previously applied patch at position ${position} (previous patch ends at ${lastEnd})`
        });
        continue;
      }

      // Build the replacement text with proper indentation
      const replacement = this.buildReplacement(patch, content, position + offset);

      // Apply the patch
      const adjustedPosition = position + offset;
      const before = content.substring(0, adjustedPosition);
      const after = content.substring(adjustedPosition + patch.before.length);
      content = before + replacement + after;

      // Update offset for next patch
      offset += replacement.length - patch.before.length;
      lastEnd = patchEnd;
      appliedPatches.push(patch);
    }

    return { content, appliedPatches, skippedPatches, manualReviewPatches };
  }

  /**
   * Check if text contains any known placeholder tokens.
   */
  containsPlaceholder(text: string): boolean {
    return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(text));
  }

  /**
   * Find all placeholder tokens in text and return them.
   */
  findPlaceholders(text: string): string[] {
    const found: string[] = [];
    for (const pattern of PLACEHOLDER_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        found.push(match[0]);
      }
    }
    return found;
  }

  /**
   * Build the replacement text for a patch, handling indentation for YAML patches.
   */
  private buildReplacement(patch: PatchResult, content: string, matchPosition: number): string {
    if (patch.patchType === PatchType.APPEND_BLOCK || patch.patchType === PatchType.REPLACE_VALUE) {
      // Detect the indentation of the anchor line
      const targetIndent = this.detectIndentation(content, matchPosition);
      return this.reindentBlock(patch.after, targetIndent);
    }

    // For FULL_FILE patches, use the after text as-is
    if (patch.patchType === PatchType.FULL_FILE) {
      return patch.after;
    }

    // Default: return after text as-is
    return patch.after;
  }

  /**
   * Detect the indentation level (number of leading spaces) of the line
   * at the given position in the content.
   */
  private detectIndentation(content: string, position: number): number {
    // Walk backwards from position to find the start of the line
    let lineStart = position;
    while (lineStart > 0 && content[lineStart - 1] !== '\n') {
      lineStart--;
    }

    // Count leading spaces
    let indent = 0;
    while (lineStart + indent < content.length && content[lineStart + indent] === ' ') {
      indent++;
    }

    return indent;
  }

  /**
   * Re-indent all lines of a block to the target indentation level.
   * 
   * Preserves relative indentation within the block:
   * - The first line's existing indentation is used as the "base"
   * - All other lines are adjusted relative to the first line
   */
  reindentBlock(block: string, targetIndent: number): string {
    const lines = block.split('\n');
    if (lines.length === 0) return block;

    // Find the base indentation (from the first non-empty line)
    let baseIndent = 0;
    for (const line of lines) {
      if (line.trim().length > 0) {
        baseIndent = line.length - line.trimStart().length;
        break;
      }
    }

    return lines.map(line => {
      if (line.trim().length === 0) return ''; // preserve empty lines
      const currentIndent = line.length - line.trimStart().length;
      const relativeIndent = Math.max(0, currentIndent - baseIndent);
      const newIndent = targetIndent + relativeIndent;
      return ' '.repeat(newIndent) + line.trimStart();
    }).join('\n');
  }
}

export const patchApplier = new PatchApplier();
