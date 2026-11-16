# Maggie’s table planner

Cloudflare Pages app with shared allocation storage in D1. Includes the 51-guest starting plan, published with the organiser’s permission.

## Automatic publishing

Cloudflare Pages project `maggies-table-planner` is connected to `davidsharpe01-create/projects`, branch `main`. Changes under `maggies-table-planner/` automatically build with `npm run build` and publish the `public` directory. Shared plans are stored in the production D1 database through the `DB` binding.

The interface and starting guest plan are synced from Sites version 4 (source commit `dd49d9f56229e2ab11ffcbc9ed2f91a41dc17d59`), with a Cloudflare Pages API adapter.

## Recreate the Cloudflare setup

1. Workers & Pages → Create → Pages → Connect to Git → select `projects`.
2. Production branch: `main`. Root directory: `maggies-table-planner`. Framework: None. Build command: `npm run build`. Build output directory: `public`.
3. Create a D1 database named `maggies-table-planner`. In its Console, run the SQL in `schema.sql`.
4. In the Pages project Settings → Bindings, add a D1 binding named `DB`, selecting that database.
5. Redeploy the production deployment after adding the binding.
6. Open the deployed URL. The original 51-guest plan is saved to D1 on first use.

Visitors can view and edit without sign-in. Anyone with the website address can access the shared plan. `noindex` discourages search indexing; it is not access control.

Shared changes refresh every 10 seconds. Conflicting saves are rejected rather than silently overwriting another organiser’s changes. Undo is local to the current session. Printing is included.

## Source

`public/app.js` is the self-contained compiled React UI. Editable TypeScript sources are in `src/`; `functions/api/plan.ts` handles shared saves. Assets are prebuilt so Cloudflare needs no build step. The original offline file is a separate private deliverable and is intentionally excluded.
