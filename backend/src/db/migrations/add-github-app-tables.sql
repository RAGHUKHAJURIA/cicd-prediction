CREATE TABLE IF NOT EXISTS github_app_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id INTEGER UNIQUE NOT NULL,
  account_login VARCHAR(255) NOT NULL,
  account_type VARCHAR(50) NOT NULL,
  account_avatar_url VARCHAR(500),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  app_id INTEGER NOT NULL,
  repository_selection VARCHAR(50) NOT NULL DEFAULT 'selected',
  suspended_at TIMESTAMPTZ,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS github_app_repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id INTEGER NOT NULL
    REFERENCES github_app_installations(installation_id)
    ON DELETE CASCADE,
  github_repo_id INTEGER NOT NULL,
  owner VARCHAR(255) NOT NULL,
  repo_name VARCHAR(255) NOT NULL,
  full_name VARCHAR(512) NOT NULL,
  private BOOLEAN NOT NULL DEFAULT FALSE,
  default_branch VARCHAR(255) NOT NULL DEFAULT 'main',
  repo_id UUID REFERENCES repos(id) ON DELETE SET NULL,
  auto_scan_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_pr_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  block_on_grade VARCHAR(5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(installation_id, github_repo_id)
);

CREATE TABLE IF NOT EXISTS github_app_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id VARCHAR(255) UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  action VARCHAR(100),
  installation_id INTEGER,
  repo_full_name VARCHAR(512),
  sender_login VARCHAR(255),
  scan_id UUID,
  check_run_id BIGINT,
  pr_number INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'received',
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_github_app_events_delivery
  ON github_app_events(delivery_id);
CREATE INDEX IF NOT EXISTS idx_github_app_events_installation
  ON github_app_events(installation_id);
CREATE INDEX IF NOT EXISTS idx_github_app_repos_installation
  ON github_app_repos(installation_id);
