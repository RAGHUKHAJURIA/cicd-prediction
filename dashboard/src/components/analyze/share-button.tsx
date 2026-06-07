import React, { useState } from "react";
import { Share2, Check } from "lucide-react";

export function ShareButton({ scanId }: { scanId: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/analyze?scanId=${scanId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      const el = document.createElement("textarea");
      el.value = shareUrl;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <>
      <button
        onClick={handleShare}
        className="flex items-center gap-2 h-8 px-3 rounded-md text-[13px] font-medium text-[#e6edf3] bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] transition-colors"
      >
        <Share2 className="w-3.5 h-3.5" />
        Share
      </button>

      {copied && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            background: "#161b22",
            border: "1px solid #3fb950",
            borderRadius: "8px",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            zIndex: 100,
            animation: "slideUpFade 300ms ease",
          }}
        >
          <Check className="w-4 h-4 text-[#3fb950]" />
          <span className="text-[13px] text-[#e6edf3]">Link copied to clipboard</span>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(100%); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </>
  );
}
