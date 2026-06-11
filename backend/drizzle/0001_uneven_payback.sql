CREATE TYPE "public"."category" AS ENUM('security', 'reliability', 'performance', 'maintainability');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('github', 'gitlab', 'gitea', 'self-hosted');--> statement-breakpoint
CREATE TYPE "public"."repo_status" AS ENUM('active', 'paused', 'error');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TABLE "ai_explanations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scan_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"rule_id" text,
	"explanation" text NOT NULL,
	"risk_context" text,
	"urgency" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_predictions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scan_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"rule_id" text,
	"scenario" text NOT NULL,
	"trigger" text,
	"impact" text,
	"likelihood" text,
	"time_to_failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_remediations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scan_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"rule_id" text,
	"title" text NOT NULL,
	"before_code" text,
	"after_code" text,
	"language" text,
	"instructions" text,
	"safe" boolean,
	"warning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scan_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"overall_score" integer NOT NULL,
	"risk_grade" text NOT NULL,
	"critical_count" integer DEFAULT 0 NOT NULL,
	"high_count" integer DEFAULT 0 NOT NULL,
	"medium_count" integer DEFAULT 0 NOT NULL,
	"low_count" integer DEFAULT 0 NOT NULL,
	"report_json" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scan_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"artifact_id" uuid,
	"file_path" text NOT NULL,
	"rule_id" text NOT NULL,
	"title" text NOT NULL,
	"severity" "severity" NOT NULL,
	"category" "category" NOT NULL,
	"description" text NOT NULL,
	"field" text,
	"line" integer,
	"remediation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parsed_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scan_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"file_type" text NOT NULL,
	"normalized_workflow" jsonb,
	"parse_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parse_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parsed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repo_url" text NOT NULL,
	"name" text NOT NULL,
	"provider" "provider" NOT NULL,
	"owner" text NOT NULL,
	"repo_name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "repo_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_scanned_at" timestamp with time zone,
	"total_scans" integer DEFAULT 0 NOT NULL,
	"user_id" uuid,
	CONSTRAINT "repo_url_user_id_unique" UNIQUE("repo_url","user_id")
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repo_id" uuid NOT NULL,
	"status" "scan_status" DEFAULT 'running' NOT NULL,
	"branch" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"total_files" integer DEFAULT 0 NOT NULL,
	"total_findings" integer DEFAULT 0 NOT NULL,
	"critical_count" integer DEFAULT 0 NOT NULL,
	"high_count" integer DEFAULT 0 NOT NULL,
	"medium_count" integer DEFAULT 0 NOT NULL,
	"low_count" integer DEFAULT 0 NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255),
	"username" varchar(100) NOT NULL,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"github_id" varchar(255),
	"github_username" varchar(255),
	"github_access_token" text,
	"avatar_url" varchar(500),
	"email_verified" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_artifact_id_parsed_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."parsed_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_artifacts" ADD CONSTRAINT "parsed_artifacts_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_artifacts" ADD CONSTRAINT "parsed_artifacts_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repos" ADD CONSTRAINT "repos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE no action ON UPDATE no action;