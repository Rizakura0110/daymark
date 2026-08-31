# Daymark working agreements

- Daymark belongs to `Rizakura0110/daymark`, a separate public repository integrated into `rizakura-hontai` through a commit-pinned Git submodule. It is not published to npm.
- Phase 20 includes only non-sensitive connectivity stubs. Habit features, UI, contracts and tables require the owner's design agreement at the beginning of Phase 21.
- The foundation owns Cloudflare Access, the production Worker, D1 bindings, migrations, deployment and shared protections. Do not add production credentials or independent deployment commands here.
- Browser code must not import server/schema entrypoints. Do not import Tech Inbox or foundation application internals. Prefer capability injection for future adapters.
- Keep tools, dependencies, cache and generated output within the owner's authorized workspace. Use pinned Node.js/pnpm and preserve the registry supply-chain policy.
- Before a phase commit, run all relevant quality gates, review the full diff and scan for secrets. Push the tested Daymark commit before updating/pushing the foundation gitlink; never force-push or deploy implicitly.
