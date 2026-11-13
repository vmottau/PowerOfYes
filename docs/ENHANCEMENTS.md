# Enhancement ideas

A prioritized list of ideas for the Power of Yes volunteer app, based on what the app does today (November 2026). Nothing here is built yet. Pick from the top when you're ready for the next round of work.

**Effort** is a rough guess for one round of building and testing:
**S** = an afternoon, **M** = a day or two, **L** = several days or needs an outside service.

**Value** is how much it helps the people using the app: volunteers, coordinators, and church admins.

## What the app already does
So the list doesn't repeat what's there: volunteers fill in their card online and see where they're scheduled; coordinators search the directory, type in paper cards, create events, assign people, mark attendance, and keep follow-ups; admins invite coordinators and set the church's look; the platform owner adds churches. Each church has its own link and its data is kept separate.

## Tier 1: Do next
These close the biggest gaps between "list of names" and "people actually show up".

| # | Idea | Why it matters | Value | Effort |
|---|---|---|---|---|
| 1 | **Volunteers sign up for open slots themselves** | Today a coordinator has to pick and assign every person. Let coordinators mark an event "open for sign-up" and let volunteers who chose that ministry claim a spot until it's full (the event already has a "needed" number). Biggest time-saver for coordinators. | High | M |
| 2 | **Email reminders before an event** | No-shows are the most common volunteer problem. Send each assigned volunteer a reminder 2 days before (time, place, notes), using the email sender already needed for sign-in (Brevo/Resend). Runs as a Supabase scheduled function. | High | M |
| 3 | **"Can't make it" button for volunteers** | Volunteers can see where they're scheduled but can't back out, so coordinators find out on the day. A button on *My page* that frees the spot and alerts the coordinator. Pairs with #1 and #2. | High | S |
| 4 | **Message everyone in a ministry or on an event** | Coordinators need to reach "all lectors" or "everyone on Saturday's fish fry". Start simple: a button that copies all the emails (or opens a pre-filled email) for the filtered list. No outside service needed. | High | S |
| 5 | **Export to spreadsheet (CSV)** | Parish offices live in Excel. Download the directory (filtered by ministry) and event rosters. Also a safety net: the parish always has its own copy of the data. | Medium | S |
| 6 | **Printable rosters and sign-in sheets** | Many events still run on paper on the day. A print-friendly roster with names, phones and a check-off column. | Medium | S |

## Tier 2: Soon
Make it easier to run month after month.

| # | Idea | Why it matters | Value | Effort |
|---|---|---|---|---|
| 7 | **Repeating events** | Weekly Mass ministries (lectors, ushers, Eucharistic ministers) mean creating the same event over and over. "Repeat every Sunday until…" plus "copy last week's roster". | High | M |
| 8 | **Add to calendar** | A button on each scheduled event that downloads a calendar file (.ics) for Google, Apple or Outlook calendars. Later, a personal calendar feed that updates itself. | Medium | S |
| 9 | **Volunteer availability** | Let volunteers say which days/times they can serve ("weekday mornings", "not in July"), and show that when coordinators pick people. Cuts down on asking people who can't come. | Medium | M |
| 10 | **Reports: who served, how often** | Attendance by ministry and by season, most active volunteers, people who signed up but never served (great follow-up list). The data is already there from attendance marks. | Medium | M |
| 11 | **Service hours** | Add hours to events and total them per volunteer, with a printable certificate. Confirmation students, NHS and scouts need this. | Medium | M |
| 12 | **Bulk import of paper cards** | Typing cards one at a time is slow for the first big batch. Upload a spreadsheet (the parish types the cards into Excel once) and the app adds everyone, skipping duplicate emails. | High (once) | M |
| 13 | **Duplicate detection** | When someone types a paper card that matches an existing name or phone, warn before saving and offer to merge. Today only matching emails are linked. | Medium | S |
| 14 | **Text-message reminders (SMS)** | Many older parishioners read texts but not email. Same as #2 over SMS via Twilio. Costs a little per message, and needs opt-in consent. | High | L |

## Tier 3: Later
Good ideas once the basics are humming.

| # | Idea | Why it matters | Value | Effort |
|---|---|---|---|---|
| 15 | **Custom web address** | `volunteers.stmarys.org` instead of the github.io link. Mostly a DNS setting plus a small app change. | Medium | S |
| 16 | **Install on the phone home screen** | Make the site an installable app (a "PWA") so it opens like an app with the church's logo. | Medium | S |
| 17 | **Training and background checks** | Track "Safe Environment training done on…" and expiry dates for anyone working with children, with a warning when assigning someone who's expired. Important for youth ministries. | High for youth ministries | M |
| 18 | **Family sign-ups** | Let one person sign up their spouse or teens without separate emails. | Medium | M |
| 19 | **Spanish (and other languages)** | Many parishes are bilingual. Translate the screens and let each person pick a language. | Medium–High depending on parish | M |
| 20 | **Thank-you and milestone notes** | Automatic "Thank you for serving 10 times this year!" emails, and a "volunteers to thank" list for coordinators. | Low–Medium | S |
| 21 | **Public "help needed" page** | A page anyone with the church link can see listing events that still need people, to share in the bulletin or on social media. | Medium | S |
| 22 | **Coordinators limited to their ministries** | Large parishes may want the youth coordinator to see only youth volunteers. A per-ministry coordinator role. | Medium for big parishes | M |
| 23 | **Activity log** | Who changed what and when (roles, deletions). Helps admins when something goes missing. | Low | M |
| 24 | **Platform owner overview** | For you as owner: how many volunteers and events each church has, and which churches are active. | Low | S |

## Housekeeping (not features, but worth doing)
- **Backups.** Supabase's free plan doesn't keep daily backups you can restore. A monthly CSV export (#5) or a scheduled database dump keeps the parish safe.
- **Real email sender before launch.** Already in the README; it's also the foundation for #2 and #20.
- **Privacy note.** A short page saying what's stored and who can see it. Parishioners will ask.
- **Remove a volunteer's account on request.** A self-service "delete my card" button.

## Suggested order
1. Volunteers sign up themselves (#1) and "can't make it" (#3), together.
2. Email reminders (#2).
3. The quick wins: message a group (#4), CSV export (#5), print rosters (#6), add to calendar (#8).
4. Repeating events (#7) and bulk import (#12), before rolling out to more ministries.
