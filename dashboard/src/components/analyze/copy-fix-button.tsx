import React, { useState } from "react";
import { Copy, Check, ChevronDown, FileDiff, Download } from "lucide-react";

export function CopyFixButton({
  patch,
  ruleId,
  fileName = "file",
}: {
  patch: { before: string; after: string; language: string };
  ruleId: string;
  fileName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      return true;
    }
  };

  const handleCopyMain = async () => {
    await copyToClipboard(patch.after);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCopyDiff = async () => {
    const diff = `--- a/${fileName}\n+++ b/${fileName}\n@@ -1 +1 @@\n${patch.before
      .split("\n")
      .map((l) => `-${l}`)
      .join("\n")}\n${patch.after
      .split("\n")
      .map((l) => `+${l}`)
      .join("\n")}`;
    await copyToClipboard(diff);
    setMenuOpen(false);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownloadPatch = () => {
    const diff = `--- a/${fileName}\n+++ b/${fileName}\n@@ -1 +1 @@\n${patch.before
      .split("\n")
      .map((l) => `-${l}`)
      .join("\n")}\n${patch.after
      .split("\n")
      .map((l) => `+${l}`)
      .join("\n")}`;
    const blob = new Blob([diff], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ruleId}.patch`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  return (
    <div className="flex w-full mt-3 relative">
      <button
        onClick={handleCopyMain}
        className="flex-1 flex items-center justify-center gap-2 h-9 px-4 rounded-l-md text-[13px] font-medium transition-colors"
        style={{
          background: "rgba(63,185,80,0.1)",
          border: "1px solid rgba(63,185,80,0.3)",
          borderRight: "none",
          color: "#3fb950",
        }}
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            Copy fix
          </>
        )}
      </button>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="w-9 h-9 flex items-center justify-center rounded-r-md transition-colors"
        style={{
          background: "rgba(63,185,80,0.1)",
          border: "1px solid rgba(63,185,80,0.3)",
          borderLeft: "1px solid rgba(63,185,80,0.2)",
          color: "#3fb950",
        }}
      >
        <ChevronDown className="w-4 h-4" />
      </button>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="absolute top-10 right-0 z-50 py-1 rounded-md shadow-2xl min-w-[200px]"
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <button
              onClick={() => {
                handleCopyMain();
                setMenuOpen(false);
              }}
              className="w-full text-left px-4 py-2 flex items-center gap-2 text-[13px] text-[#e6edf3] hover:bg-white/5"
            >
              <Copy className="w-4 h-4 text-[#8b949e]" /> Copy fixed code only
            </button>
            <button
              onClick={handleCopyDiff}
              className="w-full text-left px-4 py-2 flex items-center gap-2 text-[13px] text-[#e6edf3] hover:bg-white/5"
            >
              <FileDiff className="w-4 h-4 text-[#8b949e]" /> Copy as unified diff
            </button>
            <button
              onClick={handleDownloadPatch}
              className="w-full text-left px-4 py-2 flex items-center gap-2 text-[13px] text-[#e6edf3] hover:bg-white/5"
            >
              <Download className="w-4 h-4 text-[#8b949e]" /> Download .patch file
            </button>
          </div>
        </>
      )}
    </div>
  );
}
