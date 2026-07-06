import { pgTable, uuid, integer, varchar, timestamp, boolean, text, bigint, uniqueIndex } from 'drizzle-orm/pg-core';
import { users, repos } from './schema';

export const githubAppInstallations = pgTable(
  'github_app_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    installationId: integer('installation_id').unique().notNull(),
    accountLogin: varchar('account_login', { length: 255 }).notNull(),
    accountType: varchar('account_type', { length: 50 }).notNull(),
    accountAvatarUrl: varchar('account_avatar_url', { length: 500 }),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null'
    }),
    appId: integer('app_id').notNull(),
    repositorySelection: varchar('repository_selection', { length: 50 }).notNull().default('selected'),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }
);

export const githubAppRepos = pgTable(
  'github_app_repos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    installationId: integer('installation_id').notNull()
      .references(() => githubAppInstallations.installationId, { onDelete: 'cascade' }),
    githubRepoId: integer('github_repo_id').notNull(),
    owner: varchar('owner', { length: 255 }).notNull(),
    repoName: varchar('repo_name', { length: 255 }).notNull(),
    fullName: varchar('full_name', { length: 512 }).notNull(),
    private: boolean('private').notNull().default(false),
    defaultBranch: varchar('default_branch', { length: 255 }).notNull().default('main'),
    repoId: uuid('repo_id').references(() => repos.id, {
      onDelete: 'set null'
    }),
    autoScanEnabled: boolean('auto_scan_enabled').notNull().default(true),
    autoPrEnabled: boolean('auto_pr_enabled').notNull().default(false),
    blockOnGrade: varchar('block_on_grade', { length: 5 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqInstallationRepo: uniqueIndex('github_app_repos_installation_repo_unique').on(table.installationId, table.githubRepoId),
  })
);

export const githubAppEvents = pgTable(
  'github_app_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deliveryId: varchar('delivery_id', { length: 255 }).unique(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    action: varchar('action', { length: 100 }),
    installationId: integer('installation_id'),
    repoFullName: varchar('repo_full_name', { length: 512 }),
    senderLogin: varchar('sender_login', { length: 255 }),
    scanId: uuid('scan_id'),
    checkRunId: bigint('check_run_id', { mode: 'number' }),
    prNumber: integer('pr_number'),
    status: varchar('status', { length: 50 }).notNull().default('received'),
    errorMessage: text('error_message'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }
);
