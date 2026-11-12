# Power of Yes Volunteers

A web app for the parish volunteer program. It replaces the paper "Power of Yes" cards.

- **Volunteers** sign in with their email (no password), fill in the same card online, and see where they're scheduled.
- **Coordinators** see every volunteer by area of interest, type in paper cards, create events and projects, assign people, and mark who showed up.
- **Coordinators** also keep a follow-up to-do list ("Call Ann about the pierogi batch, due Friday") and maintain the list of ministries and events volunteers can pick from.
- **Church admins** do everything coordinators do, invite coordinators by email, and set the church's look.
- **The platform owner** adds churches to the site and names each church's first admin.

## Many churches, one site
One copy of the site serves any number of churches. Each church's volunteers, events and follow-ups are kept separate by the database's access rules, so a coordinator at one church never sees another church's people.

- Each church has its own link, like `https://vmottau.github.io/PowerOfYes/#/c/st-marys`. Someone who opens it sees that church's name and colors, and joins that church when they sign in.
- Someone who signs in without a link picks their church from a list.
- A person can volunteer at more than one church and switch between them from the menu.

## Make it your church's
Everything that identifies a church is set in the app, under **Manage → Appearance**: church name, app title, welcome line, two colors (with ready-made palettes) and a logo. Each church on the site has its own look.

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
(If you already ran an older `schema.sql`, run the new one again. It's safe to re-run and adds what's missing.)

1. Sign up at [supabase.com](https://supabase.com) and click **New project**. Pick any name and region, and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste everything from [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Open **Authentication → URL Configuration**:
   - **Site URL:** your site's address, `https://vmottau.github.io/PowerOfYes/`
   - **Redirect URLs:** add the same address.
4. Open **Project Settings → API** and copy the **Project URL** and the **anon / public** key. The anon key is meant to be public; the access rules in the database protect the data.

### 2. Connect GitHub
1. In this repository on GitHub, open **Settings → Secrets and variables → Actions → Variables** and add:
   - `SUPABASE_URL`: the Project URL
   - `SUPABASE_ANON_KEY`: the anon / public key
2. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open **Actions → Deploy to GitHub Pages → Run workflow**. When it finishes, the site's address appears on the run.

### 3. Become the platform owner and add your church
1. Open the site and sign in with your email **first**. The first account created becomes the platform owner.
2. Open **All churches**, fill in the church's name, its link name (like `st-marys`) and the email of its admin, and click **Add church**. That can be your own email.
3. The church's admin signs in with that email and runs the church. Under **Manage → People & roles** they can invite coordinators by email and copy the church's sign-up link to share with the parish.

To add another church later, repeat step 2.

### 4. Before inviting the whole parish: email sending
Supabase's built-in email sender only allows a few sign-in emails per hour. That's fine for testing. Before announcing the site, connect a real email sender under **Authentication → Emails → SMTP Settings** (the parish's email provider, or a free service such as Brevo or Resend). You can also edit the sign-in email's wording on the same page.

## Paper cards and online sign-ups
Staff can keep typing in paper cards. When someone with a paper card later signs in and joins that church using the **same email address**, the app links them to their existing card automatically, along with their event history.

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
