/**
 * @file index.ts
 * @description Central router for all CI/CD format parsers.
 */

import * as jsyaml from "js-yaml";
import { NormalizedWorkflow, ParseResult, DiagnosticSeverity } from "../models/workflow.model";
import { parseGithubActions } from "./github-actions.parser";
import { parseGitlabCI } from "./gitlab-ci.parser";
import { parseDockerfile } from "./dockerfile.parser";
import { parseJenkinsfile } from "./jenkinsfile.parser";
import { parseK8sManifest } from "./k8s-manifest.parser";

export type SupportedCIFile =
  | 'github-actions'
  | 'gitlab-ci'
  | 'dockerfile'
  | 'jenkinsfile'
  | 'kubernetes';

export function detectFileType(filePath: string, content: string): SupportedCIFile | null {
  const lcPath = filePath.toLowerCase();
  
  if (lcPath === "dockerfile" || lcPath.match(/dockerfile\..*/)) {
    return 'dockerfile';
  }
  
  if (lcPath === "jenkinsfile" || lcPath.match(/jenkinsfile\..*/)) {
    return 'jenkinsfile';
  }
  
  if (lcPath.includes(".github/workflows/") && (lcPath.endsWith(".yml") || lcPath.endsWith(".yaml"))) {
    return 'github-actions';
  }
  
  if (lcPath.endsWith(".gitlab-ci.yml")) {
    return 'gitlab-ci';
  }
  
  if (lcPath.endsWith(".yml") || lcPath.endsWith(".yaml")) {
    try {
      const docs = jsyaml.loadAll(content).filter(Boolean) as any[];
      if (docs.length === 0) return null;
      
      const firstDoc = docs[0]!;
      if (typeof firstDoc === "object" && firstDoc.kind) {
        return 'kubernetes';
      }
      
      if (typeof firstDoc === "object") {
        if (firstDoc.stages || firstDoc.before_script || firstDoc.workflow || firstDoc.include) {
          return 'gitlab-ci';
        }
        if (firstDoc.jobs && !firstDoc.apiVersion) {
          // GitHub Actions top level has jobs: and usually name:, on:
          if (firstDoc.on || (firstDoc.jobs && typeof firstDoc.jobs === "object")) {
             // We default to github-actions if there is a jobs block and no other clear indicators
            return 'github-actions';
          }
        }
      }
    } catch (e) {
      // Not valid YAML
    }
  }
  
  // Try one last check for Jenkins declarative/scripted
  if (/pipeline\s*\{/.test(content) || /node\s*(\([^\)]*\))?\s*\{/.test(content)) {
    return 'jenkinsfile';
  }

  return null;
}

export function detectAndParse(
  rawContent: string,
  filePath: string,
  repoId: string
): ParseResult<NormalizedWorkflow> {
  const fileType = detectFileType(filePath, rawContent);
  
  switch (fileType) {
    case 'dockerfile':
      return parseDockerfile(rawContent, filePath, repoId);
    case 'jenkinsfile':
      return parseJenkinsfile(rawContent, filePath, repoId);
    case 'github-actions':
      return parseGithubActions(rawContent, filePath, repoId);
    case 'gitlab-ci':
      return parseGitlabCI(rawContent, filePath, repoId);
    case 'kubernetes':
      return parseK8sManifest(rawContent, filePath, repoId);
    default:
      return {
        success: false,
        result: null,
        errors: [{ message: `Unsupported file type: ${filePath}`, field: undefined, line: undefined, severity: DiagnosticSeverity.ERROR }],
        warnings: []
      };
  }
}
