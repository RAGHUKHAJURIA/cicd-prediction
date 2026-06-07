import React, { useState, useEffect, useCallback } from "react";
import { GitBranch, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";

const GithubIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
);

const GitlabIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M22.646 11.132l-1.91-5.885c-.157-.481-.84-.481-.996 0l-1.396 4.298H5.656L4.26 5.247c-.157-.481-.84-.481-.996 0l-1.91 5.885c-.116.357-.015.753.256 1.002l10.39 8.243 10.39-8.243c.27-.249.37-.645.256-1.002z" />
  </svg>
);

function validateRepoUrl(url: string) {
  if (!url) return { valid: false, provider: null, owner: null, repo: null, error: null };
  const githubMatch = url.match(/https:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?\/?$/);
  if (githubMatch) return { valid: true, provider: "github", owner: githubMatch[1], repo: githubMatch[2], error: null };
  const gitlabMatch = url.match(/https:\/\/gitlab\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?\/?$/);
  if (gitlabMatch) return { valid: true, provider: "gitlab", owner: gitlabMatch[1], repo: gitlabMatch[2], error: null };
  return { valid: false, provider: null, owner: null, repo: null, error: "Invalid repository URL" };
}

export function URLInputHero({ flow }: { flow: any }) {
  const { state, submit } = flow;
  const [url, setUrl] = useState(state.input?.repoUrl || "");
  const [branch, setBranch] = useState(state.input?.branch || "main");
  const [token, setToken] = useState(state.input?.token || "");
  const [includeAI, setIncludeAI] = useState(state.input?.includeAI ?? true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [validation, setValidation] = useState(validateRepoUrl(url));

  useEffect(() => {
    const handler = setTimeout(() => {
      setValidation(validateRepoUrl(url));
    }, 300);
    return () => clearTimeout(handler);
  }, [url]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (validation.valid && state.phase !== "submitting") {
      submit({ repoUrl: url, branch, token, includeAI });
    }
  };

  const handleExampleClick = (exampleUrl: string) => {
    setUrl(exampleUrl);
    setValidation(validateRepoUrl(exampleUrl));
    document.getElementById("repo-url-input")?.focus();
  };

  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
      }}
    >
      <div style={{ maxWidth: "640px", textAlign: "center" }}>
        <div
          style={{
            display: "inline-block",
            background: "rgba(31,111,235,0.1)",
            border: "1px solid rgba(31,111,235,0.3)",
            color: "#58a6ff",
            fontSize: "12px",
            padding: "4px 12px",
            borderRadius: "20px",
          }}
        >
          ✦ Free · No signup required · 60 second analysis
        </div>
        <h1
          style={{
            fontSize: "clamp(28px, 4vw, 40px)",
            fontWeight: 500,
            color: "#e6edf3",
            marginTop: "16px",
            letterSpacing: "-0.5px",
          }}
        >
          Analyze your CI/CD pipeline
        </h1>
        <p style={{ fontSize: "16px", color: "#8b949e", lineHeight: 1.6, marginTop: "12px" }}>
          Paste a GitHub or GitLab repository URL. <br />
          Get security, reliability, and performance findings <br />
          with AI-powered fixes — in under 60 seconds.
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", marginTop: "24px" }}>
          {["🔒 Security scan", "⚡ Reliability check", "🤖 AI explanations", "🔧 Code patches"].map((pill) => (
            <span
              key={pill}
              style={{
                background: "#161b22",
                border: "1px solid #30363d",
                color: "#8b949e",
                fontSize: "12px",
                padding: "4px 10px",
                borderRadius: "20px",
              }}
            >
              {pill}
            </span>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: "580px", width: "100%", marginTop: "40px" }}>
        <form onSubmit={handleSubmit} style={{ position: "relative", height: "52px" }}>
          <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", zIndex: 10 }}>
            {validation.provider === "github" ? (
              <span className="text-[#e6edf3]"><GithubIcon /></span>
            ) : validation.provider === "gitlab" ? (
              <span className="text-[#fc6d26]"><GitlabIcon /></span>
            ) : (
              <GitBranch className="w-5 h-5 text-[#6e7681]" />
            )}
          </div>
          <input
            id="repo-url-input"
            type="text"
            placeholder="https://github.com/owner/repository"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{
              width: "100%",
              height: "52px",
              padding: "0 120px 0 44px",
              background: "#010409",
              border: `1px solid ${
                url && validation.valid
                  ? "rgba(63,185,80,0.5)"
                  : url && !validation.valid
                  ? "rgba(248,81,73,0.4)"
                  : "#30363d"
              }`,
              borderRadius: "8px",
              color: "#e6edf3",
              fontFamily: "monospace",
              fontSize: "14px",
              outline: "none",
              transition: "all 0.15s ease",
              boxShadow: "none",
            }}
            className="focus:border-[#1f6feb] focus:ring-4 focus:ring-[#1f6feb]/25"
          />
          <div style={{ position: "absolute", right: "110px", top: "50%", transform: "translateY(-50%)" }}>
            {url && validation.valid ? (
              <CheckCircle2 className="w-5 h-5 text-[#3fb950]" />
            ) : url && !validation.valid ? (
              <XCircle className="w-5 h-5 text-[#f85149]" />
            ) : null}
          </div>
          <button
            type="submit"
            disabled={!url || (!validation.valid && url !== "") || state.phase === "submitting"}
            style={{
              position: "absolute",
              right: "6px",
              top: "6px",
              height: "40px",
              padding: "0 18px",
              background: state.phase === "submitting" ? "#1f3d7a" : !validation.valid ? "#1f3d7a" : "#1f6feb",
              border: "none",
              borderRadius: "6px",
              color: "white",
              fontSize: "14px",
              fontWeight: 500,
              cursor: (!validation.valid || state.phase === "submitting") ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
            className="hover:bg-[#388bfd] disabled:opacity-80"
          >
            {state.phase === "submitting" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : state.phase === "error" ? (
              "Try again"
            ) : (
              "Analyze"
            )}
          </button>
        </form>

        <div style={{ marginTop: "8px" }}>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              fontSize: "12px",
              color: "#6e7681",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
            className="hover:text-[#8b949e]"
          >
            ⚙ Advanced options
          </button>

          {showAdvanced && (
            <div
              style={{
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: "6px",
                padding: "16px",
                marginTop: "8px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                animation: "fadeIn 200ms ease",
              }}
            >
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#8b949e", marginBottom: "4px" }}>
                  Branch
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  style={{
                    width: "100%",
                    height: "36px",
                    background: "#010409",
                    border: "1px solid #30363d",
                    borderRadius: "6px",
                    color: "#e6edf3",
                    padding: "0 12px",
                    fontFamily: "monospace",
                    fontSize: "13px",
                  }}
                  className="focus:outline-none focus:border-[#1f6feb] focus:ring-2 focus:ring-[#1f6feb]/25"
                />
              </div>
              <div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "12px",
                    color: "#8b949e",
                    marginBottom: "4px",
                  }}
                >
                  GitHub token (private repos)
                  <span title="A personal access token with 'repo' scope lets you scan private repositories. Never stored in our database.">
                    <AlertCircle className="w-3 h-3 text-[#6e7681]" />
                  </span>
                </label>
                <input
                  type="password"
                  id="token-input"
                  placeholder="ghp_xxxx"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  style={{
                    width: "100%",
                    height: "36px",
                    background: "#010409",
                    border: "1px solid #30363d",
                    borderRadius: "6px",
                    color: "#e6edf3",
                    padding: "0 12px",
                    fontFamily: "monospace",
                    fontSize: "13px",
                  }}
                  className="focus:outline-none focus:border-[#1f6feb] focus:ring-2 focus:ring-[#1f6feb]/25"
                />
              </div>
              <div style={{ gridColumn: "1 / -1", marginTop: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: "13px", color: "#e6edf3" }}>Include AI analysis</div>
                    <div style={{ fontSize: "12px", color: "#6e7681" }}>
                      Generates explanations and code patches using Claude AI. Adds ~15 seconds.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncludeAI(!includeAI)}
                    style={{
                      width: "40px",
                      height: "22px",
                      borderRadius: "11px",
                      background: includeAI ? "#1f6feb" : "#30363d",
                      position: "relative",
                      transition: "background 0.2s",
                      cursor: "pointer",
                      border: "none",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: "2px",
                        left: includeAI ? "20px" : "2px",
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        background: "white",
                        transition: "left 0.2s",
                      }}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {state.phase === "error" && state.error && (
          <div
            style={{
              background: "rgba(248,81,73,0.06)",
              border: "1px solid rgba(248,81,73,0.3)",
              borderRadius: "6px",
              padding: "12px 16px",
              marginTop: "12px",
              display: "flex",
              gap: "10px",
            }}
          >
            <AlertCircle className="w-5 h-5 text-[#f85149] shrink-0" />
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "14px", color: "#f85149" }}>{state.error}</span>
              {state.errorCode === "PRIVATE_REPO" ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowAdvanced(true);
                    setTimeout(() => document.getElementById("token-input")?.focus(), 50);
                  }}
                  className="text-sm font-medium text-[#f85149] hover:underline self-start"
                >
                  Add token ↑
                </button>
              ) : state.errorCode === "REPO_NOT_FOUND" ? (
                <button
                  type="button"
                  onClick={() => document.getElementById("repo-url-input")?.focus()}
                  className="text-sm font-medium text-[#f85149] hover:underline self-start"
                >
                  Check URL
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setUrl("")}
                  className="text-sm font-medium text-[#f85149] hover:underline self-start"
                >
                  Try a different URL
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <div style={{ fontSize: "12px", color: "#6e7681", marginBottom: "10px" }}>
            Try with a popular open-source repo:
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
            {[
              { name: "expressjs/express", url: "https://github.com/expressjs/express" },
              { name: "facebook/react", url: "https://github.com/facebook/react" },
              { name: "vercel/next.js", url: "https://github.com/vercel/next.js" },
            ].map((repo) => (
              <button
                key={repo.name}
                onClick={() => handleExampleClick(repo.url)}
                className="group flex items-center gap-2"
                style={{
                  background: "#161b22",
                  border: "1px solid #30363d",
                  borderRadius: "6px",
                  padding: "6px 14px",
                  fontSize: "13px",
                  color: "#8b949e",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <span className="text-[#6e7681] group-hover:text-[#58a6ff]"><GithubIcon /></span>
                {repo.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
