"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  ShieldCheck,
  Layers,
  Settings,
  Zap,
  Info,
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

type TabId = "getting-started" | "features" | "method-dashboard" | "method-github-app" | "scanner-rules";

export default function DocsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("getting-started");
  const [selectedRule, setSelectedRule] = useState<Rule>(RULES[0]);

  const severityColors = {
    CRITICAL: "bg-red-500/10 text-red-400 border-red-500/30",
    HIGH: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    MEDIUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    LOW: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  };

  const navTabs = [
    { id: "getting-started" as TabId, label: "Getting Started", icon: BookOpen },
    { id: "features" as TabId, label: "Platform Features", icon: Layers },
    { id: "method-dashboard" as TabId, label: "Method 1: Dashboard", icon: Terminal },
    { id: "method-github-app" as TabId, label: "Method 2: GitHub App", icon: Settings },
    { id: "scanner-rules" as TabId, label: "16 Scanner Rules", icon: Code2 },
  ];

  return (
    <div className="min-h-screen text-gray-50 selection:bg-success/30 selection:text-white bg-black relative overflow-x-hidden">
      {/* Background liquid glow effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-success/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[200px] right-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Navigation */}
      <div className="fixed top-4 w-full z-50 px-4">
        <nav className="max-w-7xl mx-auto h-14 rounded-full bg-[#0d1117]/40 backdrop-blur-2xl border border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_8px_32px_0_rgba(0,0,0,0.5)] px-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center">
              <ShieldAlert className="w-4.5 h-4.5 text-success" />
            </div>
            <span className="font-extrabold font-sans tracking-tight text-base text-white">
              CI/CD Agent.
            </span>
          </Link>

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

      {/* Main Container */}
      <div className="max-w-7xl mx-auto pt-28 pb-20 px-4 sm:px-6 lg:px-8">
        <header className="mb-10 text-center md:text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success border border-success/20 text-xs font-bold uppercase tracking-wider mb-4">
            <Terminal className="w-3.5 h-3.5" />
            <span>Developer Reference & Documentation</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-sans font-black tracking-tight mb-3 text-white">
            Platform Documentation
          </h1>
          <p className="text-gray-400 text-sm max-w-3xl leading-relaxed">
            Welcome to the CI/CD Agent documentation. Learn how to scan, secure, and fix vulnerabilities inside GitHub Actions, GitLab CI, Dockerfiles, and other CI/CD manifests using our REST API, interactive dashboard, or GitHub App Integration.
          </p>
        </header>

        {/* Outer Liquid Glass Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Navigation Sidebar (Liquid Glass) */}
          <aside className="lg:col-span-3 rounded-2xl border border-white/[0.06] bg-[#0d1117]/30 backdrop-blur-2xl p-4 shadow-[0_8px_32px_0_rgba(0,0,0,0.6)] flex flex-col gap-1.5">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-3 mb-2 font-mono">
              Documentation Menu
            </div>
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-left text-xs font-semibold cursor-pointer border ${
                    isActive
                      ? "bg-success/10 border-success/30 text-white shadow-[0_0_15px_rgba(57,211,83,0.1)]"
                      : "border-transparent text-gray-400 hover:bg-white/[0.03] hover:text-white"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-success" : "text-gray-400"}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </aside>

          {/* Dynamic Content Viewport (Liquid Glass Container) */}
          <main className="lg:col-span-9 rounded-[32px] border border-white/[0.08] bg-[#0d1117]/25 backdrop-blur-2xl p-6 md:p-8 shadow-[inset_0_1px_2px_rgba(255,255,255,0.05),0_12px_48px_0_rgba(0,0,0,0.6)] min-h-[500px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* ── Tab: Getting Started ────────────────────────────────────── */}
                {activeTab === "getting-started" && (
                  <div className="space-y-6">
                    <div className="border-b border-white/[0.06] pb-4">
                      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <BookOpen className="w-6 h-6 text-success" />
                        <span>Getting Started</span>
                      </h2>
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      The **CI/CD Agent** is an intelligence platform designed to discover, score, and automatically remediate security vulnerabilities and reliability issues inside your software supply chain pipelines.
                    </p>
                    <div className="p-4 rounded-xl bg-success/5 border border-success/15 flex gap-3">
                      <Info className="w-5 h-5 text-success shrink-0 mt-0.5" />
                      <div className="text-xs text-gray-300 leading-relaxed">
                        <strong className="text-white block mb-1">Two-Way Integration System</strong>
                        Our platform works in two ways: through the **Web Dashboard** for quick manual audits and explanations, and the **GitHub App Integration** for continuous, automated PR gating and status reporting.
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold text-white">How it works</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                          <div className="text-success font-mono font-bold text-xs mb-2">01. INGEST</div>
                          <p className="text-gray-400 text-xs leading-relaxed">
                            Manifest files are scanned manually or automatically webhooked upon push/PR events.
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                          <div className="text-success font-mono font-bold text-xs mb-2">02. AUDIT</div>
                          <p className="text-gray-400 text-xs leading-relaxed">
                            Files are parsed into syntax trees and checked against 16 core reliability rules.
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                          <div className="text-success font-mono font-bold text-xs mb-2">03. AUTOFULL</div>
                          <p className="text-gray-400 text-xs leading-relaxed">
                            Claude AI generates patches, creates PRs, and repairs configurations instantly.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Tab: Platform Features ──────────────────────────────────── */}
                {activeTab === "features" && (
                  <div className="space-y-6">
                    <div className="border-b border-white/[0.06] pb-4">
                      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Layers className="w-6 h-6 text-success" />
                        <span>Platform Features</span>
                      </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                        <ShieldCheck className="w-5 h-5 text-success" />
                        <h3 className="text-sm font-bold text-white">16 Core Security Rules</h3>
                        <p className="text-gray-400 text-xs leading-relaxed">
                          Covers critical threats including shell injection, raw environment secrets, unpinned action hashes, overprivileged GITHUB_TOKENs, and vulnerable Docker tags.
                        </p>
                      </div>
                      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                        <Zap className="w-5 h-5 text-success" />
                        <h3 className="text-sm font-bold text-white">Claude AI Orchestrator</h3>
                        <p className="text-gray-400 text-xs leading-relaxed">
                          Explain pipelines in plain English, predict failure modes, and apply validated output-guarded patches directly back to your repository branch.
                        </p>
                      </div>
                      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                        <Lock className="w-5 h-5 text-success" />
                        <h3 className="text-sm font-bold text-white">Production Rate Limiter</h3>
                        <p className="text-gray-400 text-xs leading-relaxed">
                          Ensures high system reliability and protects downstream APIs using a custom Redis Sliding Window Counter algorithm.
                        </p>
                      </div>
                      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                        <Settings className="w-5 h-5 text-success" />
                        <h3 className="text-sm font-bold text-white">Resilient Redis Cache</h3>
                        <p className="text-gray-400 text-xs leading-relaxed">
                          High-speed caching with pre-warming on system startup, health monitoring, and connection auto-recovery with graceful open fail-safes.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Tab: Method 1: Web Dashboard ────────────────────────────── */}
                {activeTab === "method-dashboard" && (
                  <div className="space-y-6">
                    <div className="border-b border-white/[0.06] pb-4">
                      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Terminal className="w-6 h-6 text-success" />
                        <span>Method 1: Web Dashboard Scans</span>
                      </h2>
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      The dashboard offers a completely web-based workflow for performing ad-hoc repository audits and generating patches interactively.
                    </p>
                    <div className="space-y-4">
                      <div className="flex gap-4 items-start">
                        <div className="w-6 h-6 rounded-full bg-success/15 border border-success/30 text-success text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                          1
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">Import Repository</h4>
                          <p className="text-gray-400 text-xs leading-relaxed mt-1">
                            Paste any public GitHub repository URL, or link your personal GitHub profile to select private repositories.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-4 items-start">
                        <div className="w-6 h-6 rounded-full bg-success/15 border border-success/30 text-success text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                          2
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">Trigger Scan</h4>
                          <p className="text-gray-400 text-xs leading-relaxed mt-1">
                            Initiate a manual scan. A background worker picks up the repository, parses the files, and scores findings from CRITICAL to LOW.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-4 items-start">
                        <div className="w-6 h-6 rounded-full bg-success/15 border border-success/30 text-success text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                          3
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">Generate Explanations & Fixes</h4>
                          <p className="text-gray-400 text-xs leading-relaxed mt-1">
                            Click any vulnerability to request a Claude AI explanation. Use the **Explain** or **Remediate** action to generate a secured code patch.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-4 items-start">
                        <div className="w-6 h-6 rounded-full bg-success/15 border border-success/30 text-success text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                          4
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">Commit Fixes / Create PR</h4>
                          <p className="text-gray-400 text-xs leading-relaxed mt-1">
                            Click **Apply Fix** to push the fixed workflow code directly to a new branch and automatically raise a Pull Request on your behalf.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Tab: Method 2: GitHub App Integration ────────────────────── */}
                {activeTab === "method-github-app" && (
                  <div className="space-y-6">
                    <div className="border-b border-white/[0.06] pb-4">
                      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Settings className="w-6 h-6 text-success" />
                        <span>Method 2: GitHub App Integration</span>
                      </h2>
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      To run checks in your development loops automatically without logging into the dashboard, install our official GitHub App.
                    </p>

                    <div className="space-y-4">
                      <h3 className="text-sm font-bold text-white">Installation Steps</h3>
                      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-mono text-gray-400 font-bold uppercase">Installation URL</span>
                          <a
                            href="https://github.com/apps/ci-cd-reliability-platform/installations/new"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-success hover:underline font-semibold"
                          >
                            <span>Install App ↗</span>
                          </a>
                        </div>
                        <p className="text-gray-400 text-xs leading-relaxed">
                          Navigate to the [Integrations Settings Page](/settings/integrations) or click the link above. Follow the GitHub prompts to install the App on either your entire organization or specific repositories.
                        </p>
                      </div>

                      <h3 className="text-sm font-bold text-white">Automated Webhook Security Checks</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                          <h4 className="text-xs font-bold text-white">01. Push Event Scans</h4>
                          <p className="text-gray-400 text-xs leading-relaxed">
                            Whenever commits are pushed to your repository, our webhook processor automatically schedules a pipeline audit, ensuring new changes adhere to the rules.
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                          <h4 className="text-xs font-bold text-white">02. Pull Request Guardrails</h4>
                          <p className="text-gray-400 text-xs leading-relaxed">
                            When a PR is submitted, our system initiates analysis checks and registers a check run. If critical security violations exist, it reports a failure status to block the merge.
                          </p>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-success/5 border border-success/15 flex gap-3">
                        <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
                        <div className="text-xs text-gray-300 leading-relaxed">
                          <strong className="text-white block mb-1">Automatic Patch Proposals</strong>
                          If the system flags a fixable risk during a pull request check (like an unpinned action tag), it will write out a remediated patch and suggest it directly within the check comments, letting you accept the fix with a click.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Tab: Scanner Rules ──────────────────────────────────────── */}
                {activeTab === "scanner-rules" && (
                  <div className="space-y-6">
                    <div className="border-b border-white/[0.06] pb-4">
                      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Code2 className="w-6 h-6 text-success" />
                        <span>Security & Reliability Rules</span>
                      </h2>
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      Our scanner evaluates pipeline workflows using 16 specialized rules. Click any rule in the sidebar list below to inspect description details, vulnerability impact, and security blueprints.
                    </p>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-4">
                      {/* Rules Sidebar list */}
                      <div className="lg:col-span-5 flex flex-col gap-1.5 max-h-[500px] overflow-y-auto pr-1 border-r border-white/[0.04]">
                        {RULES.map((rule) => {
                          const isSelected = selectedRule.id === rule.id;
                          return (
                            <button
                              key={rule.id}
                              onClick={() => setSelectedRule(rule)}
                              className={`flex items-start text-left gap-3 p-2.5 rounded-xl transition-all duration-200 border cursor-pointer ${
                                isSelected
                                  ? "bg-success/10 border-success/30 text-white font-medium shadow-[0_0_10px_rgba(57,211,83,0.05)]"
                                  : "border-transparent text-gray-400 hover:bg-white/[0.02] hover:text-gray-200"
                              }`}
                            >
                              <span className={`text-[10px] font-mono font-bold mt-0.5 w-5 h-5 flex items-center justify-center rounded-lg ${
                                isSelected ? "bg-success/20 text-success" : "bg-white/[0.03] text-gray-500"
                              }`}>
                                {rule.number.toString().padStart(2, "0")}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate leading-tight">{rule.title}</p>
                                <span className={`inline-block text-[8px] font-extrabold px-1.5 py-0.5 rounded border mt-1 ${severityColors[rule.severity]}`}>
                                  {rule.severity}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Selected Rule Panel */}
                      <div className="lg:col-span-7 space-y-4">
                        <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.06] space-y-3">
                          <div>
                            <span className="text-[10px] font-mono text-success font-bold uppercase tracking-wider">
                              RULE #{selectedRule.number}
                            </span>
                            <h3 className="text-lg font-bold text-white mt-0.5">
                              {selectedRule.title}
                            </h3>
                          </div>
                          <p className="text-gray-300 text-xs leading-relaxed">
                            {selectedRule.description}
                          </p>
                          <div className="p-3 rounded-xl bg-red-950/10 border border-red-500/10 flex items-start gap-2.5">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <div>
                              <h4 className="text-[10px] uppercase tracking-widest text-red-400 font-bold mb-0.5">
                                Security Risk & Impact
                              </h4>
                              <p className="text-gray-400 text-[11px] leading-relaxed">
                                {selectedRule.impact}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Code Blueprint blocks */}
                        <div className="space-y-3">
                          {/* Vulnerable */}
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-red-500/5 border border-red-500/10">
                              <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Vulnerable Example</span>
                              <AlertTriangle className="w-3 h-3 text-red-400" />
                            </div>
                            <pre className="p-3 rounded-xl bg-black border border-white/[0.04] text-red-300 text-[11px] font-mono overflow-x-auto whitespace-pre">
                              <code>{selectedRule.vulnerableYaml}</code>
                            </pre>
                          </div>

                          {/* Secured */}
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-success/5 border border-success/10">
                              <span className="text-[9px] font-bold text-success uppercase tracking-wider">Secured Blueprint</span>
                              <CheckCircle className="w-3 h-3 text-success" />
                            </div>
                            <pre className="p-3 rounded-xl bg-black border border-white/[0.04] text-success text-[11px] font-mono overflow-x-auto whitespace-pre">
                              <code>{selectedRule.securedYaml}</code>
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-12 border-t border-white/[0.06] bg-black text-center text-sm font-sans text-gray-500 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <p>© 2026 CI/CD Agent. Built for CI/CD Reliability Intelligence.</p>
        </div>
      </footer>
    </div>
  );
}
