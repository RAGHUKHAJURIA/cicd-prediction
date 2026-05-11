# API Routes Documentation

This document explains the purpose, importance, and usage of all REST API routes built for the **CI/CD Reliability Intelligence Platform**.

## Why are these routes important?

The core purpose of this platform is to analyze CI/CD pipelines (GitHub Actions, GitLab CI, Dockerfiles, etc.) for reliability, security, and maintainability issues. 

However, the parsers and database alone cannot do anything. The **REST API Layer** serves as the critical bridge that allows:
1. **Frontend Dashboards** to display data, trigger scans, and show security findings to the user.
2. **Automated Webhooks** (e.g., from GitHub/GitLab) to trigger scans automatically when code is pushed.
3. **CLI Tools / External Integrations** to interact with the platform programmatically.

---

## 1. Repository Management Routes (`/api/repos`)

These routes handle the onboarding and management of the repositories you want to monitor.

### `POST /api/repos` (Register Repository)
- **What it does:** Adds a new GitHub, GitLab, or self-hosted repository to the platform's database. It automatically verifies if the repository is accessible using your configured access tokens.
- **Why it's important:** This is the entry point for the platform. Before you can scan any CI/CD files, the platform needs to know the URL, owner, and branch to look at.

### `GET /api/repos` (List Repositories)
- **What it does:** Fetches a paginated list of all repositories currently registered in the system. It supports filtering by provider (GitHub/GitLab) and searching by name.
- **Why it's important:** This powers the main dashboard view where a user can see all their monitored projects at a glance.

### `GET /api/repos/:id` (Get Repository Details)
- **What it does:** Fetches the full details of a single repository, including a summary of its most recent scan (e.g., how many critical/high vulnerabilities were found recently).
- **Why it's important:** Powers the detailed repository page on the frontend.

### `PATCH /api/repos/:id` (Update Repository Settings)
- **What it does:** Allows updating repository preferences, such as turning on `autoScanOnPush`, scheduling cron scans, or ignoring specific file paths during a scan.
- **Why it's important:** Gives users control over how and when the platform interacts with their codebase.

### `DELETE /api/repos/:id` (Remove Repository)
- **What it does:** Completely deletes a repository from the platform, cascading down to delete all historical scans, parsed artifacts, and security findings associated with it.
- **Why it's important:** Ensures data privacy and database cleanliness when a user stops tracking a project.

---

## 2. Scan & Analysis Routes (`/api/repos/:id/scans`)

These routes control the actual "Intelligence" part of the platform. They fetch the files, run the parsers, and generate reports.

### `POST /api/repos/:id/scan` (Trigger a Scan)
- **What it does:** This is the heaviest and most critical route. It immediately returns a `202 Accepted` response and then asynchronously:
  1. Reaches out to GitHub/GitLab to download all CI/CD files (Actions, Dockerfiles, Kubernetes manifests).
  2. Runs them through the specialized parsers.
  3. Detects security vulnerabilities (e.g., hardcoded secrets) and reliability issues (e.g., floating Docker tags).
  4. Saves everything to the `parsed_artifacts` and `findings` tables.
- **Why it's important:** This is the engine of the platform. It does the actual work of finding bad practices in your CI/CD pipelines.

### `GET /api/repos/:id/scans/latest` (Get Most Recent Scan)
- **What it does:** Fetches the most recently completed scan for a repository, pulling all the individual findings (grouped by file) and calculating the total counts of Critical, High, Medium, and Low severity issues.
- **Why it's important:** When a user clicks on a repository, this route instantly shows them their current security/reliability posture without making them dig through history.

### `GET /api/repos/:id/scans` (List Scan History)
- **What it does:** Returns a paginated history of all scans ever run on the repository, including their start times, durations, and high-level finding counts.
- **Why it's important:** Allows users to track their reliability improvements over time. They can see if the number of vulnerabilities is trending up or down.

### `GET /api/repos/:id/scans/:scanId` (Get Specific Historical Scan)
- **What it does:** Fetches the detailed findings for one specific past scan.
- **Why it's important:** Useful for auditing purposes, or for comparing what a pipeline looked like last month versus today.

### `POST /api/repos/:id/scans/:scanId/rerun` (Rerun a Scan)
- **What it does:** Takes the exact configuration (branch, options) of a previous scan and triggers a brand new scan asynchronously.
- **Why it's important:** If a user fixes a vulnerability in their repository, they can hit "Rerun" on the failed scan to easily verify that the issue has been resolved.

---

## Global System Routes

### `GET /health`
- **What it does:** Returns the uptime, environment details, and an `ok` status.
- **Why it's important:** Used by Kubernetes, Docker, or Load Balancers to verify that the API server is alive and hasn't crashed.

### `GET /api`
- **What it does:** Returns a quick index of all available endpoints and the API version.
- **Why it's important:** Serves as a quick developer reference when interacting with the API manually.
