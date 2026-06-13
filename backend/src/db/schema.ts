import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uuid,
  pgEnum,
  varchar,
  unique,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const providerEnum = pgEnum("provider", [
  "github",
  "gitlab",
  "gitea",
  "self-hosted",
]);

export const repoStatusEnum = pgEnum("repo_status", [
  "active",
  "paused",
  "error",
]);

export const scanStatusEnum = pgEnum("scan_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const severityEnum = pgEnum("severity", [
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

export const categoryEnum = pgEnum("category", [
  "security",
  "reliability",
  "performance",
  "maintainability",
]);

// ─── repos ────────────────────────────────────────────────────────────────────

export const repos = pgTable("repos", {
  id: uuid("id").primaryKey(),
  repoUrl: text("repo_url").notNull(),
  name: text("name").notNull(),
  provider: providerEnum("provider").notNull(),
  owner: text("owner").notNull(),
  repoName: text("repo_name").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  settings: jsonb("settings").notNull().default({}),
  status: repoStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
  totalScans: integer("total_scans").notNull().default(0),
  userId: uuid("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
}, (table) => {
  return {
    repoUrlUserIdUnique: unique("repo_url_user_id_unique").on(table.repoUrl, table.userId)
  };
});

export type RepoRow = typeof repos.$inferSelect;
export type NewRepoRow = typeof repos.$inferInsert;

// ─── scans ────────────────────────────────────────────────────────────────────

export const scans = pgTable("scans", {
  id: uuid("id").primaryKey(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repos.id),
  status: scanStatusEnum("status").notNull().default("running"),
  branch: text("branch").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  triggeredAt: timestamp("triggered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  totalFiles: integer("total_files").notNull().default(0),
  totalFindings: integer("total_findings").notNull().default(0),
  criticalCount: integer("critical_count").notNull().default(0),
  highCount: integer("high_count").notNull().default(0),
  mediumCount: integer("medium_count").notNull().default(0),
  lowCount: integer("low_count").notNull().default(0),
  errorMessage: text("error_message"),
});

export type ScanRow = typeof scans.$inferSelect;
export type NewScanRow = typeof scans.$inferInsert;

// ─── parsed_artifacts ─────────────────────────────────────────────────────────

export const parsedArtifacts = pgTable("parsed_artifacts", {
  id: uuid("id").primaryKey(),
  scanId: uuid("scan_id")
    .notNull()
    .references(() => scans.id),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repos.id),
  filePath: text("file_path").notNull(),
  fileType: text("file_type").notNull(),
  normalizedWorkflow: jsonb("normalized_workflow"),
  parseErrors: jsonb("parse_errors").notNull().default([]),
  parseWarnings: jsonb("parse_warnings").notNull().default([]),
  parsedAt: timestamp("parsed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ParsedArtifactRow = typeof parsedArtifacts.$inferSelect;
export type NewParsedArtifactRow = typeof parsedArtifacts.$inferInsert;

// ─── findings ─────────────────────────────────────────────────────────────────

export const findings = pgTable("findings", {
  id: uuid("id").primaryKey(),
  scanId: uuid("scan_id")
    .notNull()
    .references(() => scans.id),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repos.id),
  artifactId: uuid("artifact_id").references(() => parsedArtifacts.id),
  filePath: text("file_path").notNull(),
  ruleId: text("rule_id").notNull(),
  title: text("title").notNull(),
  severity: severityEnum("severity").notNull(),
  category: categoryEnum("category").notNull(),
  description: text("description").notNull(),
  field: text("field"),
  line: integer("line"),
  remediation: text("remediation"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type FindingRow = typeof findings.$inferSelect;
export type NewFindingRow = typeof findings.$inferInsert;

// ─── Legacy workflows table (kept for backward compat) ────────────────────────

export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey(),
  source: text("source").notNull(),
  sourceFile: text("source_file").notNull(),
  repoId: text("repo_id").notNull(),
  parsedAt: timestamp("parsed_at", { withTimezone: true }).notNull(),
  totalJobs: integer("total_jobs").notNull().default(0),
  totalSteps: integer("total_steps").notNull().default(0),
  hasSecrets: boolean("has_secrets").notNull().default(false),
  hasDockerImages: boolean("has_docker_images").notNull().default(false),
  hasExternalActions: boolean("has_external_actions").notNull().default(false),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Phase 3 AI Tables ────────────────────────────────────────────────────────

export const aiExplanations = pgTable("ai_explanations", {
  id: uuid("id").primaryKey(),
  scanId: uuid("scan_id").notNull(),
  repoId: uuid("repo_id").notNull(),
  ruleId: text("rule_id"),
  explanation: text("explanation").notNull(),
  riskContext: text("risk_context"),
  urgency: text("urgency"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiRemediations = pgTable("ai_remediations", {
  id: uuid("id").primaryKey(),
  scanId: uuid("scan_id").notNull(),
  repoId: uuid("repo_id").notNull(),
  ruleId: text("rule_id"),
  title: text("title").notNull(),
  beforeCode: text("before_code"),
  afterCode: text("after_code"),
  language: text("language"),
  instructions: text("instructions"),
  safe: boolean("safe"),
  warning: text("warning"),
  confidence: text("confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiPredictions = pgTable("ai_predictions", {
  id: uuid("id").primaryKey(),
  scanId: uuid("scan_id").notNull(),
  repoId: uuid("repo_id").notNull(),
  ruleId: text("rule_id"),
  scenario: text("scenario").notNull(),
  trigger: text("trigger"),
  impact: text("impact"),
  likelihood: text("likelihood"),
  timeToFailure: text("time_to_failure"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const analysisReports = pgTable("analysis_reports", {
  id: uuid("id").primaryKey(),
  scanId: uuid("scan_id").notNull(),
  repoId: uuid("repo_id").notNull(),
  overallScore: integer("overall_score").notNull(),
  riskGrade: text("risk_grade").notNull(),
  criticalCount: integer("critical_count").notNull().default(0),
  highCount: integer("high_count").notNull().default(0),
  mediumCount: integer("medium_count").notNull().default(0),
  lowCount: integer("low_count").notNull().default(0),
  reportJson: text("report_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WorkflowRow = typeof workflows.$inferSelect;
export type NewWorkflowRow = typeof workflows.$inferInsert;

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  password: varchar("password", { length: 255 }),
  username: varchar("username", { length: 100 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  githubId: varchar("github_id", { length: 255 }).unique(),
  githubUsername: varchar("github_username", { length: 255 }),
  githubAccessToken: text("github_access_token"),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  emailVerified: boolean("email_verified").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

