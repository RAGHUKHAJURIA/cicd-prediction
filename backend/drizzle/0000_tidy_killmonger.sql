CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_file" text NOT NULL,
	"repo_id" text NOT NULL,
	"parsed_at" timestamp with time zone NOT NULL,
	"total_jobs" integer DEFAULT 0 NOT NULL,
	"total_steps" integer DEFAULT 0 NOT NULL,
	"has_secrets" boolean DEFAULT false NOT NULL,
	"has_docker_images" boolean DEFAULT false NOT NULL,
	"has_external_actions" boolean DEFAULT false NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
