CREATE TABLE "github_app_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" varchar(255),
	"event_type" varchar(100) NOT NULL,
	"action" varchar(100),
	"installation_id" integer,
	"repo_full_name" varchar(512),
	"sender_login" varchar(255),
	"scan_id" uuid,
	"check_run_id" bigint,
	"pr_number" integer,
	"status" varchar(50) DEFAULT 'received' NOT NULL,
	"error_message" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_app_events_delivery_id_unique" UNIQUE("delivery_id")
);
--> statement-breakpoint
CREATE TABLE "github_app_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" integer NOT NULL,
	"account_login" varchar(255) NOT NULL,
	"account_type" varchar(50) NOT NULL,
	"account_avatar_url" varchar(500),
	"user_id" uuid,
	"app_id" integer NOT NULL,
	"repository_selection" varchar(50) DEFAULT 'selected' NOT NULL,
	"suspended_at" timestamp with time zone,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_app_installations_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE "github_app_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" integer NOT NULL,
	"github_repo_id" integer NOT NULL,
	"owner" varchar(255) NOT NULL,
	"repo_name" varchar(255) NOT NULL,
	"full_name" varchar(512) NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"default_branch" varchar(255) DEFAULT 'main' NOT NULL,
	"repo_id" uuid,
	"auto_scan_enabled" boolean DEFAULT true NOT NULL,
	"auto_pr_enabled" boolean DEFAULT false NOT NULL,
	"block_on_grade" varchar(5),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_app_installations" ADD CONSTRAINT "github_app_installations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_app_repos" ADD CONSTRAINT "github_app_repos_installation_id_github_app_installations_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_app_installations"("installation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_app_repos" ADD CONSTRAINT "github_app_repos_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_app_repos_installation_repo_unique" ON "github_app_repos" USING btree ("installation_id","github_repo_id");