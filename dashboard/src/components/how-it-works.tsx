"use client";

import { useEffect, useState, useRef } from "react";
import { useScroll, useTransform, motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Key,
  DownloadCloud,
  FileCode,
  Cpu,
  Sparkles,
  ShieldCheck,
  LayoutDashboard,
  ClipboardCopy,
  Activity,
  Layers,
  FileJson,
  MessageSquare,
  GitBranch,
  GitPullRequest,
  CheckSquare,
  Settings,
  Send,
  Layout,
  Download,
  Edit,
  Wrench,
  PlusCircle,
  Play,
  Zap,
  AlertTriangle,
  Lock,
  X,
  ArrowRight,
  HelpCircle,
} from "lucide-react";

// Types
interface WorkflowNode {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<any>;
  x: number; // 0-1000 coordinate scale
  y: number; // 0-700 coordinate scale
  column: string;
  colorType: "user" | "platform" | "github" | "repo" | "vscode" | "api" | "actions";
}

interface ConnectionPath {
  from: string;
  to: string;
  d: string;
  stepIndex: number; // active step index that triggers the path flow highlight
}

// Configuration Data
const MODE1_NODES: WorkflowNode[] = [
  {
    id: "m1-n1",
    title: "Paste GitHub URL",
    subtitle: "github.com/owner/repo",
    description: "Paste any public or authorized private repository URL directly into the Antigravity dashboard to trigger a zero-config, immediate audit of your pipeline configurations.",
    icon: Globe,
    x: 780,
    y: 60,
    column: "User Interaction",
    colorType: "user",
  },
  {
    id: "m1-n2",
    title: "OAuth / PAT Auth",
    subtitle: "GitHub sign-in",
    description: "Authenticate securely using GitHub OAuth or a Personal Access Token to authorize access to repository files. Credentials are encrypted in transit and never stored.",
    icon: Key,
    x: 780,
    y: 160,
    column: "User Interaction",
    colorType: "user",
  },
  {
    id: "m1-n3",
    title: "Fetch CI/CD Files",
    subtitle: "GitHub Contents API",
    description: "Antigravity requests the workflow files from the GitHub Contents API, fetching Actions workflows, GitLab CI, CircleCI, Dockerfiles, and Kubernetes manifests.",
    icon: DownloadCloud,
    x: 220,
    y: 160,
    column: "Your Platform",
    colorType: "platform",
  },
  {
    id: "m1-n4",
    title: "Parse All Artifacts",
    subtitle: "YAML, Dockerfile, K8s",
    description: "Our syntax parser reads YAML and configurations, building a normalized abstract syntax tree (AST) to evaluate cross-file variables, triggers, and dependencies.",
    icon: FileCode,
    x: 220,
    y: 260,
    column: "Your Platform",
    colorType: "platform",
  },
  {
    id: "m1-n5",
    title: "Rule Engine",
    subtitle: "16 rules, risk score",
    description: "Analyzes configurations against 16 core rules (including unpinned versions, root execution privileges, write permissions, and injection risks) to calculate a weighted risk score.",
    icon: Cpu,
    x: 220,
    y: 360,
    column: "Your Platform",
    colorType: "platform",
  },
  {
    id: "m1-n6",
    title: "AI Analysis",
    subtitle: "Explain + generate patches",
    description: "Our pipeline-specialized LLM reviews warnings, translates cryptographic issues into human-readable risks, and drafts clean, secure configuration patches automatically.",
    icon: Sparkles,
    x: 220,
    y: 460,
    column: "Your Platform",
    colorType: "platform",
  },
  {
    id: "m1-n7",
    title: "Guardrail Validation",
    subtitle: "Re-run rules on patch",
    description: "To prevent broken patches, the engine compiles and parses the proposed configuration fixes back into the rules sandboxing engine, verifying no new risks are introduced.",
    icon: ShieldCheck,
    x: 220,
    y: 560,
    column: "Your Platform",
    colorType: "platform",
  },
  {
    id: "m1-n8",
    title: "Dashboard Results",
    subtitle: "Heatmap, findings, patches",
    description: "The dashboard displays the final pipeline audit grade, security hotspots, rule violations, and side-by-side git diffs comparing the original and secured code.",
    icon: LayoutDashboard,
    x: 780,
    y: 560,
    column: "User Interaction",
    colorType: "user",
  },
  {
    id: "m1-n9",
    title: "Copy Patch to Editor",
    subtitle: "User applies fix manually",
    description: "Click to copy the secure, validated patch directly to your clipboard. You can paste it into your local editor, commit, and push it to secure your workflows.",
    icon: ClipboardCopy,
    x: 780,
    y: 650,
    column: "User Interaction",
    colorType: "user",
  },
];

const MODE1_PATHS: ConnectionPath[] = [
  { from: "m1-n1", to: "m1-n2", d: "M 780 90 L 780 130", stepIndex: 0 },
  { from: "m1-n2", to: "m1-n3", d: "M 680 160 L 320 160", stepIndex: 1 },
  { from: "m1-n3", to: "m1-n4", d: "M 220 190 L 220 230", stepIndex: 2 },
  { from: "m1-n4", to: "m1-n5", d: "M 220 290 L 220 330", stepIndex: 3 },
  { from: "m1-n5", to: "m1-n6", d: "M 220 390 L 220 430", stepIndex: 4 },
  { from: "m1-n6", to: "m1-n7", d: "M 220 490 L 220 530", stepIndex: 5 },
  { from: "m1-n7", to: "m1-n8", d: "M 320 560 L 680 560", stepIndex: 6 },
  { from: "m1-n8", to: "m1-n9", d: "M 780 590 L 780 620", stepIndex: 7 },
];

const MODE2_NODES: WorkflowNode[] = [
  {
    id: "m2-n1",
    title: "git push",
    subtitle: "Developer pushes code",
    description: "A developer commits code changes and pushes them to any branch in their repository, serving as the automated trigger for the validation workflow.",
    icon: Activity,
    x: 220,
    y: 60,
    column: "GitHub",
    colorType: "github",
  },
  {
    id: "m2-n2",
    title: "Webhook received",
    subtitle: "HMAC verified, queued",
    description: "The Antigravity platform webhook listener receives the push payload. The webhook's cryptographic HMAC signature is validated, and a scan worker is queued.",
    icon: Lock,
    x: 500,
    y: 60,
    column: "Your Platform",
    colorType: "platform",
  },
  {
    id: "m2-n3",
    title: "Scan worker runs",
    subtitle: "Fetch, parse, cache",
    description: "A worker pulls the changes, extracts YAML workflow files, parses the structures into JSON schema trees, and caches clean files to speed up subsequent scans.",
    icon: DownloadCloud,
    x: 500,
    y: 160,
    column: "Your Platform",
    colorType: "platform",
  },
  {
    id: "m2-n4",
    title: "Analysis worker",
    subtitle: "Rules, risk score A-F",
    description: "The analysis worker evaluates rules, analyzes token scopes, checks dependencies against database advisories, and outputs a combined grade from A (excellent) to F (severe risks).",
    icon: Layers,
    x: 500,
    y: 260,
    column: "Your Platform",
    colorType: "platform",
  },
  {
    id: "m2-n5",
    title: "AI worker",
    subtitle: "Generate + validate patches",
    description: "An automated AI agent calculates repairs, secures token permissions (writes to read), locks workflow extensions to SHA commits, and compiles code changes.",
    icon: Cpu,
    x: 500,
    y: 360,
    column: "Your Platform",
    colorType: "platform",
  },
  {
    id: "m2-n6",
    title: "Patch committer",
    subtitle: "Build patch markdown file",
    description: "Prepares a formal commit containing the corrected workflow files and compiles an detailed markdown report detailing which vulnerabilities have been solved.",
    icon: FileJson,
    x: 500,
    y: 460,
    column: "Your Platform",
    colorType: "platform",
  },
  {
    id: "m2-n7",
    title: "PR comment posted",
    subtitle: "Findings + check run",
    description: "Publishes the status check result (Pass/Fail) and comments directly on the pull request with a complete breakdown of the findings, grades, and code improvements.",
    icon: MessageSquare,
    x: 500,
    y: 565,
    column: "Your Platform",
    colorType: "platform",
  },
  {
    id: "m2-n8",
    title: "New branch created",
    subtitle: "cicd-reliability/fixes-*",
    description: "Pushes the validated code fixes to an isolated branch in the user's repository, following the naming prefix 'cicd-reliability/fixes-*'.",
    icon: GitBranch,
    x: 780,
    y: 460,
    column: "User's Repo",
    colorType: "repo",
  },
  {
    id: "m2-n9",
    title: "PR auto-opened",
    subtitle: "Patch file + explanation",
    description: "Opens a pull request from the fixes branch to the developer's working branch. The PR includes detailed diff comparisons, safety rationale, and impact analysis.",
    icon: GitPullRequest,
    x: 780,
    y: 565,
    column: "User's Repo",
    colorType: "repo",
  },
  {
    id: "m2-n10",
    title: "Dev reviews PR",
    subtitle: "Merge or edit fixes",
    description: "The repository administrator or developer reviews the automated pull request, inspects the safe, green checkmarks, and merges the security patches with a single click.",
    icon: CheckSquare,
    x: 780,
    y: 660,
    column: "User's Repo",
    colorType: "repo",
  },
];

const MODE2_PATHS: ConnectionPath[] = [
  { from: "m2-n1", to: "m2-n2", d: "M 320 60 L 400 60", stepIndex: 0 },
  { from: "m2-n2", to: "m2-n3", d: "M 500 90 L 500 130", stepIndex: 1 },
  { from: "m2-n3", to: "m2-n4", d: "M 500 190 L 500 230", stepIndex: 2 },
  { from: "m2-n4", to: "m2-n5", d: "M 500 290 L 500 330", stepIndex: 3 },
  { from: "m2-n5", to: "m2-n6", d: "M 500 390 L 500 430", stepIndex: 4 },
  { from: "m2-n6", to: "m2-n8", d: "M 600 460 L 680 460", stepIndex: 5 },
  { from: "m2-n8", to: "m2-n9", d: "M 780 490 L 780 535", stepIndex: 6 },
  { from: "m2-n6", to: "m2-n7", d: "M 500 490 L 500 535", stepIndex: 7 },
  { from: "m2-n7", to: "m2-n9", d: "M 600 565 L 680 565", stepIndex: 8 },
  { from: "m2-n9", to: "m2-n10", d: "M 780 595 L 780 630", stepIndex: 9 },
];

const MODE3_NODES: WorkflowNode[] = [
  {
    id: "m3-n1",
    title: "Install extension",
    subtitle: "VS Code Marketplace",
    description: "Install the official Antigravity IDE extension to shift security testing left, identifying vulnerabilities directly within the workspace.",
    icon: Settings,
    x: 220,
    y: 60,
    column: "VS Code Extension",
    colorType: "vscode",
  },
  {
    id: "m3-n2",
    title: "Enter API token",
    subtitle: "Once in settings",
    description: "Paste your user access token into the extension configuration settings to establish a secure link to the scanning API backend.",
    icon: Key,
    x: 220,
    y: 150,
    column: "VS Code Extension",
    colorType: "vscode",
  },
  {
    id: "m3-n3",
    title: "Open workflow file",
    subtitle: "Auto-scan on open/save",
    description: "The extension monitors active buffers. Whenever a YAML configuration file in '.github/workflows/' is opened or saved, an analysis query is initiated.",
    icon: FileCode,
    x: 220,
    y: 240,
    column: "VS Code Extension",
    colorType: "vscode",
  },
  {
    id: "m3-n4",
    title: "POST /api/v1/scan",
    subtitle: "File content + token",
    description: "Transmits the local text content securely to the API endpoint, where rules are run against the configuration block without storing your files.",
    icon: Send,
    x: 500,
    y: 240,
    column: "Shared API",
    colorType: "api",
  },
  {
    id: "m3-n5",
    title: "Sidebar panel",
    subtitle: "Risk grade & reports",
    description: "Renders a full dashboard inside the VS Code sidebar containing live score ratings, step-by-step summaries of findings, and educational explanations.",
    icon: Layout,
    x: 780,
    y: 240,
    column: "VS Code Extension",
    colorType: "vscode",
  },
  {
    id: "m3-n6",
    title: "Findings returned",
    subtitle: "JSON rule results",
    description: "The API queries finish and reply with a structured list of diagnostics detailing the lines, columns, severity, and suggested patch corrections.",
    icon: Download,
    x: 500,
    y: 330,
    column: "Shared API",
    colorType: "api",
  },
  {
    id: "m3-n7",
    title: "Inline squiggles",
    subtitle: "Squiggly underline + hover",
    description: "Highlights vulnerable segments (e.g. unpinned dependencies) directly in your editor. Hovering displays the risk context and triggers quick-fix popups.",
    icon: Edit,
    x: 220,
    y: 330,
    column: "VS Code Extension",
    colorType: "vscode",
  },
  {
    id: "m3-n8",
    title: "Apply fix in editor",
    subtitle: "One-click patch applied",
    description: "Clicking the 'Quick Fix' option replaces the insecure configuration line with the secured, SHA-pinned action block directly inside the active editor tab.",
    icon: Wrench,
    x: 220,
    y: 420,
    column: "VS Code Extension",
    colorType: "vscode",
  },
  {
    id: "m3-n9",
    title: "Add step to workflow",
    subtitle: "uses: your-org/cicd-action",
    description: "Integrate the Antigravity Actions runner step into your pull request actions to automatically block vulnerabilities from being merged.",
    icon: PlusCircle,
    x: 780,
    y: 420,
    column: "GitHub Actions CI",
    colorType: "actions",
  },
  {
    id: "m3-n10",
    title: "PR opened / push",
    subtitle: "Workflow runs in CI",
    description: "Whenever code is pushed or a pull request is submitted, the GitHub runner spins up and calls the Antigravity step automatically.",
    icon: Play,
    x: 780,
    y: 510,
    column: "GitHub Actions CI",
    colorType: "actions",
  },
  {
    id: "m3-n11",
    title: "Action calls API",
    subtitle: "POST scan & poll",
    description: "The Actions environment posts files to the scanning API, polling for analysis results to ensure fast execution feedback.",
    icon: Zap,
    x: 500,
    y: 510,
    column: "Shared API",
    colorType: "api",
  },
  {
    id: "m3-n12",
    title: "Results posted",
    subtitle: "Check pass/fail, gate merge",
    description: "Publishes results to GitHub checks. If the configuration triggers a failing grade (e.g. Grade F), the check fails, successfully blocking the PR from being merged until resolved.",
    icon: AlertTriangle,
    x: 780,
    y: 600,
    column: "GitHub Actions CI",
    colorType: "actions",
  },
];

const MODE3_PATHS: ConnectionPath[] = [
  { from: "m3-n1", to: "m3-n2", d: "M 220 90 L 220 120", stepIndex: 0 },
  { from: "m3-n2", to: "m3-n3", d: "M 220 180 L 220 210", stepIndex: 1 },
  { from: "m3-n3", to: "m3-n4", d: "M 320 240 L 400 240", stepIndex: 2 },
  { from: "m3-n4", to: "m3-n5", d: "M 600 240 L 680 240", stepIndex: 3 },
  { from: "m3-n4", to: "m3-n6", d: "M 500 270 L 500 300", stepIndex: 4 },
  { from: "m3-n6", to: "m3-n7", d: "M 400 330 L 320 330", stepIndex: 5 },
  { from: "m3-n7", to: "m3-n8", d: "M 220 360 L 220 390", stepIndex: 6 },
  { from: "m3-n9", to: "m3-n10", d: "M 780 450 L 780 480", stepIndex: 8 },
  { from: "m3-n10", to: "m3-n11", d: "M 680 510 L 600 510", stepIndex: 9 },
  { from: "m3-n11", to: "m3-n12", d: "M 600 510 L 640 510 L 640 600 L 680 600", stepIndex: 10 },
];

export function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Tab/Mode selection state
  const [activeMode, setActiveMode] = useState<1 | 2 | 3>(1);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);

  // Responsiveness states for scaling down diagrams to prevent overflow
  const [scale, setScale] = useState(1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isStickyDisabled, setIsStickyDisabled] = useState(false);

  // Track height to conditionally disable sticky pinning
  useEffect(() => {
    const checkHeight = () => {
      setIsStickyDisabled(window.innerHeight < 800);
    };
    checkHeight();
    window.addEventListener("resize", checkHeight);
    return () => window.removeEventListener("resize", checkHeight);
  }, []);

  // Track wrapper dimensions dynamically and compute diagram scale (designed for 1000px width)
  useEffect(() => {
    if (!wrapperRef.current) return;
    const updateScale = () => {
      if (wrapperRef.current) {
        const width = wrapperRef.current.getBoundingClientRect().width;
        if (width > 0) {
          setScale(width / 1000);
        }
      }
    };

    updateScale();

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => {
        updateScale();
      });
      resizeObserver.observe(wrapperRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  // Close explanation modal when switching modes
  useEffect(() => {
    setSelectedNode(null);
  }, [activeMode]);

  // Auto-play animation steps for each diagram
  const [m1Step, setM1Step] = useState(0);
  const [m2Step, setM2Step] = useState(0);
  const [m3Step, setM3Step] = useState(0);

  // Scroll Progress calculations for left timeline
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const dotY = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  // Detect scroll milestones to set activeMode tab indicator automatically
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      if (window.innerWidth < 1024) return; // Only scroll-sync on desktop

      const rect = containerRef.current.getBoundingClientRect();
      const sectionHeight = rect.height;
      const scrollableHeight = sectionHeight - window.innerHeight;
      if (scrollableHeight <= 0) return;

      const relativeScroll = -rect.top / scrollableHeight;

      if (relativeScroll < 0.33) {
        setActiveMode(1);
      } else if (relativeScroll >= 0.33 && relativeScroll < 0.66) {
        setActiveMode(2);
      } else {
        setActiveMode(3);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Interval-driven node highlight updates (pauses when user is hovering over diagram)
  useEffect(() => {
    if (isHovered) return;

    const m1Timer = setInterval(() => {
      setM1Step((prev) => (prev + 1) % MODE1_NODES.length);
    }, 1200);

    const m2Timer = setInterval(() => {
      // Custom route index mapping to simulate the branch forks
      const m2Seq = [0, 1, 2, 3, 4, 5, 7, 6, 8, 9];
      setM2Step((prev) => {
        const nextIdx = (m2Seq.indexOf(prev) + 1) % m2Seq.length;
        return m2Seq[nextIdx];
      });
    }, 1200);

    const m3Timer = setInterval(() => {
      // Loop sequence through extension, then action modes
      const m3Seq = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      setM3Step((prev) => {
        const nextIdx = (m3Seq.indexOf(prev) + 1) % m3Seq.length;
        return m3Seq[nextIdx];
      });
    }, 1200);

    return () => {
      clearInterval(m1Timer);
      clearInterval(m2Timer);
      clearInterval(m3Timer);
    };
  }, [isHovered]);

  // Mode helpers
  const getModeData = (mode: 1 | 2 | 3) => {
    switch (mode) {
      case 1:
        return {
          nodes: MODE1_NODES,
          paths: MODE1_PATHS,
          currentStep: m1Step,
          title: "Mode 1: Web App (Manual Auditing)",
          desc: "Best for audits on third-party repos or one-off health checks. Paste a URL, sign in, get verified findings, and manually copy patches to secure configurations.",
        };
      case 2:
        return {
          nodes: MODE2_NODES,
          paths: MODE2_PATHS,
          currentStep: m2Step,
          title: "Mode 2: GitHub App (Fully Automated)",
          desc: "Set and forget. A native GitHub integration that runs automatically on every commit, checks workflows, and generates ready-to-merge PRs containing verified fixes.",
        };
      case 3:
        return {
          nodes: MODE3_NODES,
          paths: MODE3_PATHS,
          currentStep: m3Step,
          title: "Mode 3: VS Code + Actions (Dev CI Integration)",
          desc: "Shift security left. Real-time diagnostic underlines in your editor coupled with gated merge checks in your CI environment to block code flaws from reaching main.",
        };
    }
  };

  const currentModeData = getModeData(activeMode);

  // Node Color Utilities
  const getColorClasses = (
    colorType: WorkflowNode["colorType"],
    isActive: boolean
  ) => {
    if (isActive) {
      switch (colorType) {
        case "user":
          return "border-cyber shadow-glow-blue bg-blue-500/10 text-white";
        case "platform":
          return "border-success shadow-glow-green bg-success/15 text-white";
        case "github":
          return "border-slate-500 shadow-xl bg-slate-800 text-white";
        case "repo":
          return "border-high shadow-glow-orange bg-orange-500/10 text-white";
        case "vscode":
          return "border-cyber shadow-glow-blue bg-blue-500/10 text-white";
        case "api":
          return "border-success shadow-glow-green bg-success/15 text-white";
        case "actions":
          return "border-high shadow-glow-orange bg-orange-500/10 text-white";
      }
    }

    // Default Inactive Styles
    switch (colorType) {
      case "user":
        return "border-white/[0.06] hover:border-blue-500/30 bg-surface-mid/80 text-gray-300";
      case "platform":
        return "border-white/[0.06] hover:border-success/30 bg-surface-mid/80 text-gray-300";
      case "github":
        return "border-white/[0.06] hover:border-slate-500/30 bg-surface-mid/80 text-gray-300";
      case "repo":
        return "border-white/[0.06] hover:border-orange-500/30 bg-surface-mid/80 text-gray-300";
      case "vscode":
        return "border-white/[0.06] hover:border-blue-500/30 bg-surface-mid/80 text-gray-300";
      case "api":
        return "border-white/[0.06] hover:border-success/30 bg-surface-mid/80 text-gray-300";
      case "actions":
        return "border-white/[0.06] hover:border-orange-500/30 bg-surface-mid/80 text-gray-300";
    }
  };

  return (
    <section
      ref={containerRef}
      className={`relative ${isStickyDisabled ? "h-auto" : "lg:h-[300vh]"} h-auto bg-black border-t border-white/[0.06] z-10`}
      id="how-it-works-section"
    >
      {/* Self-contained CSS Animations */}
      <style jsx global>{`
        @keyframes dash-flow {
          to {
            stroke-dashoffset: -24;
          }
        }
        .animate-dash-flow {
          stroke-dasharray: 6, 6;
          animation: dash-flow 0.35s linear infinite;
        }
      `}</style>

      <div className={`w-full py-16 lg:py-0 ${
        isStickyDisabled
          ? "relative flex flex-col justify-start"
          : "lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col lg:justify-center"
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full lg:-mt-6">
        {/* Header Title */}
        <div className="text-center mb-8 lg:mb-6 relative">
          <h2 className="text-4xl md:text-5xl font-sans font-black tracking-tighter mb-4 text-white">
            How It Works
          </h2>
          <p className="text-gray-400 font-sans font-medium text-lg max-w-xl mx-auto">
            Choose the mode that fits your development workflow and audit infrastructure.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 relative items-start">
          
          {/* LEFT: Scroll-linked Timeline Sidebar (Desktop only) */}
          <div className="hidden lg:flex lg:col-span-3 flex-col gap-6 sticky top-36">
            <div className="relative pl-8">
              {/* Vertical line track */}
              <div className="absolute left-[13px] top-4 bottom-4 w-px bg-white/[0.06]" />
              
              {/* Scrolling Indicator Dot */}
              <motion.div
                className="absolute left-[9px] w-2.5 h-2.5 rounded-full bg-success shadow-[0_0_12px_rgba(63,185,80,0.8)] z-10"
                style={{ top: dotY }}
              />

              {/* Mode Selectors linked to scroll milestones */}
              <div className="flex flex-col gap-10">
                {[
                  { id: 1, label: "Mode 1: Web App", desc: "One-off audits via URL scan" },
                  { id: 2, label: "Mode 2: GitHub App", desc: "Automated checks + PR fixes" },
                  { id: 3, label: "Mode 3: Dev CI / IDE", desc: "Real-time extension & gating" },
                ].map((m) => {
                  const isSelected = activeMode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setActiveMode(m.id as 1 | 2 | 3);
                        if (!isStickyDisabled) {
                          // Scroll user exactly to the center of the scroll range for this mode
                          const element = document.getElementById("how-it-works-section");
                          if (element) {
                            const rect = element.getBoundingClientRect();
                            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                            let p = 0.16;
                            if (m.id === 2) p = 0.50;
                            if (m.id === 3) p = 0.83;
                            
                            window.scrollTo({
                              top: rect.top + scrollTop + p * (rect.height - window.innerHeight),
                              behavior: "smooth",
                            });
                          }
                        }
                      }}
                      className="text-left group outline-none"
                    >
                      <div className="flex items-center gap-4">
                        {/* Dot indicator */}
                        <div
                          className={`w-3.5 h-3.5 rounded-full border-2 bg-black shrink-0 transition-all duration-300 ${
                            isSelected
                              ? "border-success scale-110 shadow-[0_0_8px_rgba(63,185,80,0.5)]"
                              : "border-white/10 group-hover:border-white/30"
                          }`}
                        />
                        <div>
                          <h4
                            className={`font-sans font-bold text-sm transition-colors duration-300 ${
                              isSelected ? "text-success" : "text-gray-500 group-hover:text-gray-300"
                            }`}
                          >
                            {m.label}
                          </h4>
                          <p className="text-[11px] font-medium text-gray-500 leading-normal mt-0.5">
                            {m.desc}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: Selected Mode Box Display (Main Content Canvas) */}
          <div className="lg:col-span-9 flex flex-col gap-6">
            
            {/* Mobile Tab buttons (hidden on desktop) */}
            <div className="lg:hidden flex bg-white/[0.02] border border-white/[0.08] p-1 rounded-xl mb-4">
              {[
                { id: 1, label: "Web App" },
                { id: 2, label: "GitHub App" },
                { id: 3, label: "VS Code / CI" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveMode(tab.id as 1 | 2 | 3)}
                  className={`flex-1 py-2 text-xs font-bold font-sans rounded-lg transition-all duration-200 ${
                    activeMode === tab.id
                      ? "bg-success text-white shadow-glow-green"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Mode Container Card */}
            <div 
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className="bg-charcoal border border-white/[0.06] rounded-2xl p-6 lg:p-5 relative overflow-hidden shadow-2xl flex flex-col lg:min-h-[500px] min-h-[640px]"
            >
              
              {/* Decorative glows */}
              <div className="absolute top-0 right-0 w-80 h-80 bg-success/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-80 h-80 bg-cyber/5 rounded-full blur-3xl pointer-events-none" />

              {/* Mode Header */}
              <div className="mb-4 border-b border-white/[0.06] pb-2 relative z-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-black font-sans text-white mb-2 tracking-tight">
                      {currentModeData.title}
                    </h3>
                    <p className="text-gray-400 font-sans text-sm font-medium leading-relaxed max-w-3xl">
                      {currentModeData.desc}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.08] text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    <span>Auto-Play Sequence</span>
                  </div>
                </div>
              </div>

              {/* Grid Canvas Wrapper for diagrams */}
              <div className="flex-1 relative flex items-center justify-center min-h-[460px] w-full">
                
                {/* 1. DESKTOP DIAGRAM VIEW (using absolute percentage positioning + SVG overlays) */}
                <div 
                  ref={wrapperRef}
                  className="hidden md:block w-full max-w-[700px] aspect-[1000/700] relative bg-white/[0.01] border border-white/[0.04] rounded-xl overflow-hidden bg-[radial-gradient(#ffffff04_1px,transparent_1px)] [background-size:16px_16px] mx-auto"
                >
                  <div
                    style={{
                      width: "1000px",
                      height: "700px",
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                      position: "absolute",
                      left: "0",
                      top: "0",
                    }}
                  >
                    {/* SVG Connectors Layer */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 700">
                      <defs>
                        <marker
                          id="arrow"
                          viewBox="0 0 10 10"
                          refX="6"
                          refY="5"
                          markerWidth="6"
                          markerHeight="6"
                          orient="auto-start-reverse"
                        >
                          <path d="M 0 2 L 10 5 L 0 8 z" fill="rgba(255,255,255,0.15)" />
                        </marker>
                        <marker
                          id="arrow-active-blue"
                          viewBox="0 0 10 10"
                          refX="6"
                          refY="5"
                          markerWidth="7"
                          markerHeight="7"
                          orient="auto-start-reverse"
                        >
                          <path d="M 0 2 L 10 5 L 0 8 z" fill="#3B82F6" />
                        </marker>
                        <marker
                          id="arrow-active-green"
                          viewBox="0 0 10 10"
                          refX="6"
                          refY="5"
                          markerWidth="7"
                          markerHeight="7"
                          orient="auto-start-reverse"
                        >
                          <path d="M 0 2 L 10 5 L 0 8 z" fill="#3fb950" />
                        </marker>
                      </defs>

                      {/* Render connection lines */}
                      {currentModeData.paths.map((p, idx) => {
                        const isActive = currentModeData.currentStep === p.stepIndex;
                        const markerColor = activeMode === 2 || activeMode === 3 ? "arrow-active-green" : "arrow-active-blue";
                        
                        return (
                          <g key={idx}>
                            {/* Base line */}
                            <path
                              d={p.d}
                              fill="none"
                              stroke="rgba(255,255,255,0.06)"
                              strokeWidth="2.5"
                              markerEnd="url(#arrow)"
                            />
                            {/* Animated flow path with smooth cross-fade transition */}
                            <path
                              d={p.d}
                              fill="none"
                              stroke={activeMode === 2 || activeMode === 3 ? "#3fb950" : "#3B82F6"}
                              strokeWidth="3.5"
                              markerEnd={`url(#${markerColor})`}
                              className={`transition-opacity duration-300 ${isActive ? "animate-dash-flow opacity-100" : "opacity-0"}`}
                              style={{
                                filter: `drop-shadow(0 0 6px ${activeMode === 2 || activeMode === 3 ? "rgba(63,185,80,0.5)" : "rgba(59,130,246,0.5)"})`,
                              }}
                            />
                          </g>
                        );
                      })}
                    </svg>

                    {/* Render node blocks absolutely inside canvas */}
                    {currentModeData.nodes.map((node, idx) => {
                      const isActive = currentModeData.currentStep === idx;
                      const NodeIcon = node.icon;
                      
                      // Coordinates scaled to width % and height %
                      const leftPercent = `${(node.x / 1000) * 100}%`;
                      const topPercent = `${(node.y / 700) * 100}%`;

                      return (
                        <motion.button
                          key={node.id}
                          onClick={() => setSelectedNode(node)}
                          style={{
                            left: leftPercent,
                            top: topPercent,
                            x: "-50%",
                            y: "-50%",
                            width: "160px",
                            height: "46px",
                          }}
                          className={`absolute rounded-xl border flex items-center px-3 gap-2 cursor-pointer text-left transition-[border-color,background-color,box-shadow] duration-300 z-20 overflow-hidden outline-none ${getColorClasses(
                            node.colorType,
                            isActive
                          )}`}
                          animate={{
                            scale: isActive ? 1.05 : 1,
                          }}
                          whileHover={{ scale: isActive ? 1.07 : 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        >
                          <div
                            className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center bg-white/[0.04] border border-white/[0.08] ${
                              isActive ? "animate-pulse" : ""
                            }`}
                          >
                            <NodeIcon
                              className={`w-3 h-3 ${
                                isActive
                                  ? node.colorType === "platform" ||
                                    node.colorType === "api"
                                    ? "text-success"
                                    : node.colorType === "user" ||
                                      node.colorType === "vscode"
                                    ? "text-cyber"
                                    : "text-orange-500"
                                  : "text-gray-400"
                              }`}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-sans font-bold text-[10px] truncate leading-tight">
                              {node.title}
                            </h4>
                            <span className="font-mono text-[7.5px] text-gray-500 block truncate mt-0.5 font-medium">
                              {node.subtitle}
                            </span>
                          </div>
                          {/* Glow point indicator matching active theme color */}
                          {isActive && (
                            <span 
                              className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full animate-ping ${
                                node.colorType === "user" || node.colorType === "vscode"
                                  ? "bg-blue-500"
                                  : node.colorType === "platform" || node.colorType === "api"
                                  ? "bg-success"
                                  : "bg-orange-500"
                              }`} 
                            />
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. MOBILE DIAGRAM VIEW (Interactive Vertical Accordion) */}
                <div className="md:hidden w-full flex flex-col gap-3 relative z-10">
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wide mb-2 text-center">
                    Tap nodes to expand details
                  </div>
                  {currentModeData.nodes.map((node, idx) => {
                    const isActive = currentModeData.currentStep === idx;
                    const NodeIcon = node.icon;
                    return (
                      <button
                        key={node.id}
                        onClick={() => setSelectedNode(node)}
                        className={`w-full rounded-xl border p-4 flex items-center gap-4 text-left transition-all duration-200 outline-none ${getColorClasses(
                          node.colorType,
                          isActive
                        )}`}
                      >
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/[0.04] border border-white/[0.08] shrink-0">
                          <NodeIcon className="w-5 h-5 text-gray-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">
                              Step {idx + 1}
                            </span>
                            {isActive && (
                              <span className="text-[9px] font-bold text-success flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-success animate-ping" />
                                Active
                              </span>
                            )}
                          </div>
                          <h4 className="font-sans font-black text-sm text-white mt-0.5">
                            {node.title}
                          </h4>
                          <p className="font-mono text-[10px] text-gray-400 mt-0.5 truncate">
                            {node.subtitle}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-600 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* NODE DETAILS MODAL */}
      <AnimatePresence>
        {selectedNode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedNode(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative w-full max-w-lg bg-[#0F0F12] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl z-10"
            >
              {/* Top gradient stripe */}
              <div
                className={`h-1.5 w-full bg-gradient-to-r ${
                  selectedNode.colorType === "user" || selectedNode.colorType === "vscode"
                    ? "from-blue-500 to-[#1f6feb]"
                    : selectedNode.colorType === "platform" || selectedNode.colorType === "api"
                    ? "from-success to-[#2ea043]"
                    : "from-orange-500 to-[#ea580c]"
                }`}
              />

              <div className="p-6 md:p-8">
                {/* Header */}
                <div className="flex items-start justify-between gap-6 mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                      {(() => {
                        const Icon = selectedNode.icon;
                        return <Icon className="w-6 h-6 text-white" />;
                      })()}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
                        {selectedNode.column} Boundary
                      </span>
                      <h3 className="text-xl font-sans font-black text-white mt-0.5 tracking-tight">
                        {selectedNode.title}
                      </h3>
                    </div>
                  </div>
                  
                  {/* Close button */}
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors outline-none"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body Content */}
                <div className="space-y-6">
                  <div>
                    <h5 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                      Description
                    </h5>
                    <p className="text-gray-300 font-sans text-sm leading-relaxed">
                      {selectedNode.description}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/[0.06]">
                    <div>
                      <h5 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Node Target
                      </h5>
                      <span className="font-mono text-xs text-success bg-success/5 border border-success/15 px-2 py-1 rounded block truncate font-semibold">
                        {selectedNode.subtitle}
                      </span>
                    </div>
                    <div>
                      <h5 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Execution Context
                      </h5>
                      <span className="font-mono text-xs text-gray-400 bg-white/[0.03] border border-white/[0.06] px-2 py-1 rounded block truncate font-medium">
                        {selectedNode.colorType.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="mt-8 pt-6 border-t border-white/[0.06] flex justify-end">
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="px-5 py-2.5 rounded-xl font-sans font-bold text-xs text-white bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all duration-200"
                  >
                    Close Explanation
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
