# Full Project Documentation: CI/CD Reliability & Intelligence Platform

## Overview
The **CI/CD Reliability & Intelligence Platform** is a decoupled, asynchronous, worker-based platform designed to process compute-heavy CI/CD file parsing, security checking, and large language model (LLM) diagnostics. It analyzes configurations from systems like GitHub Actions, GitLab CI, Docker, Kubernetes, and Jenkins to detect vulnerabilities, reliability risks, and performance bottlenecks, providing AI-driven remediations.

## System Architecture

The architecture follows an asynchronous, event-driven, and microservices-oriented approach designed to be horizontally scalable.

### High-Level Architecture Diagram (Mental Model)
- **Frontend**: Next.js 14 Single-Page Application (SPA) dashboard.
- **API Gateway**: Express.js REST API Server.
- **Message Broker & Cache**: Redis-backed BullMQ.
- **Workers**: Horizontally scalable Node.js worker services:
  - `ScanWorker`: Fetches and parses CI/CD files into an Abstract Syntax Tree (AST).
  - `AnalysisWorker`: Runs rules engines and calculates risk scores.
  - `AIWorker`: Interacts with Anthropic's Claude API to generate diagnostics and fixes.
- **Database**: PostgreSQL accessed via Drizzle ORM.
- **External APIs**: GitHub API, GitLab API, Anthropic Claude API, Slack Webhooks.

## Technology Stack

### Frontend (Dashboard)
- **Framework**: Next.js 14, React 18
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI (Headless components), Lucide React (Icons)
- **Data Visualization**: Recharts (Charts), React Flow (Workflow graphs)
- **Animations**: Framer Motion
- **State/Data Fetching**: SWR

### Backend (API & Workers)
- **Runtime**: Node.js (Engine: >=20.0.0)
- **Framework**: Express.js
- **Language**: TypeScript
- **Queues & Background Jobs**: BullMQ
- **Queue Dashboard**: Bull Board (mounted in Express)
- **Validation**: Zod
- **External Integrations**: Octokit (GitHub), Anthropic SDK
- **Parsing Engines**: fast-xml-parser, js-yaml

### Databases & Infrastructure
- **Primary Database**: PostgreSQL 16
- **ORM**: Drizzle ORM (`drizzle-kit` for migrations)
- **Cache & Queue System**: Redis 7
- **Containerization**: Docker & Docker Compose 
  - `docker-compose.yml`: For DB, API gateway, and Redis.
  - `docker-compose.workers.yml`: For horizontally scaling `scan-worker`, `analysis-worker`, and `ai-worker` services.

## Feature Details

### 1. Repository Management & Ingestion
- **Registration**: Add repositories via GitHub/GitLab URLs.
- **Webhooks Integration**: Automatically triggers scans on Git Push or Pull Request events using raw payloads and HMAC-SHA256 signature verification.
- **Customization**: Configure auto-scan rules, cron schedules, and ignore paths (`.gitignore` logic).

### 2. CI/CD Parsing Engine (Scan Phase)
- **Worker**: `ScanWorker` (`scan-queue`)
- **Parsers**: Custom parsers for GitHub Actions YAML, GitLab CI, Dockerfile, Docker Compose, Jenkinsfile, and Kubernetes YAML.
- **Output**: Generates a **Schema-Normalized Workflow AST**, providing a unified representation of disparate CI/CD configurations. It handles syntax errors, deprecation warnings, and extracts jobs, steps, and dependencies.

### 3. Linting & Risk Scoring Engine (Analysis Phase)
- **Worker**: `AnalysisWorker` (`analysis-queue`)
- **Rules Engine**: Runs specific rules against the normalized AST (Security, Reliability, Performance, Maintainability).
- **Scoring System**: Calculates specific violation severities (Critical, High, Medium, Low) and derives a numerical Risk Score and Letter Grade (A, B, C, D, F) for individual workflows and the overall repository.
- **Trigger**: Pushes to the AI queue if findings are severe (e.g., Risk Score >= 40 or critical vulnerabilities found).

### 4. AI-Powered Diagnostics Engine (AI Phase)
- **Worker**: `AIWorker` (`ai-queue`)
- **Integration**: Anthropic Claude API.
- **Explanations**: Translates technical vulnerabilities into plain English, detailing business impact and risk context.
- **Remediations**: Generates concrete "before-and-after" code patches to fix issues. Includes safety checks and side-effect warnings.
- **Predictions**: Simulates failure scenarios, identifying triggers, likelihood, impact, and time-to-failure.

### 5. Alerts & Notifications
- **Webhooks**: Notifies external systems (e.g., Slack channels) of scan results, critical vulnerabilities, and AI predictions.
- **GitHub App integration**: Provides installation callbacks and permissions.

### 6. System Monitoring & Queue Management
- **Bull Board**: Embedded UI in the Express server to inspect job statuses, view failed job stack traces, and manually retry queue items.
- **Metrics APIs**: Exposes endpoints for active job counts across all queues, worker health, Redis latency, and DB connectivity metrics.

## Caching & Queue System Details
- **Tech**: Redis (`ioredis`) + BullMQ.
- **Queues**:
  1. `scan-queue`: Concurrency 5 (scalable via docker limits). Fetches code and generates AST. Uses exponential backoff for retries.
  2. `analysis-queue`: Concurrency 3. Evaluates AST against rule sets. Uses fixed delay retries.
  3. `ai-queue`: Concurrency 2 (resource intensive). Queries Anthropic LLMs.
- **Caching**: Redis is primarily used for queue states but also provides high-speed rate-limiting, session states, and worker coordination.

## Database Schema Highlights
- **repos**: Tracks repositories, provider (github/gitlab), status, and scheduling settings.
- **scans**: Execution logs for pipeline runs. Includes duration, file counts, branch names, and aggregated severity counts.
- **parsed_artifacts**: The intermediate JSON AST representations generated from CI/CD configs.
- **findings**: Individual rule violations linking rule IDs to files and line numbers.
- **ai_explanations**, **ai_remediations**, **ai_predictions**: Store Claude-generated diagnostic details for each finding/scan.
- **analysis_reports**: Aggregated JSON snapshots and overall repository grades for dashboard presentation.
