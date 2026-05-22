"use client";

import React, { useState, useRef, useEffect } from "react";
import { Copy, Download, Check, ChevronDown, Sparkles } from "lucide-react";

interface CopyPatchButtonProps {
  filePath: string;
  beforeCode: string;
  afterCode: string;
  instructions?: string;
}

export function CopyPatchButton({
  filePath,
  beforeCode,
  afterCode,
  instructions,
}: CopyPatchButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedType, setCopiedType] = useState<"code" | "diff" | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(afterCode);
      setCopiedType("code");
      setIsOpen(false);
      setTimeout(() => setCopiedType(null), 2000);
    } catch (err) {
      console.error("Failed to copy code: ", err);
    }
  };

  const handleCopyDiff = async () => {
    try {
      // Basic unified diff reconstruction
      const diffHeader = `--- a/${filePath}\n+++ b/${filePath}\n`;
      const diffContent = `@@ -1,1 +1,1 @@\n- ${beforeCode.replace(/\n/g, "\n- ")}\n+ ${afterCode.replace(/\n/g, "\n+ ")}`;
      const diffText = diffHeader + diffContent;
      
      await navigator.clipboard.writeText(diffText);
      setCopiedType("diff");
      setIsOpen(false);
      setTimeout(() => setCopiedType(null), 2000);
    } catch (err) {
      console.error("Failed to copy diff: ", err);
    }
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([afterCode], { type: "text/yaml;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filePath.split("/").pop() || "remediation.yml");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to download file: ", err);
    }
  };

  return (
    <div className="relative inline-flex" ref={dropdownRef}>
      {/* Primary Trigger Button */}
      <button
        onClick={handleCopyCode}
        className="inline-flex items-center px-4 py-2 bg-success text-white hover:bg-success/90 rounded-l-xl text-xs font-semibold shadow-sm transition-all focus:outline-none"
      >
        {copiedType === "code" ? (
          <>
            <Check className="h-3.5 w-3.5 mr-1.5 animate-scaleUp" />
            Copied Code!
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy Fix
          </>
        )}
      </button>

      {/* Dropdown Arrow Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center px-2.5 py-2 bg-success border-l border-success-hover text-white hover:bg-success/90 rounded-r-xl text-xs font-semibold focus:outline-none transition-all"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown List */}
      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 w-52 bg-canvas border border-white/[0.08] rounded-2xl shadow-xl z-50 overflow-hidden backdrop-blur-xl animate-scaleUp">
          <div className="py-1">
            <button
              onClick={handleCopyCode}
              className="w-full flex items-center px-4 py-2.5 text-xs text-fg hover:bg-white/[0.04] transition-colors text-left"
            >
              <Copy className="h-3.5 w-3.5 mr-2 text-fg-subtle" />
              Copy corrected code
            </button>

            <button
              onClick={handleCopyDiff}
              className="w-full flex items-center px-4 py-2.5 text-xs text-fg hover:bg-white/[0.04] transition-colors text-left"
            >
              {copiedType === "diff" ? (
                <Check className="h-3.5 w-3.5 mr-2 text-success" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-2 text-accent" />
              )}
              Copy patch diff
            </button>

            <div className="border-t border-white/[0.06] my-1" />

            <button
              onClick={handleDownload}
              className="w-full flex items-center px-4 py-2.5 text-xs text-fg hover:bg-white/[0.04] transition-colors text-left"
            >
              <Download className="h-3.5 w-3.5 mr-2 text-fg-subtle" />
              Download corrected file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
