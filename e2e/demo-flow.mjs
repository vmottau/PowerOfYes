// End-to-end walkthrough in demo mode, across two churches and every role.
// Run: node e2e/demo-flow.mjs [baseUrl]   (set CHROMIUM_PATH to use a specific Chromium; SHOTS=dir to save screenshots)
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
const shot = async (name, full = true) => { if (shots) await p.screenshot({ path: `${shots}/${name}.png`, fullPage: full }); };
const signIn = async (email, slug) => {
  await p.goto(base + (slug ? `#/c/${slug}` : "")); await p.reload();
  await p.fill("#signin-email", email); await p.click("button[type=submit]");
  await p.waitForSelector("main.content h1");
};
const signOut = async () => { await p.locator("button[aria-label='Sign out']:visible").first().click(); await p.waitForSelector("#signin-email"); };
const go = async (label) => { await p.click(`a.navitem:has-text('${label}')`); };

await p.goto(base); await p.evaluate(() => localStorage.clear());

// 1. A church link shows that church's look before sign-in
await p.goto(base + "#/c/grace"); await p.reload();
await p.waitForSelector("text=Volunteer at Grace Community Church");
ok(await p.isVisible("h1:has-text('Serve at Grace')"), "church link shows that church's name and title on sign-in");
await shot("0-signin-grace", false);

// 2. A new volunteer signs up through St. Example's link
await signIn("newbie@example.org", "st-example");
await p.waitForSelector("text=Fill in your volunteer card");
ok(true, "volunteer joined St. Example through its link");
ok(!(await p.isVisible("a.navitem:has-text('Events')")), "volunteer has no coordinator menu");
await p.fill("#me-name", "Newbie Volunteer"); await p.fill("#me-phone", "5550100199");
await p.check("#me-m-pierogies"); await p.check("#me-m-movie-night");
await p.click("text=Save my card");
await p.waitForSelector("text=Edit my card");
ok(await p.isVisible("text=555-010-0199"), "phone was formatted and saved");
await shot("1-volunteer");
await signOut();

// 3. Coordinator (invited by email) runs St. Example
await signIn("coordinator@example.org");
await p.waitForSelector(".tile:has-text('Follow-ups due')");
ok(true, "invited coordinator lands on St. Example's dashboard");
await shot("2a-dashboard");
await go("Volunteers");
await p.waitForSelector("article.vol:has-text('Newbie Volunteer')");
ok(!(await p.isVisible("text=Grace Volunteer")), "coordinator does not see another church's volunteers");
await p.click("button.chip:has-text('Pierogies')");
const n = await p.locator("article.vol").count();
ok(n === 3, `pierogies filter shows 3 volunteers (got ${n})`);
await p.check("input[aria-label='Select Newbie Volunteer']");
const optVal = await p.locator("#assign-target option", { hasText: "Fall pierogi batch" }).getAttribute("value");
await p.selectOption("#assign-target", optVal);
await p.click(".selbar >> text=Assign");
await p.waitForSelector("text=Assigned 1");
await shot("2-directory");
await go("Events");
ok(!(await p.isVisible("text=Harvest potluck")), "coordinator does not see another church's events");
await p.click("a.ev:has-text('Fall pierogi batch')");
await p.waitForSelector(".rrow:has-text('Newbie Volunteer')");
await p.check(".plist label:has-text('Dan Placeholder') input");
await p.click("text=Add 1 to roster");
await p.waitForSelector(".rrow:has-text('Dan Placeholder')");
await p.click(".rrow:has-text('Dan Placeholder') button.s-attended");
await p.waitForSelector(".rrow:has-text('Dan Placeholder') button.s-attended[aria-pressed=true]");
ok(true, "roster and attendance work");
await shot("3-event");
await go("Volunteers");
await p.click("article.vol:has-text('Newbie Volunteer') >> text=Follow up");
await p.fill("#fu-note", "Call about movie night setup");
await p.click("dialog >> text=Save");
await p.waitForSelector("article.vol:has-text('Newbie Volunteer') .fu-flag");
await go("Follow-ups");
await p.click(".fu:has-text('Call about movie night setup') input.pick");
await p.waitForSelector(".fu:has-text('Call about movie night setup')", { state: "detached" });
ok(true, "follow-up can be added and completed");
await go("Manage");
await p.fill("#new-area-event", "Fish Fry"); await p.click("form.newarea:has(#new-area-event) button");
await p.waitForSelector(".arearow:has-text('Fish Fry')");
ok(true, "coordinator can add an area of interest");
ok(!(await p.isVisible("button[role=tab]:has-text('Appearance')")), "coordinator cannot change appearance");
await signOut();

// 4. Volunteer sees their assignment
await signIn("newbie@example.org");
await p.waitForSelector("text=Example: Fall pierogi batch");
ok(true, "volunteer sees the event they were assigned to");

// 5. The same volunteer joins a second church and switches between them
await p.selectOption("select[aria-label='Switch church']", "__find");
await p.waitForSelector(".churchrow:has-text('Grace Community Church')");
await p.click(".churchrow:has-text('Grace Community Church') >> text=Join");
await p.waitForSelector("text=Fill in your volunteer card");
ok(await p.isVisible(".apptitle:has-text('Serve at Grace')"), "volunteer joined a second church and sees its look");
await signOut();

// 6. Paper-card person picks their church and gets their card and history
await signIn("ann@example.org");
await p.waitForSelector(".churchrow:has-text('St. Example Parish')");
await p.click(".churchrow:has-text('St. Example Parish') >> text=Join");
await p.waitForSelector("text=You served");
ok(true, "paper-card volunteer is linked to their card after joining");
await signOut();

// 7. Church admin: invites, roles, appearance
await signIn("admin@example.org");
await go("Manage");
await p.click("button[role=tab]:has-text('People')");
await p.waitForSelector("text=Volunteer sign-up link");
ok(await p.isVisible(".linkbox code:has-text('#/c/st-example')"), "admin sees the church's sign-up link");
await p.fill("#inv-email", "helper@example.org"); await p.selectOption("#inv-role", "coordinator");
await p.click("text=Send invite");
await p.waitForSelector(".inviterow:has-text('helper@example.org')");
await p.selectOption("select[aria-label='Role for newbie@example.org']", "coordinator");
await p.waitForSelector("text=Role updated");
ok(true, "admin can invite by email and change roles");
await shot("4a-people");
await p.click("button[role=tab]:has-text('Appearance')");
await p.fill("#br-org", "St. Example Parish & School");
await p.click("button.preset:has-text('Plum')");
await p.click("text=Save appearance");
await p.waitForSelector("text=Appearance saved");
const brand = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--brand").trim());
ok(brand === "#6b2259", "admin can change the church's colors (" + brand + ")");
await signOut();

// 8. Platform owner adds a church
await signIn("owner@example.org");
await go("All churches");
await p.fill("#ch-name", "St. Mary's Parish"); await p.fill("#ch-admin", "office@stmarys.example");
ok((await p.inputValue("#ch-slug")) === "st-mary-s-parish", "link name is suggested from the church name");
await p.fill("#ch-slug", "st-marys");
await p.click("text=Add church");
await p.waitForSelector(".churchrow:has-text(\"St. Mary's Parish\")");
ok(true, "platform owner can add a church");
await shot("5-churches");
await signOut();
await signIn("office@stmarys.example");
await p.waitForSelector(".tile:has-text('Volunteers')");
ok(await p.isVisible(".orgname:has-text(\"St. Mary's Parish\")"), "the new church's invited admin runs it on first sign-in");
ok(await p.isVisible(".tile:has-text('Volunteers') b:has-text('0')"), "a new church starts empty");

// phone width: no sideways scroll
await p.setViewportSize({ width: 390, height: 800 });
for (const path of ["#/home", "#/volunteers", "#/events", "#/followups", "#/manage", "#/me"]) {
  await p.goto(base + path); await p.waitForTimeout(250);
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 390, `no sideways scroll on ${path} at phone width (${w})`);
}
await p.click("button[aria-label='Open menu']"); await p.waitForSelector(".sidebar.open"); await p.waitForTimeout(400);
ok(true, "phone menu opens");
await shot("6-phone-menu", false);
ok(errors.length === 0, "no console errors " + JSON.stringify(errors));
await b.close();
console.log("ALL E2E CHECKS PASSED");
