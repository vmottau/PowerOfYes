# Power of Yes Volunteers

A web app for the parish volunteer program. It replaces the paper "Power of Yes" cards.

- **Volunteers** sign in with their email (no password), fill in the same card online, and see where they're scheduled. If they can't make an event, they press **Can't make it** on *My card*: their spot opens up, and coordinators see it on their home page and get a follow-up to find someone else.
- **Coordinators** see every volunteer by area of interest, type in paper cards, create events and projects, assign people, and mark who showed up.
- **Coordinators** can bring in a whole stack of paper cards at once: type them into a spreadsheet (there's a blank template), upload it under **Volunteers → Import spreadsheet**, and check a preview that flags missing names, broken emails and people who are already listed before anything is saved.
- **Open sign-up:** a coordinator can tick **Open for sign-up** on an event. Volunteers who checked that event's area (or everyone, for a general event) then see it on *My card* and can press **Sign me up** until the "Volunteers needed" number is reached. A spot freed by **Can't make it** opens up again. On the roster, people who signed themselves up are marked "Signed up online".
- **Coordinators** can download any filtered volunteer list or event roster as a spreadsheet, print a sign-in sheet for an event or a list for a ministry, and download a full backup under **Manage → Backup**.
- **Volunteers get a reminder email** a couple of days before each event they're on, and **coordinators get an email** when someone presses **Can't make it**. Admins choose how many days ahead under **Manage → Emails**, where staff can also see every email that went out.
- **Coordinators** also keep a follow-up to-do list ("Call Ann about the pierogi batch, due Friday") and maintain the list of ministries and events volunteers can pick from.
- **Church admins** do everything coordinators do, invite coordinators by email, and set the church's look.
- **The platform owner** adds churches to the site and names each church's first admin.

## Many churches, one site
One copy of the site serves any number of churches. Each church's volunteers, events and follow-ups are kept separate by the database's access rules, so a coordinator at one church never sees another church's people.

- Each church has its own link, like `https://vmottau.github.io/PowerOfYes/#/c/st-marys`. Someone who opens it sees that church's name and colors, and joins that church when they sign in.
- People never pick from a list of churches. They join only through their church's link or an email invite from their church. Someone who signs in without either is asked to open their church's link.
- Only the platform owner can see every church, under **All churches**.
- There is no church picker anywhere. Someone who volunteers at two churches opens each church's link to go to it. The platform owner opens a church from **All churches**.

## Make it your church's
Everything that identifies a church is set in the app, under **Manage → Appearance**: church name, app title, welcome line, two colors (with ready-made palettes) and a logo. Each church on the site has its own look.

Until Supabase is connected, the site runs in **demo mode**: sample data that stays in your own browser, with buttons to try each role.

## How it's built

| Part | What it does |
| --- | --- |
| `src/` | The website (React + TypeScript, built with Vite) |
| `supabase/schema.sql` | Database tables, the three roles, and the rules for who can see and change what |
| `supabase/email-setup.sql` | Turns on email sending (reminders and "Can't make it" alerts) |
| `supabase/tests/` | Automated checks of those rules |
| `e2e/demo-flow.mjs` | Automated walkthrough of every role in demo mode |
| `e2e/import-flow.mjs` | Automated check of the spreadsheet import in demo mode |
| `.github/workflows/` | Publishes the site to GitHub Pages and runs the checks on every change |

Supabase (free plan) handles sign-in and the database. GitHub Pages (free) hosts the site.

## One-time setup

### 1. Create the Supabase project
(If you already ran an older `schema.sql`, run the new one again. It's safe to re-run and adds what's missing, such as the "Can't make it" button's columns and open sign-up for events.)

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

If you set up Brevo for reminders (step 5), you can use the same account here. In Brevo, open **SMTP & API → SMTP**, and copy the **SMTP server** (`smtp-relay.brevo.com`), **Port** (`587`), **Login**, and an **SMTP key** (a different key from the API key). Use your confirmed sender address as the **Sender email**.

### 5. Email reminders and "Can't make it" alerts
The site itself can't send email (GitHub Pages only shows web pages), so the database does it: every morning it writes the reminders, and every minute it hands whatever is waiting to **Brevo**, a free email-sending service. You only set this up once, and you don't need a church web domain.

1. **Run the newest `schema.sql`** again (SQL Editor, as in step 1). It adds the email tables.
2. **Make a free Brevo account** at [brevo.com](https://www.brevo.com). Pick the free plan.
3. **Add the address emails come from.** In Brevo, open **Senders, Domains & Dedicated IPs → Senders → Add sender**. Enter a name (like the parish's name) and the email address, such as the parish office's address. Brevo emails that address a code to confirm it's yours. Volunteers' replies go to the coordinator, not to this address, but someone should still check it now and then.
4. **Make a key** in Brevo under **SMTP & API → API Keys → Generate a new API key**. Copy it; it starts with `xkeysib-`.
5. **Turn sending on** in Supabase: open **SQL Editor → New query** and paste everything from [`supabase/email-setup.sql`](supabase/email-setup.sql). At the very top, replace `PASTE-YOUR-KEY-HERE` with your key and `volunteers@your-church.org` with the sender address from step 3. Click **Run**. The key is stored in Supabase's encrypted Vault.
6. **Check it works**: under **Manage → Emails** you can see each email and whether it was sent. To try it right away, have a volunteer press **Can't make it** (the coordinator's email goes out within a minute), or run `select public.queue_reminders();` in the SQL Editor to send today's reminders now.

Good to know:
- Reminders go out at **9 am Eastern** in winter and 10 am in summer (an hour earlier in Central time). To change the time, edit the `cron.schedule('volunteer-reminders', ...)` line at the bottom of `email-setup.sql` and run it again (times there are in UTC).
- Volunteers whose card has no email address don't get reminders.
- Replies to a reminder go to the coordinator who created the event. Replies to a "Can't make it" email go to the volunteer.
- Brevo's free plan sends up to **300 emails a day**. Anything over the daily limit waits and goes out the next day.
- A parish office address delivers best. A personal Gmail, Yahoo or AOL address works, but some emails may land in spam folders, because those providers are strict about other services sending in their name. An address at the church's own domain is best of all (see below).
- To stop reminders for a church, set them to **Off** under **Manage → Emails**. To stop every email from the site, run `select cron.unschedule('volunteer-emails-send');` in the SQL Editor (running `email-setup.sql` again turns it back on).

### If the church has its own web domain
A church with its own web address (St. Peter's has `stpeterchurchcoplay.com`) can send from an address at that domain, such as `volunteers@stpeterchurchcoplay.com`. Emails from a church's own domain are less likely to land in spam. There are two ways to do it. Both need **someone who can change the domain's settings** (whoever manages the church website or registered the domain, often at GoDaddy, Squarespace, Wix or similar) to add a few lines Brevo or Resend gives you. These lines, called DNS records, prove the church owns the domain. Adding them doesn't change the website or the church's existing email.

**Option A: stay with Brevo (recommended).** Nothing else changes, and you keep the 300-emails-a-day free plan.
1. In Brevo, open **Senders, Domains & Dedicated IPs → Domains → Add a domain**, and enter the church's domain.
2. Brevo shows the records to add. Send them to the person who manages the domain. (If the domain is at a company Brevo knows, it may offer to add them for you after you sign in there.)
3. Once Brevo shows the domain as **Authenticated**, add a sender at that domain (step 3 above), confirm it, and run `email-setup.sql` again with that address. You can leave the key line as it is; the saved key is kept.

**Option B: switch to Resend.** Resend's free plan allows 100 emails a day.
1. Make a free account at [resend.com](https://resend.com) and open **Domains → Add domain**.
2. Send the records it shows to the person who manages the domain. Wait until Resend says **Verified**; this can take from a few minutes to a day.
3. Open **API Keys → Create API key** (Sending access is enough). It starts with `re_`.
4. Run `email-setup.sql` again with the Resend key and an address at the domain. The app sees it's a Resend key and switches on its own.

The "from" address doesn't need a real mailbox, because replies go to the coordinator or the volunteer. Still, if the church can create a `volunteers@` mailbox or forwarding address, people who write to it will reach someone.

## Paper cards and online sign-ups
To add many cards at once, open **Volunteers → Import spreadsheet** and download the blank template. Type one card per row (only the name is required), then upload the file as Excel (.xlsx) or CSV. From Google Sheets, use **File → Download → Microsoft Excel**. The spreadsheet from **Download spreadsheet** can also be edited and uploaded again.

Before saving, every row is shown with what will happen to it:
- Someone already in the list (same name, or same phone or email) is set to **update the existing card**. That only fills in a missing phone or email, adds new interests and adds notes. It never erases anything.
- The same person twice in the file is skipped the second time.
- Rows with no name or a broken email can't be added. After saving, **Download rows that weren't imported** gives a spreadsheet of them with the reason, to fix and upload again.
- Interests that aren't on the church's list are kept in the staff notes, so nothing written on a card is lost.

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
# Email reminders and alerts (with stand-ins for Supabase's pg_net, Vault and pg_cron)
psql -f supabase/tests/email_stub.sql
sed -e '/create extension/d' -e 's/PASTE-YOUR-KEY-HERE/xkeysib-test-key/' -e 's/volunteers@your-church.org/volunteers@example.org/' \
    -e "s#https://vmottau.github.io/PowerOfYes/'#https://example.org/app/'#" supabase/email-setup.sql | psql
psql -f supabase/tests/email_test.sql

# End-to-end walkthrough of every role in demo mode
VITE_DEMO=1 npm run build && npx vite preview --port 4173 &
npm run test:e2e
node e2e/import-flow.mjs
```

## Ideas for later
See [docs/ENHANCEMENTS.md](docs/ENHANCEMENTS.md) for the full prioritized list. Top picks:
- Text-message reminders before an event
- Attendance reports by ministry and season
- Hours served, for youth service requirements
