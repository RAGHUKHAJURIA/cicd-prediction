import { db } from '../../db/client';
import { githubAppInstallations, githubAppRepos } from '../../db/schema';
import { eq, and } from 'drizzle-orm';

export async function processInstallationEvent(payload: {
  action: string;
  installation: {
    id: number;
    account: { login: string; type: string; avatar_url: string };
    app_id: number;
    repository_selection: string;
    suspended_at: string | null;
  };
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  repositories_added?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  repositories_removed?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  sender: { login: string };
}): Promise<void> {
  const { action, installation } = payload;
  const installationId = installation.id;

  if (action === 'created') {
    // 1. Upsert into github_app_installations
    await db
      .insert(githubAppInstallations)
      .values({
        installationId,
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        accountAvatarUrl: installation.account.avatar_url,
        appId: installation.app_id,
        repositorySelection: installation.repository_selection,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: githubAppInstallations.installationId,
        set: {
          accountLogin: installation.account.login,
          accountType: installation.account.type,
          accountAvatarUrl: installation.account.avatar_url,
          repositorySelection: installation.repository_selection,
          suspendedAt: null,
          updatedAt: new Date()
        }
      });

    // 2. Upsert repositories if any
    const reposList = payload.repositories || [];
    for (const r of reposList) {
      await db
        .insert(githubAppRepos)
        .values({
          installationId,
          githubRepoId: r.id,
          owner: installation.account.login,
          repoName: r.name,
          fullName: r.full_name,
          private: r.private,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: [githubAppRepos.installationId, githubAppRepos.githubRepoId],
          set: {
            owner: installation.account.login,
            repoName: r.name,
            fullName: r.full_name,
            private: r.private,
            updatedAt: new Date()
          }
        });
    }

    console.log(`[InstallationProcessor] Installation ${installationId} created for ${installation.account.login}`);

  } else if (action === 'deleted') {
    // 1. Soft delete installation
    await db
      .update(githubAppInstallations)
      .set({
        suspendedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(githubAppInstallations.installationId, installationId));

    // 2. Disable auto scan on repos
    await db
      .update(githubAppRepos)
      .set({
        autoScanEnabled: false,
        updatedAt: new Date()
      })
      .where(eq(githubAppRepos.installationId, installationId));

    console.log(`[InstallationProcessor] Installation ${installationId} deleted`);

  } else if (action === 'repositories_added') {
    const addedList = payload.repositories_added || [];
    for (const r of addedList) {
      await db
        .insert(githubAppRepos)
        .values({
          installationId,
          githubRepoId: r.id,
          owner: installation.account.login,
          repoName: r.name,
          fullName: r.full_name,
          private: r.private,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: [githubAppRepos.installationId, githubAppRepos.githubRepoId],
          set: {
            owner: installation.account.login,
            repoName: r.name,
            fullName: r.full_name,
            private: r.private,
            updatedAt: new Date()
          }
        });
    }
    console.log(`[InstallationProcessor] Repositories added for installation ${installationId}`);

  } else if (action === 'repositories_removed') {
    const removedList = payload.repositories_removed || [];
    for (const r of removedList) {
      await db
        .delete(githubAppRepos)
        .where(
          and(
            eq(githubAppRepos.installationId, installationId),
            eq(githubAppRepos.githubRepoId, r.id)
          )
        );
    }
    console.log(`[InstallationProcessor] Repositories removed for installation ${installationId}`);

  } else if (action === 'suspend') {
    await db
      .update(githubAppInstallations)
      .set({
        suspendedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(githubAppInstallations.installationId, installationId));
    console.log(`[InstallationProcessor] Installation ${installationId} suspended`);

  } else if (action === 'unsuspend') {
    await db
      .update(githubAppInstallations)
      .set({
        suspendedAt: null,
        updatedAt: new Date()
      })
      .where(eq(githubAppInstallations.installationId, installationId));
    console.log(`[InstallationProcessor] Installation ${installationId} unsuspended`);
  }
}
