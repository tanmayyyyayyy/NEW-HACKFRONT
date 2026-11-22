import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const origin = process.env.TEST_ORIGIN || "http://localhost:3002";
if (!["localhost","127.0.0.1"].includes(new URL(origin).hostname)) throw Error("Use a local test server.");
const browser = await chromium.launch();
try {
  for (const width of [1280,390]) {
    const page = await browser.newPage({ viewport: {width,height:850}, reducedMotion:"reduce" });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: {
        writeText: async (text) => {
          if (text.startsWith("MATCH (scope:")) throw new Error("Fixture clipboard denial");
        },
      } });
      Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: class {
        start() { queueMicrotask(() => this.onstart?.()); }
        stop() {
          this.onresult?.({ results: [[{ transcript: "How does smart resume work?" }]] });
          this.onend?.();
        }
        abort() { this.onend?.(); }
      } });
      Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
        getVoices: () => [],
        cancel: () => {},
        speak: (utterance) => {
          document.documentElement.dataset.spoken = utterance.text;
          queueMicrotask(() => utterance.onend?.());
        },
      } });
    });
    const faults = [];
    page.on("pageerror", e => faults.push(e.message));
    const graphFixture = {
      repository: "AppFuton/Futon", revision: "a".repeat(40),
      nodes: [
        { id: "folder:", label: "Futon", detail: "/", kind: "folder" },
        { id: "file:src/reader.ts", label: "reader.ts", detail: "src/reader.ts", kind: "file", url: "https://github.com/AppFuton/Futon/blob/main/src/reader.ts" },
        { id: "pull:146", label: "#146", detail: "New default", kind: "pull" },
        { id: "pull:112", label: "#112", detail: "Earlier option", kind: "pull" },
      ],
      edges: [
        { from: "folder:", to: "file:src/reader.ts", kind: "CONTAINS" },
        { from: "pull:146", to: "pull:112", kind: "SUPERSEDES" },
      ],
      coverage: { files: 1, importFiles: 0, treePartial: false, historyPartial: true },
    };
    await page.route("**/api/graph?*", route => route.fulfill({ json: graphFixture }));
    await page.goto(origin + "/graph?repo=example%2Ffirst&repo=example%2Fsecond");
    assert.equal(await page.getByLabel("GitHub repository", { exact: true }).inputValue(), "example/first");
    await page.getByRole("button", { name: "Index repository", exact: true }).click();
    await page.getByRole("button", { name: /Decision conflicts/ }).click();
    await page.getByRole("heading", { name: "Decisions that changed" }).waitFor();
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const spatial = page.getByRole("group", { name: "3D repository diagram" });
    const neighbour = spatial.getByRole("button", { name: /#112/ });
    const before = await neighbour.getAttribute("style");
    await page.getByRole("button", { name: "Rotate right" }).click();
    assert.notEqual(await neighbour.getAttribute("style"), before);
    await neighbour.click();
    await page.getByRole("button", { name: "2D", exact: true }).click();
    assert.equal(await page.getByRole("complementary", { name: "Graph nodes" }).getByRole("button", { name: /#112/ }).getAttribute("aria-pressed"), "true");
    await page.getByRole("link", { name: "Open in chat" }).click();
    assert.equal(await page.getByLabel("GitHub repository").inputValue(), "AppFuton/Futon");
    const demoApiCalls = [];
    const recordApiCall = request => {
      if (new URL(request.url()).pathname.startsWith("/api/")) demoApiCalls.push(request.url());
    };
    page.on("request", recordApiCall);
    await page.goto(origin);
    await page.getByRole("link",{name:"Try a real decision"}).click();
    await page.getByRole("heading",{name:"Waiting became the default"}).waitFor();
    await page.getByRole("button",{name:/PR #112/}).click();
    await page.getByRole("heading",{name:"Waiting was optional"}).waitFor();
    assert.equal(await page.getByRole("link",{name:/Open PR #112 on GitHub/}).getAttribute("href"),"https://github.com/AppFuton/Futon/pull/112");
    await page.getByText("PR #146 removes reader_smart_resume_wait",{exact:true}).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const noteDownload = page.waitForEvent("download");
    await page.getByRole("link",{name:"Download handover note"}).click();
    const note = await noteDownload;
    assert.equal(note.suggestedFilename(),"chapter-updates-handover.md");
    assert.match(await readFile(await note.path(), "utf8"), /https:\/\/github\.com\/AppFuton\/Futon\/pull\/146\/files/);
    await page.getByRole("link",{name:/When did the original CI workflow disappear/}).click();
    await page.getByText("Its message gives no reason for removing the checks specifically.",{exact:false}).waitFor();
    assert.deepEqual(demoApiCalls,[]);
    page.off("request", recordApiCall);
    await page.getByRole("link",{name:"← Trace library"}).click();
    await page.getByRole("link",{name:/Investigate this trace/}).first().click();
    await page.getByRole("link",{name:"Run this question in the workspace"}).click();
    assert.equal(await page.getByLabel("GitHub repository").inputValue(),"AppFuton/Futon");
    assert.equal(await page.getByRole("button",{name:/Private team handover/}).count(),0);
    const question = page.getByRole("textbox",{name:"Question",exact:true});
    const originalQuestion = await question.inputValue();
    await question.fill("");
    await page.getByRole("button",{name:"Dictate question",exact:true}).click();
    await page.getByRole("button",{name:"Stop dictation",exact:true}).click();
    assert.equal(await question.inputValue(),"How does smart resume work?");
    await page.getByRole("button",{name:"Read question aloud",exact:true}).click();
    assert.equal(await page.locator("html").getAttribute("data-spoken"),"How does smart resume work?");
    await question.fill(originalQuestion);
    await page.getByRole("button",{name:"Ask about this repo"}).click();
    await page.getByRole("heading",{name:"Decision changed"}).waitFor();
    const repository = page.getByLabel("GitHub repository");
    await repository.fill("example/different");
    await page.getByRole("heading", { name: "Decision changed" }).waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await repository.inputValue(), "AppFuton/Futon");
    if (process.env.SCREENSHOT_DIR) await page.screenshot({path:process.env.SCREENSHOT_DIR + "/skillforge-" + width + ".png",fullPage:true});
    const conversation = page.getByRole("log", { name: "Conversation" });
    await conversation.evaluate(log => { log.scrollTop = log.scrollHeight; });
    const disclosure = await page.getByText("View executed Cypher", { exact: true }).boundingBox();
    const editorBounds = await question.boundingBox();
    assert(disclosure && editorBounds && disclosure.y + disclosure.height < editorBounds.y);
    if (process.env.SCREENSHOT_DIR) await page.screenshot({path:process.env.SCREENSHOT_DIR + "/answer-end-" + width + ".png",fullPage:true});
    await page.getByRole("button",{name:"Authors and dates"}).click();
    await page.getByRole("button",{name:"Send follow-up"}).click();
    await page.getByRole("heading",{name:"Who recorded these changes and when?"}).waitFor();
    await page.getByRole("button",{name:"Copy handover note"}).first().click();
    await page.getByText("Handover note copied!",{exact:true}).waitFor();
    await page.getByText("View executed Cypher").first().click();
    await page.getByRole("button",{name:"Copy query"}).click();
    await page.getByText("Could not copy to the clipboard.",{exact:true}).waitFor();
    const download = page.waitForEvent("download");
    await page.getByText("Download cited trail").first().click();
    assert.equal((await download).suggestedFilename(),"skillforge-decision-trail.txt");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole("button", { name: "Attach files" }).click();
    await page.getByRole("searchbox", { name: "Search indexed files" }).fill("reader.ts");
    await page.getByRole("button", { name: /src\/reader\.ts/ }).click();
    await page.getByRole("button", { name: "Done" }).click();
    let filePayload;
    const attachedAsk = async route => {
      filePayload = route.request().postDataJSON();
      await route.fulfill({ json: {
        evidence: [], throughDate: null, recordCount: 0, matchBasis: "Insufficient evidence", query: "",
      } });
    };
    await page.route("**/api/ask", attachedAsk);
    await question.fill("What changed in the attached file?");
    await question.press("Enter");
    await page.getByRole("link", { name: "src/reader.ts" }).waitFor();
    await page.getByText("No matching evidence was found for the attached files.").waitFor();
    assert.deepEqual(filePayload.files, ["src/reader.ts"]);
    assert.equal(await page.getByRole("list", { name: "Attached files" }).count(), 0);
    await page.unroute("**/api/ask", attachedAsk);
    await question.fill("Why does Futon use Kubernetes for billing?");
    await question.press("Enter");
    await page.getByText("The indexed history could not establish an answer.").waitFor();
    await page.getByRole("heading",{name:"Decision changed"}).first().waitFor();
    await repository.fill("example/different");
    await page.getByRole("button", { name: "Switch repository" }).click();
    await page.getByRole("heading", { name: "What changed, and why?" }).waitFor();
    await page.goto(origin + "/workspace?path=private");
    await page.waitForURL("**/account?path=private");
    await page.getByRole("radio",{name:/Public repo learning/}).check();
    await page.getByRole("link",{name:/Continue as guest/}).click();
    await page.getByRole("heading",{name:"Repository explorer"}).waitFor();
    assert.deepEqual(faults,[]);
    console.log(width + "px: graph modes, guided examples, dictation, attachments, conversation, exports and account navigation passed.");
    await page.close();
  }
} finally { await browser.close(); }
