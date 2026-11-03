import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const baseUrl = process.env.SMOKE_URL ?? "http://127.0.0.1:3100";
const browserPath = process.env.SMOKE_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const profile = await mkdtemp(path.join(tmpdir(), "verlinde-browser-"));
const browser = spawn(browserPath, ["--headless=new", "--no-first-run", "--disable-gpu", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
let ws;
const errors = [];
const results = [];
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Browser startup timed out")), 20000);
    browser.on("error", reject);
    browser.stderr.on("data", data => { output += data; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  const origin = new URL(endpoint).origin.replace("ws:", "http:");
  const tab = await (await fetch(`${origin}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push(message.params.args.map(arg => arg.value ?? arg.description).join(" "));
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text + " " + (message.params.exceptionDetails.exception?.description ?? ""));
    if (message.id) { const call = pending.get(message.id); if (call) { pending.delete(message.id); if (message.error) call.reject(new Error(JSON.stringify(message.error))); else call.resolve(message.result); } }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result?.value; };
  const waitFor = async (expression, label) => { const deadline = Date.now() + 15000; while (Date.now() < deadline) { if (await evaluate(`Boolean(${expression})`)) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`Timed out: ${label}`); };
  const clickText = async (selector, text) => evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => item.textContent.trim().includes(${JSON.stringify(text)})); if (!node) throw new Error('Missing element: ' + ${JSON.stringify(text)}); node.click(); return true; })()`);
  const fill = async (selector, value) => evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Missing input'); const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', {bubbles: true})); element.dispatchEvent(new Event('change', {bubbles: true})); })()`);
  const screenshot = async name => { const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); await writeFile(`artifacts/${name}.png`, Buffer.from(data, "base64")); };
  await mkdir("artifacts", { recursive: true });
  await send("Page.enable"); await send("Runtime.enable");
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clickSelector = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const point = async (selector, index = 0) => evaluate(`(() => { const node = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!node) throw new Error('Missing node: ' + ${JSON.stringify(selector)}); const rect = node.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
  const clickPointer = async selector => { const coordinates = await point(selector); await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...coordinates }); await send("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1, x: coordinates.x + 2, y: coordinates.y + 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, x: coordinates.x + 2, y: coordinates.y + 1 }); };
  const key = async (code, key, windowsVirtualKeyCode) => { await send("Input.dispatchKeyEvent", { type: "keyDown", code, key, windowsVirtualKeyCode }); await send("Input.dispatchKeyEvent", { type: "keyUp", code, key, windowsVirtualKeyCode }); await sleep(150); };
  const slotSelector = order => `[data-planning-slot][data-work-order="${order}"]`;
  const slotValues = order => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(slotSelector(order))}); if (!node) return null; return { start: Number(node.dataset.start), end: Number(node.dataset.end), date: node.parentElement.dataset.date, resource: node.parentElement.dataset.resourceId }; })()`);
  const feedback = () => evaluate("document.querySelector('[data-planner-feedback]')?.textContent ?? ''");
  const mouseDrag = async (selector, targetIndex, beforeDrop) => {
    const from = await point(selector), to = await point('[data-drop-target^="TDC-"]', targetIndex);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...from });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...from });
    for (let step = 1; step <= 16; step++) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1, x: from.x + (to.x - from.x) * step / 16, y: from.y + (to.y - from.y) * step / 16 }); await sleep(25); }
    await sleep(100);
    if (beforeDrop) await beforeDrop();
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...to });
    await sleep(150);
  };
  const resizePointer = async (order, minutes, beforeRelease) => {
    const from = await point(`${slotSelector(order)} [data-resize-edge]`);
    const to = { x: from.x, y: from.y + minutes / 600 * 260 };
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...from });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...from });
    for (let step = 1; step <= 12; step++) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1, x: to.x, y: from.y + (to.y - from.y) * step / 12 }); await sleep(25); }
    await sleep(100); if (beforeRelease) await beforeRelease();
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...to });
    await sleep(150);
  };

  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: baseUrl });
  await waitFor("document.querySelector('h1')?.textContent === 'Onderhoudsoverzicht' && document.querySelector('table tbody tr')", "maintenance ready");
  await sleep(400);
  assert.equal(await evaluate("document.documentElement.lang"), "nl");
  assert.equal(await evaluate("document.body.textContent.includes('Prototype mode') || document.body.textContent.includes('CSV-snapshot')"), false);
  await waitFor("[...document.querySelectorAll('img[alt=Verlinde]')].every(image => image.complete && image.naturalWidth > 0)", "logos loaded");
  assert.ok(await evaluate("[...document.querySelectorAll('img[alt=Verlinde]')].every(image => getComputedStyle(image).objectFit === 'contain')"));
  assert.equal(await evaluate("document.querySelectorAll('table tbody tr').length"), 193);
  assert.equal(await evaluate("document.querySelectorAll('thead th').length"), 8);
  assert.equal(await evaluate("document.querySelector('thead th:last-child').textContent.trim()"), "Afspraak");
  const initialRows = await evaluate("[...document.querySelectorAll('tbody tr')].map(row => row.dataset.sheetId)");
  const headers = await evaluate("[...document.querySelectorAll('thead button')].map(button => button.getAttribute('aria-label'))");
  for (const label of headers) {
    const selector = `thead button[aria-label="${label}"]`;
    await clickSelector(selector); assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('th').getAttribute('aria-sort')`), "ascending");
    await clickSelector(selector); assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('th').getAttribute('aria-sort')`), "descending");
    await clickSelector(selector); assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('th').getAttribute('aria-sort')`), "none");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('tbody tr')].map(row => row.dataset.sheetId)"), initialRows);
  }
  results.push("All eight headers cycle ascending, descending and default, restoring the original urgency order.");
  assert.equal(await evaluate("document.body.scrollWidth <= innerWidth"), true);
  await screenshot("maintenance-desktop");
  await fill('input[placeholder="Zoek klant of installatie…"]', "Inbraakalarm");
  await waitFor("document.querySelectorAll('table tbody tr').length < 193", "search applies");
  const filteredCount = await evaluate("document.querySelectorAll('table tbody tr').length"); assert.ok(filteredCount > 0);
  await clickText('a[href="/planning"]', "Planning");
  await waitFor("document.querySelector('h1')?.textContent === 'Planning'", "planning route");
  for (const name of ["Tom De Coninck", "Wout Vanhoutte", "Jens Maes", "Dirk Verlinde", "Brandtec (onderaannemer)"]) assert.ok(await evaluate(`document.querySelector('[aria-label=Weekplanner]').textContent.includes(${JSON.stringify(name)})`));
  const labels = await evaluate("(() => { const node = document.querySelector('[data-planning-slot]'); return { order: node.dataset.workOrder, lines: [...node.querySelectorAll('p')].map(line => line.textContent) }; })()");
  assert.notEqual(labels.lines[0], labels.order); assert.equal(labels.lines[1], labels.order);
  assert.equal(await evaluate("document.querySelectorAll('[data-backlog-order] button, [data-planning-slot] button').length"), 0);
  await screenshot("planning-desktop");
  await clickText('a[href="/"]', "Onderhoud");
  await waitFor("document.querySelector('table tbody tr')", "return maintenance");
  assert.equal(await evaluate("document.querySelectorAll('table tbody tr').length"), filteredCount);
  await fill('input[placeholder="Zoek klant of installatie…"]', "");
  await waitFor("document.querySelectorAll('table tbody tr').length === 193", "clear search");
  await clickText("table button", "Werkorder maken");
  await waitFor("document.body.textContent.includes('TEMP-001 aangemaakt')", "create order");
  await clickText('a[href="/planning"]', "Planning");
  await waitFor("document.querySelector('[data-backlog-order=\"TEMP-001\"]')", "created backlog card");
  await clickPointer('[data-backlog-order="TEMP-001"]');
  await waitFor("document.querySelector('dialog[open]')?.textContent.includes('TEMP-001')", "whole-card click opens details");
  await clickSelector('dialog button[aria-label="Sluiten"]');
  await clickText("summary", "Afspraak plannen");
  await fill('form select[id$="-order"]', "TEMP-001"); await fill("form select:not([id])", "TDC"); await fill('form input[type="date"]', "2030-01-07");
  await clickText('form button[type="submit"]', "Inplannen");
  await waitFor("document.body.textContent.includes('Werkorder ingepland')", "manual schedule");
  await fill('form input[type="date"]', "2030-01-08"); await fill("form div.grid select", "10:00");
  await clickText('form button[type="submit"]', "Verplaatsen");
  await waitFor("document.body.textContent.includes('Afspraak verplaatst')", "manual reschedule");
  await clickText('a[href="/"]', "Onderhoud"); await waitFor("document.querySelector('table tbody tr')", "appointment update");
  const appointment = await evaluate("[...document.querySelectorAll('tbody tr')].find(row => row.textContent.includes('TEMP-001')).lastElementChild.textContent");
  assert.ok(appointment.includes("08/01/2030")); assert.ok(appointment.includes("10:00–12:00")); assert.ok(appointment.includes("Tom De Coninck"));
  await clickText("table button", "TEMP-001"); await waitFor("document.querySelector('dialog[open]')?.textContent.includes('08/01/2030')", "drawer planning");
  for (let index = 0; index < 6; index++) await key("Tab", "Tab", 9);
  assert.equal(await evaluate("document.querySelector('dialog').contains(document.activeElement)"), true);
  await clickText("dialog button", "Markeren als voltooid"); await waitFor("document.body.textContent.includes('TEMP-001 voltooid')", "complete order");
  results.push("Create, manual schedule/move, appointment column, click details and completion work; filters survive navigation and modal focus is contained.");

  await clickText("table button", "Werkorder maken"); await waitFor("document.body.textContent.includes('TEMP-002 aangemaakt')", "second order");
  await clickText("table button", "Werkorder maken"); await waitFor("document.body.textContent.includes('TEMP-003 aangemaakt')", "third order");
  await clickText('a[href="/planning"]', "Planning"); await waitFor("document.querySelector('[data-backlog-order=\"TEMP-002\"]')", "drag backlog");
  await mouseDrag('[data-backlog-order="TEMP-002"]', 0, async () => {
    const text = await feedback(); assert.ok(text.includes("Tom De Coninck")); assert.ok(text.includes("08:00–10:00"));
    assert.equal(await evaluate("document.querySelector('[data-drop-preview]').dataset.invalid"), "false");
    assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 0);
    await screenshot("planning-live-preview");
  });
  await waitFor("document.querySelector('[data-work-order=\"TEMP-002\"]')", "whole-card placement");
  await mouseDrag('[data-backlog-order="TEMP-003"]', 0, async () => {
    assert.ok((await feedback()).includes("overlapt"));
    assert.equal(await evaluate("document.querySelector('[data-drop-preview]').dataset.invalid"), "true");
    await screenshot("planning-live-conflict");
  });
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('overlapt')", "rejected overlap");
  assert.ok(await evaluate("document.querySelector('[data-backlog-order=\"TEMP-003\"]') !== null"));
  await mouseDrag(slotSelector("TEMP-002"), 8);
  await waitFor("document.body.textContent.includes('Afspraak verplaatst')", "whole-block move");
  const moved = await slotValues("TEMP-002"); assert.equal(moved.end - moved.start, 120);
  assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 0);
  await evaluate("document.querySelector('[data-backlog-order=\"TEMP-003\"]').focus()");
  await key("Space", " ", 32); await key("ArrowRight", "ArrowRight", 39); await key("Space", " ", 32);
  await waitFor("document.querySelector('[data-work-order=\"TEMP-003\"]')", "keyboard placement");
  assert.equal((await slotValues("TEMP-003")).start, 480);
  await mouseDrag(slotSelector("TEMP-003"), 14);
  const conflictBooking = await slotValues("TEMP-003");
  assert.equal(conflictBooking.start, 840);
  const original = await slotValues("TEMP-002");
  await resizePointer("TEMP-002", 120, async () => {
    assert.ok((await feedback()).includes("Eindtijd")); assert.ok((await feedback()).includes("overlapt"));
    assert.equal(await evaluate("document.querySelector('[data-planner-feedback]').dataset.invalid"), "true");
    assert.deepEqual(await slotValues("TEMP-002"), original);
    await screenshot("planning-resize-conflict");
  });
  assert.deepEqual(await slotValues("TEMP-002"), original);
  await resizePointer("TEMP-002", 60, async () => {
    assert.ok((await feedback()).includes("Eindtijd 14:00"));
    assert.equal(await evaluate("document.querySelector('[data-planner-feedback]').dataset.invalid"), "false");
  });
  await waitFor("document.body.textContent.includes('Duur aangepast')", "edge resize committed");
  const resized = await slotValues("TEMP-002"); assert.equal(resized.end, 840); assert.equal(resized.start, original.start); assert.equal(resized.date, original.date); assert.equal(resized.resource, original.resource);
  await evaluate("document.querySelector('[data-work-order=\"TEMP-002\"] [data-resize-edge]').focus()");
  await key("ArrowUp", "ArrowUp", 38);
  assert.equal((await slotValues("TEMP-002")).end, 810);
  await waitFor("!document.querySelector('[data-planner-feedback]')", "keyboard resize feedback ends");
  await mouseDrag(slotSelector("TEMP-002"), 28);
  const afterResizeMove = await slotValues("TEMP-002"); assert.equal(afterResizeMove.end - afterResizeMove.start, 150);
  await clickPointer(slotSelector("TEMP-002")); await waitFor("document.querySelector('dialog[open]')", "click block after drag still works");
  await clickSelector('dialog button[aria-label="Sluiten"]');
  await screenshot("planning-dragged");
  results.push("Whole cards/blocks drag directly; live time and invalid-target previews agree with commits; resize is snapped, preserves other fields, rejects conflicts, works by keyboard and changes subsequent move duration.");

  // A real touch long-press drags the whole remaining backlog card without a handle.
  const touchOrder = await evaluate("document.querySelector('[data-backlog-order]').dataset.backlogOrder");
  const from = await point(`[data-backlog-order="${touchOrder}"]`), to = await point('[data-drop-target^="TDC-"]', 40);
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 1, radiusX: 1, radiusY: 1, force: 1 }] }); await sleep(250);
  for (let step = 1; step <= 14; step++) { await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (to.x - from.x) * step / 14, y: from.y + (to.y - from.y) * step / 14, id: 1, radiusX: 1, radiusY: 1, force: 1 }] }); await sleep(25); }
  assert.ok((await feedback()).includes("08:00–10:00"));
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await waitFor(`document.querySelector('[data-planning-slot][data-work-order="${touchOrder}"]')`, "touch placement");
  const touchSlot = await slotValues(touchOrder);
  const edge = await point(`${slotSelector(touchOrder)} [data-resize-edge]`);
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...edge, id: 2, radiusX: 1, radiusY: 1, force: 1 }] }); await sleep(100);
  for (let step = 1; step <= 8; step++) { await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: edge.x, y: edge.y + 13 * step / 8, id: 2, radiusX: 1, radiusY: 1, force: 1 }] }); await sleep(25); }
  assert.ok((await feedback()).includes("Eindtijd 10:30"));
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(150);
  assert.equal((await slotValues(touchOrder)).end, touchSlot.end + 30);
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  results.push("Long-press touch dragging and touch edge resizing operate directly on cards/blocks; small pointer movement still opens details.");

  await send("Page.reload"); await waitFor("document.querySelector('h1')?.textContent === 'Planning' && !document.body.textContent.includes('TEMP-001') && !document.body.textContent.includes('TEMP-002') && !document.body.textContent.includes('TEMP-003')", "reload resets source");
  await clickText('a[href="/"]', "Onderhoud"); await waitFor("document.querySelector('table tbody tr')", "maintenance after reload");
  await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 1100, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate("document.body.scrollWidth <= innerWidth"), true); await screenshot("maintenance-tablet");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(300);
  assert.equal(await evaluate("document.body.scrollWidth <= innerWidth"), true); await screenshot("maintenance-mobile");
  await clickSelector('[aria-label="Menu openen"]'); await clickText('a[href="/planning"]', "Planning");
  await waitFor("document.querySelector('[aria-label=Weekplanner] h3')", "mobile day planner"); assert.equal(await evaluate("document.body.scrollWidth <= innerWidth"), true);
  await evaluate("document.querySelector('[aria-label=Weekplanner]').scrollIntoView({block: 'start'})"); await screenshot("planning-mobile");
  await clickSelector('[aria-label="Gegevensproblemen tonen"]'); await waitFor("document.querySelector('dialog[open]')", "data issues");
  await clickText("dialog button", "Informatie"); await fill("dialog input", "Nulduur");
  await waitFor("document.querySelectorAll('dialog article').length === 24", "24 zero-duration rows are informative");
  await clickText("dialog details summary", "Details");
  assert.ok(await evaluate("document.querySelector('dialog article details[open]').textContent.includes('van: 10:00') && document.querySelector('dialog article details[open]').textContent.includes('tot: 10:00')"));
  await screenshot("data-issues-mobile");
  assert.deepEqual(errors, []);
  results.push("Reload restores CSV state; tablet/mobile fit the viewport; all 24 original zero-duration rows remain inspectable as information; no browser exceptions.");
  console.log(JSON.stringify({ passed: results, screenshots: "artifacts/*.png" }, null, 2));

} finally {
  ws?.close(); browser.kill();
  await new Promise(resolve => browser.exitCode !== null ? resolve() : browser.once("exit", resolve));
  // Remove only the dedicated, resolved temporary profile owned by this test.
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) === path.resolve(tmpdir()) && path.basename(resolved).startsWith("verlinde-browser-")) {
    await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  }
}
