// End-to-end walkthrough in demo mode: volunteer signs up, coordinator assigns and marks attendance,
// volunteer sees the assignment, admin changes a role. Run: node e2e/demo-flow.mjs [baseUrl]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.argv[2] ?? "http://localhost:4173/";
const shots = process.env.SHOTS;
const errors = [];
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const ok = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("✓", msg); };
const signIn = async (email) => {
  await p.goto(base); await p.fill("#signin-email", email); await p.click("button[type=submit]");
  await p.waitForSelector("main.content h1");
};
const signOut = async () => { await p.locator("button[aria-label='Sign out']:visible").first().click(); await p.waitForSelector("#signin-email"); };

await p.goto(base); await p.evaluate(() => localStorage.clear());

// 1. volunteer signs up and fills in card
await signIn("newbie@example.org");
await p.waitForSelector("text=Fill in your volunteer card", { timeout: 5000 }); ok(true, "new volunteer sees the card form");
ok(!(await p.isVisible("a.navitem:has-text('Events')")), "volunteer has no coordinator menu");
await p.fill("#me-name", "Newbie Volunteer"); await p.fill("#me-phone", "5550100199");
await p.check("#me-m-pierogies"); await p.check("#me-m-movie-night");
await p.click("text=Save my card");
await p.waitForSelector("text=Edit my card");
ok(await p.isVisible("text=555-010-0199"), "phone was formatted and saved");
ok(await p.isVisible("text=not scheduled for anything yet"), "volunteer has no assignments yet");
if (shots) await p.screenshot({ path: shots + "/1-volunteer.png", fullPage: true });
await signOut();

// 2. coordinator: dashboard, filters, assigns
await signIn("coordinator@example.org");
await p.waitForSelector(".tile:has-text('Follow-ups due')");
ok(true, "coordinator lands on the dashboard");
if (shots) await p.screenshot({ path: shots + "/2a-dashboard.png", fullPage: true });
await p.click("a.navitem:has-text('Volunteers')");
await p.waitForSelector("article.vol:has-text('Newbie Volunteer')");
await p.click("button.chip:has-text('Pierogies')");
const n = await p.locator("article.vol").count();
ok(n === 3, `pierogies filter shows 3 volunteers (got ${n})`);
await p.check("input[aria-label='Select Newbie Volunteer']");
const optVal = await p.locator("#assign-target option", { hasText: "Fall pierogi batch" }).getAttribute("value");
await p.selectOption("#assign-target", optVal);
await p.click(".selbar >> text=Assign");
await p.waitForSelector("text=Assigned 1");
if (shots) await p.screenshot({ path: shots + "/2-directory.png", fullPage: true });
await p.click("a.navitem:has-text('Events')");
await p.click("a.ev:has-text('Fall pierogi batch')");
await p.waitForSelector(".rrow:has-text('Newbie Volunteer')");
ok(true, "assigned volunteer appears on the roster");
// add Dan via picker
await p.check(".plist label:has-text('Dan Placeholder') input");
await p.click("text=Add 1 to roster");
await p.waitForSelector(".rrow:has-text('Dan Placeholder')");
await p.click(".rrow:has-text('Dan Placeholder') button.s-attended");
await p.waitForSelector(".rrow:has-text('Dan Placeholder') button.s-attended[aria-pressed=true]");
ok(true, "attendance can be marked");
if (shots) await p.screenshot({ path: shots + "/3-event.png", fullPage: true });
// create a new event
await p.click("text=← All events"); await p.click("text=+ New event or project");
await p.fill("#ev-name", "Movie night setup"); await p.selectOption("#ev-area", "movie-night");
await p.click("dialog >> text=Save");
await p.waitForSelector("h2.title:has-text('Movie night setup')");
await p.waitForSelector(".plist label:has-text('Newbie Volunteer') .badge"); ok(true, "picker marks interested volunteers");
// follow-up from a volunteer card, then complete it
await p.click("a.navitem:has-text('Volunteers')");
await p.click("article.vol:has-text('Newbie Volunteer') >> text=Follow up");
await p.fill("#fu-note", "Call about movie night setup");
await p.click("dialog >> text=Save");
await p.waitForSelector("article.vol:has-text('Newbie Volunteer') .fu-flag");
await p.click("a.navitem:has-text('Follow-ups')");
await p.waitForSelector(".fu:has-text('Call about movie night setup')");
await p.click(".fu:has-text('Call about movie night setup') input.pick");
await p.waitForSelector("text=Marked done");
await p.waitForSelector(".fu:has-text('Call about movie night setup')", { state: "detached" });
ok(true, "follow-up can be added and completed");
// manage areas: add, rename, hide
await p.click("a.navitem:has-text('Manage')");
await p.fill("#new-area-event", "Fish Fry"); await p.click("form.newarea:has(#new-area-event) button");
await p.waitForSelector(".arearow:has-text('Fish Fry')");
await p.click(".arearow:has-text('Fish Fry') >> text=Hide");
await p.waitForSelector(".arearow.off:has-text('Fish Fry')");
ok(true, "coordinator can add and hide an area of interest");
ok(!(await p.isVisible("button[role=tab]:has-text('Appearance')")), "coordinator cannot change appearance");
if (shots) await p.screenshot({ path: shots + "/3b-manage.png", fullPage: true });
await signOut();

// 3. volunteer sees their assignment
await signIn("newbie@example.org");
await p.waitForSelector("text=Example: Fall pierogi batch");
ok(true, "volunteer sees the event they were assigned to");
ok(!(await p.isVisible("text=Movie night setup")), "volunteer doesn't see events they aren't assigned to");
await signOut();

// 4. paper card claimed by matching email
await signIn("ann@example.org");
await p.waitForSelector("text=Example: Ann Example");
await p.waitForSelector("text=You served"); ok(true, "paper-card volunteer sees past attendance after signing in");
await signOut();

// 5. admin promotes newbie to coordinator and changes the skin
await signIn("admin@example.org");
await p.click("a.navitem:has-text('Manage')");
await p.click("button[role=tab]:has-text('Appearance')");
await p.fill("#br-org", "St. Test Parish");
await p.click("button.preset:has-text('Forest')");
await p.click("text=Save appearance");
await p.waitForSelector("text=Appearance saved");
const brand = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--brand").trim());
ok(brand === "#24613f", "admin can change the colors (" + brand + ")");
ok(await p.isVisible(".brandblock:has-text('St. Test Parish')"), "church name updates in the menu");
if (shots) await p.screenshot({ path: shots + "/4b-appearance.png", fullPage: true });
await p.click("button.preset:has-text('Purple')"); await p.click("text=Save appearance"); await p.waitForTimeout(200);
await p.click("button[role=tab]:has-text('People')");
await p.selectOption("select[aria-label='Role for newbie@example.org']", "coordinator");
await p.waitForSelector("text=Role updated");
if (shots) await p.screenshot({ path: shots + "/4-admin.png", fullPage: true });
await signOut();
await signIn("newbie@example.org");
await p.waitForSelector("a.navitem:has-text('Volunteers')"); ok(true, "promoted user now sees coordinator tabs");

// phone width: no sideways scroll
await p.setViewportSize({ width: 390, height: 800 });
for (const path of ["#/home", "#/volunteers", "#/events", "#/followups", "#/manage", "#/me"]) {
  await p.goto(base + path); await p.waitForTimeout(250);
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 390, `no sideways scroll on ${path} at phone width (${w})`);
  if (shots) await p.screenshot({ path: `${shots}/5-phone-${path.slice(2)}.png`, fullPage: true });
}
await p.goto(base + "#/home"); await p.click("button[aria-label='Open menu']"); await p.waitForSelector(".sidebar.open");
ok(true, "phone menu opens");
await p.waitForTimeout(400);
if (shots) await p.screenshot({ path: shots + "/6-phone-menu.png" });
ok(errors.length === 0, "no console errors " + JSON.stringify(errors));
await b.close();
console.log("ALL E2E CHECKS PASSED");
