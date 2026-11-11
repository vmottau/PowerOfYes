# Power of Yes Volunteers

A web app for the parish volunteer program. It replaces the paper "Power of Yes" cards.

- **Volunteers** sign in with their email (no password), fill in the same card online, and see where they're scheduled.
- **Coordinators** see every volunteer by area of interest, type in paper cards, create events and projects, assign people, and mark who showed up.
- **Admins** do everything coordinators do, choose who is a coordinator, and edit the list of areas of interest.

Until Supabase is connected, the site runs in **demo mode**: sample data that stays in your own browser, with buttons to try each role.

## How it's built

| Part | What it does |
| --- | --- |
| `src/` | The website (React + TypeScript, built with Vite) |
| `supabase/schema.sql` | Database tables, the three roles, and the rules for who can see and change what |
| `supabase/tests/` | Automated checks of those rules |
| `e2e/demo-flow.mjs` | Automated walkthrough of every role in demo mode |
| `.github/workflows/` | Publishes the site to GitHub Pages and runs the checks on every change |

Supabase (free plan) handles sign-in and the database. GitHub Pages (free) hosts the site.

## One-time setup

### 1. Create the Supabase project
1. Sign up at [supabase.com](https://supabase.com) and click **New project**. Pick any name and region, and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste everything from [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Open **Authentication → URL Configuration**:
   - **Site URL:** your site's address, e.g. `https://YOUR-GITHUB-NAME.github.io/church-volunteers/`
   - **Redirect URLs:** add the same address.
4. Open **Project Settings → API** and copy the **Project URL** and the **anon / public** key. The anon key is meant to be public; the access rules in the database protect the data.

### 2. Connect GitHub
1. In this repository on GitHub, open **Settings → Secrets and variables → Actions → Variables** and add:
   - `SUPABASE_URL`: the Project URL
   - `SUPABASE_ANON_KEY`: the anon / public key
2. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open **Actions → Deploy to GitHub Pages → Run workflow**. When it finishes, the site's address appears on the run.

### 3. Become the admin
Open the site and sign in with your email **first**. The first account created becomes the admin. Then use the **Admin** tab to make the volunteer coordinator a Coordinator after they've signed in once.

### 4. Before inviting the whole parish: email sending
Supabase's built-in email sender only allows a few sign-in emails per hour. That's fine for testing. Before announcing the site, connect a real email sender under **Authentication → Emails → SMTP Settings** (the parish's email provider, or a free service such as Brevo or Resend). You can also edit the sign-in email's wording on the same page.

## Paper cards and online sign-ups
Staff can keep typing in paper cards. When someone with a paper card later signs in using the **same email address**, the app links them to their existing card automatically, along with their event history.

## Working on the code

```bash
npm install
npm run demo        # run locally in demo mode at http://localhost:5173
npm run dev         # run locally against Supabase (needs .env.local, see .env.example)
npm run typecheck
npm run build
```

Checks (these also run automatically on GitHub):

```bash
# Database access rules, against a local Postgres 16
psql -f supabase/tests/auth_stub.sql && psql -f supabase/schema.sql && psql -f supabase/tests/rls_test.sql

# End-to-end walkthrough of every role in demo mode
VITE_DEMO=1 npm run build && npx vite preview --port 4173 &
npm run test:e2e
```

## Ideas for later
- Volunteers sign themselves up for open events
- Email or text reminders before an event
- Attendance reports by ministry and season
- Hours served, for youth service requirements
