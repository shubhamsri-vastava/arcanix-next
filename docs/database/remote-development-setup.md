# Safe remote development database setup

This guide targets a **separate disposable Supabase project** named `arcanix-development`. It must never target Arcanix production (`tacaqmstvqbvkpibhlnz`). The migrations require review and runtime validation before application.

## 1. Create the development project

1. Sign in to the Supabase Dashboard and create a new Free-plan project named `arcanix-development` in the preferred development region.
2. Do not clone, pause, delete, link, or use the Mumbai production project for migration tests.
3. Record only the development project reference in your shell, not source control:

```powershell
$env:ARCANIX_SUPABASE_DEV_PROJECT_REF = 'your_development_project_ref'
npm run supabase:dev:check
npm run supabase:migrations:list
```

The guard prints the intended reference, refuses the production reference, and performs no Supabase network or database action.

## 2. Keep development application values separate

From the development project **Connect** dialog, obtain its Project URL and publishable key. Keep those values in a developer-local file such as `.env.development.local` or in deployment-secret storage. Do not replace production `.env.local` values when testing the database project.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-development-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_development_value
```

Never commit that file, a CLI access token, a database password, a secret key, or any production credential. `.env*.local` is already ignored by this repository.

## 3. Authenticate and link only the development project

Run this interactively from the project root:

```powershell
npx supabase login
```

Create a Personal Access Token only in the dashboard when prompted. Do not put it in `package.json`, migration SQL, or a `NEXT_PUBLIC_*` environment variable.

Before linking, run the guard with the exact intended reference. Then link explicitly—not through a default selection:

```powershell
npm run supabase:dev:check -- your_development_project_ref
npx supabase link --project-ref your_development_project_ref
```

Immediately verify the target without changing it:

```powershell
npx supabase migration list --remote=your_development_project_ref
```

The output compares local migration filenames with remote migration history. Re-run the guard whenever the shell/project target changes. The Supabase CLI documents `migration list --remote=<ref>` as a remote history listing command. [CLI migration list reference](https://supabase.com/docs/reference/cli/supabase-migration-list)

## 4. Apply migrations to development only

After a human confirms the printed reference is the disposable development project, preview the change:

```powershell
npx supabase db push --remote=your_development_project_ref --dry-run
```

Review the exact five migration files and the target printed by the CLI. Only then, in an interactive terminal, apply to the disposable project:

```powershell
npx supabase db push --remote=your_development_project_ref
```

Never use `supabase db push` without an explicit `--remote=your_development_project_ref`; never pass the production reference. Supabase records applied versions in `supabase_migrations.schema_migrations`. [Supabase deployment guidance](https://supabase.com/docs/guides/deployment/database-migrations)

## 5. Database tests

The installed Supabase CLI is `3.1.0`. Its help confirms `npx supabase test db [--remote=<ref>]` supports local and remote targets. The local target runs pgTAP in a container. This machine cannot run Docker/WSL, so the checked-in tests cannot be executed here. Do not use production as a substitute.

The current test file contains structural pgTAP assertions plus comments describing fixture-dependent behavior tests. It does **not** currently execute the documented auth, RLS, connection lifecycle, or Storage allow/deny scenarios. Do not treat a passing run of this file as full security verification. A remote test command can modify its target while running; use it only against an approved disposable development project, never production. For full fixture-based tests, the preferred route is a separate machine/CI runner with Docker, where you can run:

```powershell
npx supabase start
npx supabase db reset
npx supabase test db
```

The checked-in test script uses a transaction and rollback for its structural assertions. [Supabase test db reference](https://supabase.com/docs/reference/cli/supabase-db-remote)

## Safety checklist

- [ ] Guard script printed the intended development reference and did not reject it.
- [ ] The reference is not `tacaqmstvqbvkpibhlnz`.
- [ ] CLI link, remote listing, and any push use the explicit development reference.
- [ ] A dry run was reviewed before an apply command.
- [ ] No production `.env.local`, secret key, PAT, or database password was copied into the repository.
- [ ] Tests run only in local Docker or an approved disposable development project.
