import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Analyze Repository — CI/CD Reliability",
  description:
    "Scan any GitHub or GitLab repository for CI/CD security, reliability, and performance issues in seconds.",
};

export default function AnalyzeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      <nav className="h-14 border-b border-[#30363d] px-6 flex items-center justify-between">
        {/* Left: Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#1f6feb]/10 border border-[#1f6feb]/20 flex items-center justify-center">
            <ShieldAlert className="w-4.5 h-4.5 text-[#58a6ff]" />
          </div>
          <span className="font-extrabold font-sans tracking-tight text-base text-white">
            Reliability.io
          </span>
        </Link>
        {/* Right: Back to dashboard */}
        <Link
          href="/repos"
          className="flex items-center gap-2 text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>
      </nav>
      <main>{children}</main>
    </div>
  );
}
