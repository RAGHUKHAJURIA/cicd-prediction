type Severity = "critical" | "high" | "medium" | "low" | "info";
type Category = "security" | "reliability" | "performance" | "maintainability";

interface Classification {
  severity: Severity;
  category: Category;
}

const RULES: Array<{
  pattern: RegExp;
  severity: Severity;
  category: Category;
}> = [
  // CRITICAL + SECURITY
  { pattern: /secret|credential|password|token|hardcoded|exposed/i, severity: "critical", category: "security" },
  // HIGH + SECURITY
  { pattern: /curl.{0,20}(bash|sh)|wget.{0,20}sh|untrusted|privilege|root|privileged/i, severity: "high", category: "security" },
  // HIGH + RELIABILITY
  { pattern: /floating|latest.tag|unpinned|no.digest/i, severity: "high", category: "reliability" },
  // MEDIUM + RELIABILITY
  { pattern: /timeout|retry|rollback|health/i, severity: "medium", category: "reliability" },
  // MEDIUM + SECURITY
  { pattern: /npm install(?! -ci| ci)|pip install|apt-get[^=]+(version)?/i, severity: "medium", category: "security" },
  // LOW + RELIABILITY
  { pattern: /no.healthcheck|single.replica|no.readiness/i, severity: "low", category: "reliability" },
  // LOW + MAINTAINABILITY
  { pattern: /deprecated|legacy|duplicate|complexity/i, severity: "low", category: "maintainability" },
];

export function classifyFindingSeverity(
  ruleId: string,
  message: string
): Classification {
  const haystack = `${ruleId} ${message}`;

  for (const rule of RULES) {
    if (rule.pattern.test(haystack)) {
      return { severity: rule.severity, category: rule.category };
    }
  }

  return { severity: "info", category: "maintainability" };
}

/** Generate a short remediation hint from a message/ruleId. */
export function generateRemediation(message: string): string {
  const m = message.toLowerCase();

  if (/floating|latest|unpinned|no.digest/.test(m))
    return "Pin the image to a specific digest: image@sha256:...";
  if (/npm install(?! -ci| ci)/.test(m))
    return "Use `npm ci` instead of `npm install` for reproducible installs.";
  if (/timeout/.test(m))
    return "Add `timeout-minutes: 30` to prevent hung jobs from blocking runners.";
  if (/curl.{0,20}(bash|sh)|wget.{0,20}sh/.test(m))
    return "Download the script, verify its checksum, then execute it explicitly.";
  if (/secret|credential|password|token|hardcoded|exposed/.test(m))
    return "Move secrets to an encrypted secret store (GitHub Secrets, Vault, AWS SSM).";
  if (/no.healthcheck/.test(m))
    return "Add a HEALTHCHECK instruction to the Dockerfile for container readiness signaling.";

  return "Review the flagged configuration and apply security/reliability best practices.";
}
