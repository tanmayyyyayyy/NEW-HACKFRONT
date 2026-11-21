import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const origin = process.env.TEST_ORIGIN || "http://localhost:3002";
if (!["localhost","127.0.0.1"].includes(new URL(origin).hostname)) throw Error("Use a local test server.");
const browser = await chromium.launch();
try {
  for (const width of [1280,390]) {
    const page = await browser.newPage({ viewport: {width,height:850}, reducedMotion:"reduce" });
    const faults = [];
    page.on("pageerror", e => faults.push(e.message));
    await page.goto(origin);
    await page.getByRole("button",{name:/PR #146/}).click();
    await page.getByText("19 Nov 2026 · PoonHarpoon").waitFor();
    await page.getByRole("link",{name:"Browse example traces"}).click();
    await page.getByRole("link",{name:"Investigate this trace"}).first().click();
    assert.equal(await page.getByLabel("GitHub repository").inputValue(),"AppFuton/Futon");
    assert.equal(await page.getByRole("button",{name:/Private team handover/}).count(),0);
    await page.getByRole("button",{name:"Ask about this repo"}).click();
    await page.getByRole("heading",{name:"Decision changed"}).waitFor();
    await page.getByRole("button",{name:"Authors and dates"}).click();
    await page.getByRole("button",{name:"Send follow-up"}).click();
    await page.getByRole("heading",{name:"Who recorded these changes and when?"}).waitFor();
    await page.getByText("View executed Cypher").first().click();
    const download = page.waitForEvent("download");
    await page.getByText("Download cited trail").first().click();
    assert.equal((await download).suggestedFilename(),"skillforge-decision-trail.txt");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.SCREENSHOT_DIR) await page.screenshot({path:process.env.SCREENSHOT_DIR + "/skillforge-" + width + ".png"});
    await page.getByRole("button",{name:"Try an unanswered question"}).click();
    await page.getByRole("button",{name:"Ask about this repo"}).click();
    await page.getByText("The indexed history could not establish an answer.").waitFor();
    await page.getByLabel("Recent questions").selectOption("1");
    await page.getByRole("heading",{name:"Decision changed"}).waitFor();
    await page.goto(origin + "/workspace?path=private");
    await page.waitForURL("**/account?path=private");
    await page.getByRole("radio",{name:/Public repo learning/}).check();
    await page.getByRole("link",{name:/Continue as guest/}).click();
    await page.getByRole("heading",{name:"Repository explorer"}).waitFor();
    assert.deepEqual(faults,[]);
    console.log(width + "px: sources, supersession, export, abstention, account navigation and overflow passed.");
    await page.close();
  }
} finally { await browser.close(); }
