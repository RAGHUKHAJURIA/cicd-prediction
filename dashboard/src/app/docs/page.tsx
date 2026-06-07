"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/hooks/use-auth";
import { UserMenu } from "@/components/auth/user-menu";
import {
  ShieldAlert,
  Home as HomeIcon,
  ArrowRight,
  BookOpen,
  Terminal,
  Code2,
  FileCode2,
  Lock,
  Search,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

interface Rule {
  id: string;
  number: number;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  impact: string;
  vulnerableYaml: string;
  securedYaml: string;
}

const RULES: Rule[] = [
  {
    id: "hardcoded-secrets",
    number: 1,
    title: "Hardcoded Credentials & Secrets",
    severity: "CRITICAL",
    description: "Detects credentials, API tokens, private keys, and passwords committed directly in workflow YAML files or scripts.",
    impact: "Attackers with repository access can extract these credentials and gain unauthorized access to target services.",
    vulnerableYaml: `env:
  AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE"
  AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"`,
    securedYaml: `env:
  AWS_ACCESS_KEY_ID: \${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: \${{ secrets.AWS_SECRET_ACCESS_KEY }}`
  },
  {
    id: "shell-injection",
    number: 2,
    title: "Shell Injection in Actions",
    severity: "CRITICAL",
    description: "Scans for runs invoking dynamic user input (like PR title or issue body) inside inline bash shell execution.",
    impact: "Malicious users can submit PRs containing command execution strings in their titles to run arbitrary commands on the runner.",
    vulnerableYaml: `- name: Print PR Title
  run: echo "Processing PR: \${{ github.event.pull_request.title }}"`,
    securedYaml: `- name: Print PR Title
  env:
    PR_TITLE: \${{ github.event.pull_request.title }}
  run: echo "Processing PR: $PR_TITLE"`
  },
  {
    id: "unpinned-actions",
    number: 3,
    title: "Unpinned Third-Party Actions",
    severity: "HIGH",
    description: "Ensures external actions reference full 40-character commit hashes instead of mutable tags like '@main' or '@v1'.",
    impact: "If the upstream action is hijacked or deleted, your pipeline will instantly run untrusted third-party code.",
    vulnerableYaml: `- name: Checkout Code
  uses: actions/checkout@v4`,
    securedYaml: `- name: Checkout Code
  uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1`
  },
  {
    id: "overprivileged-token",
    number: 4,
    title: "Over-privileged Token Permissions",
    severity: "HIGH",
    description: "Enforces explicit, minimal permissions for the default GITHUB_TOKEN rather than letting it inherit default write access.",
    impact: "Compromised actions in the pipeline can misuse GITHUB_TOKEN to write to releases, packages, or directly write back commits.",
    vulnerableYaml: `# Inherits default repository write settings
permissions: {}`,
    securedYaml: `permissions:
  contents: read
  issues: write`
  },
  {
    id: "missing-timeouts",
    number: 5,
    title: "Missing Timeout Configuration",
    severity: "MEDIUM",
    description: "Flags jobs or individual steps that do not specify a 'timeout-minutes' attribute.",
    impact: "Hanging processes or slow-running builds will run up to the default 360-minute limit, draining runner hours and costs.",
    vulnerableYaml: `- name: Run End-to-End Tests
  run: npm run test:e2e`,
    securedYaml: `- name: Run End-to-End Tests
  run: npm run test:e2e
  timeout-minutes: 15`
  },
  {
    id: "untrusted-checkout-pr",
    number: 6,
    title: "Untrusted Checkout on PR Target",
    severity: "CRITICAL",
    description: "Flags pipelines triggering on 'pull_request_target' that immediately check out and execute code from the head ref.",
    impact: "Attackers can fork the repository, modify the build scripts, and submit a PR to execute their modified code inside the context of the main repo's secrets.",
    vulnerableYaml: `on: pull_request_target
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: npm install && npm run build`,
    securedYaml: `on: pull_request
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install && npm run build`
  },
  {
    id: "vulnerable-base-image",
    number: 7,
    title: "Vulnerable Docker Base Images",
    severity: "HIGH",
    description: "Checks Dockerfiles and runner configs for legacy or unpinned base images (e.g. node:latest).",
    impact: "Latest tags change silently, causing unpredictable builds and introducing unresolved OS-level CVEs.",
    vulnerableYaml: `FROM node:latest`,
    securedYaml: `FROM node:20.11.0-alpine`
  },
  {
    id: "missing-sast-steps",
    number: 8,
    title: "Missing Security Scanning (SAST)",
    severity: "MEDIUM",
    description: "Flags workflows that compile or deploy release builds without integrating static security scan steps.",
    impact: "Security flaws, vulnerabilities, or misconfigured files can leak to production undetected.",
    vulnerableYaml: `jobs:
  deploy:
    steps:
      - uses: actions/checkout@v4
      - run: npm run deploy`,
    securedYaml: `jobs:
  scan-and-deploy:
    steps:
      - uses: actions/checkout@v4
      - name: Run Security Scan
        uses: aquasecurity/trivy-action@master
      - run: npm run deploy`
  },
  {
    id: "cleartext-secrets-env",
    number: 9,
    title: "Cleartext API Keys in Env",
    severity: "HIGH",
    description: "Detects plaintext string keys set directly inside environment blocks in workflow files.",
    impact: "These keys are exposed in build logs and build configuration files, visible to anybody with repository access.",
    vulnerableYaml: `env:
  API_KEY: "sk_live_51M..."`,
    securedYaml: `env:
  API_KEY: \${{ secrets.STRIPE_API_KEY }}`
  },
  {
    id: "insecure-artifacts",
    number: 10,
    title: "Insecure Uploads of Artifacts",
    severity: "MEDIUM",
    description: "Validates files included in uploaded build artifacts to ensure they do not copy secrets, .env files, or build caches.",
    impact: "Leaked configurations, tokens, or local databases are stored within the artifacts storage and downloadable by unauthorized users.",
    vulnerableYaml: `- name: Archive Build Output
  uses: actions/upload-artifact@v4
  with:
    name: build-assets
    path: .`,
    securedYaml: `- name: Archive Build Output
  uses: actions/upload-artifact@v4
  with:
    name: build-assets
    path: dist/`
  },
  {
    id: "missing-cache-expiry",
    number: 11,
    title: "Missing Cache Policy / Expiry",
    severity: "LOW",
    description: "Scans caching steps to ensure build caches do not retain temporary system files or exceed size limits.",
    impact: "Stale caches degrade pipeline performance and can lead to cache pollution.",
    vulnerableYaml: `- name: Cache Node Modules
  uses: actions/cache@v4
  with:
    path: ~/.npm
    key: \${{ runner.os }}-node`,
    securedYaml: `- name: Cache Node Modules
  uses: actions/cache@v4
  with:
    path: ~/.npm
    key: \${{ runner.os }}-node-\${{ hashFiles('**/package-lock.json') }}`
  },
  {
    id: "deprecated-apis",
    number: 12,
    title: "Deprecated Runner/Action APIs",
    severity: "LOW",
    description: "Identifies usages of outdated run flags, Node versions, or deprecated actions commands (e.g. set-output).",
    impact: "Workflows using deprecated features fail to execute when GitHub upgrades its base runner environments.",
    vulnerableYaml: `- name: Set Version
  run: echo "::set-output name=ver::1.0.0"`,
    securedYaml: `- name: Set Version
  run: echo "ver=1.0.0" >> $GITHUB_OUTPUT`
  },
  {
    id: "arbitrary-curls",
    number: 13,
    title: "Arbitrary Pipeline Downloads",
    severity: "HIGH",
    description: "Flags scripts running curl or wget to fetch remote scripts and run them immediately with bash.",
    impact: "If the remote domain is compromised, the attacker can execute arbitrary malware inside your private runner network.",
    vulnerableYaml: `- name: Install Tooling
  run: curl -sSfL https://untrusted-host.com/install.sh | bash`,
    securedYaml: `- name: Install Tooling
  run: |
    curl -sSfL -o install.sh https://trusted-host.com/install.sh
    echo "a7d8e87498d5f...  install.sh" | sha256sum -c
    bash install.sh`
  },
  {
    id: "unauthorized-registries",
    number: 14,
    title: "Unauthorized Registry Pulls",
    severity: "MEDIUM",
    description: "Flags configurations pulling images from third-party or public repositories without authentication parameters.",
    impact: "Subject to severe rate limiting or exposure to malicious image spoofing/squatting.",
    vulnerableYaml: `- name: Pull base image
  run: docker pull myorg/private-app:v1`,
    securedYaml: `- name: Login & Pull base image
  run: |
    echo "\${{ secrets.DOCKER_PASSWORD }}" | docker login -u "\${{ secrets.DOCKER_USER }}" --password-stdin
    docker pull myorg/private-app:v1`
  },
  {
    id: "insecure-runners",
    number: 15,
    title: "Insecure Self-Hosted Runners",
    severity: "HIGH",
    description: "Identifies workflows utilizing self-hosted runner tags (e.g. self-hosted) in public repositories.",
    impact: "Unprivileged forks can submit PRs that run unauthorized code directly on your private networks and servers.",
    vulnerableYaml: `runs-on: self-hosted`,
    securedYaml: `runs-on: ubuntu-latest`
  },
  {
    id: "pipeline-integrity",
    number: 16,
    title: "Pipeline Integrity Verification",
    severity: "MEDIUM",
    description: "Verifies whether outputs, releases, or deployments are cryptographically signed (e.g. Cosign) before distribution.",
    impact: "No guarantee of software supply chain integrity; deployments are vulnerable to tampering and man-in-the-middle attacks.",
    vulnerableYaml: `- name: Deploy Release
  run: npm publish`,
    securedYaml: `- name: Deploy & Sign Release
  run: |
    npm publish
    cosign sign --key cosign.key ./dist`
  }
];

export default function DocsPage() {
  const { user } = useAuth();
  const [selectedRule, setSelectedRule] = useState<Rule>(RULES[0]);

  const severityColors = {
    CRITICAL: "bg-red-500/10 text-red-400 border-red-500/30",
    HIGH: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    MEDIUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    LOW: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  };

  return (
    <div className="min-h-screen text-gray-50 selection:bg-success/30 selection:text-white bg-black">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 right-0 w-full h-[600px] bg-gradient-to-b from-success/5 via-transparent to-transparent pointer-events-none" />
      
      {/* Navigation */}
      <div className="fixed top-4 w-full z-50 px-4">
        <nav className="max-w-7xl mx-auto h-14 rounded-full bg-[#0d1117]/40 backdrop-blur-2xl border border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_8px_32px_0_rgba(0,0,0,0.5)] px-4 flex items-center justify-between">
          {/* Left: Logo & Title */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center">
              <ShieldAlert className="w-4.5 h-4.5 text-success" />
            </div>
            <span className="font-extrabold font-sans tracking-tight text-base text-white">
              Antigravity.
            </span>
          </Link>

          {/* Center Pill */}
          <div className="hidden md:flex items-center gap-1 bg-white/[0.03] border border-white/[0.08] rounded-full px-1 py-1 backdrop-blur-md">
            <Link
              href="/"
              className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold text-gray-400 hover:text-white transition-colors"
            >
              <HomeIcon className="w-3.5 h-3.5" />
              <span>Home</span>
            </Link>
            <Link
              href="/docs"
              className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold bg-success/15 text-success border border-success/25"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Docs</span>
            </Link>
            <Link
              href={user ? "/repos" : "/login"}
              className="px-3 py-1 rounded-full text-[11px] font-semibold text-gray-400 hover:text-white transition-colors"
            >
              <span>Dashboard</span>
            </Link>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <Link
              href={user ? "/repos" : "/login"}
              className="hidden sm:flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold text-gray-400 hover:text-white border border-white/[0.08] hover:border-white/[0.15] bg-white/[0.02] transition-colors"
            >
              <span>Repos</span>
            </Link>
            {user ? (
              <UserMenu />
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-[11px] font-bold text-gray-400 hover:text-white transition-colors px-2"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-1.5 rounded-full font-sans font-bold text-white text-[11px] bg-success hover:bg-success-muted shadow-glow-success hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center gap-1"
                >
                  <span>Sign Up</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>

      <div className="max-w-7xl mx-auto pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <header className="mb-12 text-center md:text-left md:max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success border border-success/20 text-xs font-bold uppercase tracking-wider mb-4">
            <Terminal className="w-3.5 h-3.5" />
            <span>Developer Reference Docs</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-sans font-black tracking-tight mb-4 text-white leading-tight">
            Security & Reliability Rules
          </h1>
          <p className="text-gray-400 text-base leading-relaxed">
            Our engine scans workflow definitions, runner setups, base Dockerfiles, and dependencies using 16 specialized, security-focused pipeline rules. Click any rule in the sidebar to review explanations and secured fixes.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Sidebar */}
          <aside className="lg:col-span-4 rounded-3xl border border-white/[0.06] bg-[#0d1117]/30 backdrop-blur-xl p-4 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] max-h-[70vh] overflow-y-auto">
            <div className="flex items-center gap-2 px-3 pb-3 mb-3 border-b border-white/[0.06]">
              <Search className="w-4 h-4 text-gray-400" />
              <span className="text-xs uppercase tracking-wider text-gray-400 font-bold">16 Scanner Rules</span>
            </div>
            <div className="flex flex-col gap-1">
              {RULES.map((rule) => {
                const isSelected = selectedRule.id === rule.id;
                return (
                  <button
                    key={rule.id}
                    onClick={() => setSelectedRule(rule)}
                    className={`flex items-start text-left gap-3 p-3 rounded-2xl transition-all duration-200 border cursor-pointer ${
                      isSelected
                        ? "bg-success/10 border-success/30 text-white font-medium"
                        : "border-transparent text-gray-400 hover:bg-white/[0.04] hover:text-gray-200"
                    }`}
                  >
                    <span className={`text-xs font-mono font-bold mt-0.5 w-5 h-5 flex items-center justify-center rounded-lg ${
                      isSelected ? "bg-success/20 text-success" : "bg-white/[0.04] text-gray-500"
                    }`}>
                      {rule.number.toString().padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate leading-tight">{rule.title}</p>
                      <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border mt-1.5 ${severityColors[rule.severity]}`}>
                        {rule.severity}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Details Column */}
          <main className="lg:col-span-8 flex flex-col gap-6">
            {/* Main Info Card */}
            <div className="rounded-[32px] border border-white/[0.08] bg-[#0d1117]/40 backdrop-blur-xl p-6 md:p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-6 mb-6">
                <div>
                  <span className="text-sm font-mono text-success font-bold uppercase tracking-wider">
                    RULE #{selectedRule.number}
                  </span>
                  <h2 className="text-2xl md:text-3xl font-bold font-sans text-white mt-1">
                    {selectedRule.title}
                  </h2>
                </div>
                <div className={`text-xs font-extrabold px-3 py-1 rounded-full border shadow-sm ${severityColors[selectedRule.severity]}`}>
                  {selectedRule.severity} SEVERITY
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-2 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-success" />
                    <span>Rule Description</span>
                  </h3>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    {selectedRule.description}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-red-950/10 border border-red-500/10 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs uppercase tracking-widest text-red-400 font-bold mb-1">
                      Security Risk & Impact
                    </h4>
                    <p className="text-gray-400 text-xs leading-relaxed">
                      {selectedRule.impact}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Code Fix Comparison */}
            <div className="rounded-[32px] border border-white/[0.08] bg-[#0d1117]/40 backdrop-blur-xl p-6 md:p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">
              <h3 className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-6 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-success" />
                <span>Yaml Fix Blueprint</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Vulnerable Code */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-red-500/5 border border-red-500/10">
                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Vulnerable Example</span>
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  </div>
                  <pre className="flex-1 p-4 rounded-2xl bg-black border border-white/[0.06] text-red-300 text-xs font-mono overflow-x-auto whitespace-pre">
                    <code>{selectedRule.vulnerableYaml}</code>
                  </pre>
                </div>

                {/* Secured Code */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-success/5 border border-success/10">
                    <span className="text-[10px] font-bold text-success uppercase tracking-wider">Secured Blueprint</span>
                    <CheckCircle className="w-3.5 h-3.5 text-success" />
                  </div>
                  <pre className="flex-1 p-4 rounded-2xl bg-black border border-white/[0.06] text-success-muted text-xs font-mono overflow-x-auto whitespace-pre">
                    <code>{selectedRule.securedYaml}</code>
                  </pre>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-12 border-t border-white/[0.06] bg-black text-center text-sm font-sans text-gray-500">
        <div className="max-w-7xl mx-auto px-6">
          <p>© 2026 Antigravity. Built for CI/CD Reliability Intelligence.</p>
        </div>
      </footer>
    </div>
  );
}
