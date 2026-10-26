# Base Assumptions

The project we are working on is `multiplayer-server`. It is an extension to the base project **Hochciv**.

## Important Constraints
- **Hochciv Codebase:** As Hochciv is not our primary project, we can never modify its source code directly—only dynamically during deployment.
- **Sensitive Files:** You may **never** change `secrets.env` or `.gitignore`.

## Infrastructure Configuration
We utilize two distinct Docker configurations:
- `docker-compose.local.yml`: The configuration for a simplified local test deployment. All secrets for local deployment are stored in `secrets.env`.
- `docker-compose.yml`: The production configuration.

## Branching
- `development` is the integration branch; it is deployed automatically to the staging server.
- `main` is production. It only receives PRs from `development` after the change was tested on staging (hotfixes excepted, see README.md).
- New branches are created from `origin/development`, and their PRs target `development`.

## Finalize
- After implementing a change, always run `docker compose -f docker-compose.local.yml build` and `docker compose -f docker-compose.local.yml up -d` to test the change.
- Always run `docker compose -f docker-compose.local.yml logs --tail 5` to check the logs.
- Always run `docker compose -f docker-compose.local.yml down` to stop the containers.
- Always push the changes to the repository after testing.
- Always run `git add .` and `git commit -m "<commit message>"` and `git push` to push the changes to the repository.
- If you get instructed to create a new feature, always create a new branch for it from `origin/development`, push it to the repository and open a PR into `development`.