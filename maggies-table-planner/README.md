# Maggie’s table planner

Cloudflare Pages app with shared allocation storage in D1. No guest names are included in this public repository.

## Deploy through Cloudflare

1. Workers & Pages → Create → Pages → Connect to Git → select `projects`.
2. Production branch: `main`. Root directory: `maggies-table-planner`. Framework: None. Build command: leave blank. Build output directory: `public`.
3. Create a D1 database named `maggies-table-planner`. In its Console, run the SQL in `schema.sql`.
4. In the Pages project Settings → Bindings, add a D1 binding named `DB`, selecting that database.
5. Redeploy the production deployment after adding the binding.
6. Open the deployed URL and choose **Import plan**. Select your downloaded `Maggies_Table_Planner.html`. This imports the guest list into your database, without committing it to GitHub.

Visitors can view and edit without sign-in. Anyone with the website address can access the shared plan. `noindex` discourages search indexing; it is not access control.

Shared changes refresh every 10 seconds. Conflicting saves are rejected rather than silently overwriting another organiser’s changes. Undo is local to the current session. Export CSV and printing are included.

## Source

`public/app.js` is the self-contained compiled React UI. Editable TypeScript sources are in `src/`; `functions/api/plan.ts` handles shared saves. Assets are prebuilt so Cloudflare needs no build step. The original offline file is a separate private deliverable and is intentionally excluded.
