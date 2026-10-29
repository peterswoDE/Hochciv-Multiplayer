[← Documentation](../README.md)

# Branches and release flow

```
feature/… or fix/…  ──PR──▶  development  ──▶  staging server  ──PR──▶  main  ──▶  production
                             (image :staging,     (test there)          (image :latest + vX.Y.Z,
                              Watchtower updates)                         GitHub release)
```

1. Branch from `development` (`git fetch && git switch -c feature/… origin/development`).
2. Test locally with `docker-compose.local.yml` ([Local setup](local-setup.md)), then open a PR **into `development`**.
3. Merging builds `peterswode/hochciv-multiplayer:staging` (plus `staging-<commit>`). Watchtower on the server pulls it within a few minutes and restarts [staging](../operations/staging.md).
4. Test on staging (web and, if needed, the Android app pointed at the staging URL).
5. When staging is good, open a PR **`development` → `main`**. Merging builds the release, then update production as described under [Deployment → Updating](../operations/deployment.md#updating).

Hotfixes that cannot wait go from a `hotfix/…` branch off `main` straight into `main`; merge `main` back into `development` afterwards (PR `main` → `development`) so the two do not drift.

## Branch rules

* Direct pushes to `development` and `main` are blocked; every change comes through a PR.
* The *PR Source Check* workflow (`.github/workflows/pr-source-check.yml`) fails every PR into `main` that comes from another branch than `development` or `hotfix/…`.

## What the build workflow does

`.github/workflows/release.yml` (*Build & Publish Docker Image*) runs on pushes to `main` and `development`, on `v*.*.*` tags and manually:

| Trigger | Image tags | Also |
|---|---|---|
| push to `development` | `staging`, `staging-<commit>` | – |
| push to `main` | `latest`, `vX.Y.Z` (patch version bumped automatically) | git tag and GitHub release |
| tag `vX.Y.Z` | `latest`, `vX.Y.Z` | – |
| manual run on another branch | `dev`, `dev-<commit>` | – |

Images go to Docker Hub (`peterswode/hochciv-multiplayer`) and the GitHub Container Registry.

## Feature work

Each feature has a section in [TASKS.md](../../TASKS.md) with its status (⬜ planned · 🔨 in progress · ✅ on `development` · 🚀 in production), what was built and its test. A feature PR updates its section there and, if it changes what players see, [Features](../overview/features.md) and the page of this documentation that covers it.
