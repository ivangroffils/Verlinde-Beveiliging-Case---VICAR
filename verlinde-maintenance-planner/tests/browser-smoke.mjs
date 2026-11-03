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
  const rowSelector = id => `[data-maintenance-row="${id}"]`;
  await send("Page.navigate", { url: baseUrl });
  await waitFor("document.querySelector('h1')?.textContent === 'Onderhoudsoverzicht' && document.querySelectorAll('[data-maintenance-row]').length === 193", "maintenance table ready");
  await sleep(400);
  assert.equal(await evaluate("document.documentElement.lang"), "nl");
  assert.equal(await evaluate("document.querySelectorAll('table').length"), 1);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('thead th')].map(node => node.textContent.trim())"), ["Klant / installatie", "Type", "Volgend onderhoud", "Urgentie", "Werkbonopvolging", "Actieve WO", "Afspraak", "Actie"]);
  assert.equal(await evaluate("document.body.textContent.includes('Prototype mode') || document.body.textContent.includes('CSV-snapshot') || document.body.textContent.includes('Controle nodig')"), false);
  await waitFor("[...document.querySelectorAll('img[alt=Verlinde]')].every(image => image.complete && image.naturalWidth > 0)", "logos loaded");
  assert.ok(await evaluate("[...document.querySelectorAll('img[alt=Verlinde]')].every(image => getComputedStyle(image).objectFit === 'contain')"));
  assert.ok(await evaluate("[...document.querySelectorAll('[data-maintenance-row]')].every(node => node.querySelectorAll('[data-urgency]').length === 1 && node.querySelectorAll('[data-follow-up]').length === 1)"));
  assert.equal(await evaluate("document.querySelectorAll('[data-maintenance-row] details').length"), 0);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-summary]')].map(node => node.querySelector('span').textContent)"), ["Achterstallig", "Binnenkort", "Te plannen", "Gepland"]);
  const initialRows = await evaluate("[...document.querySelectorAll('[data-maintenance-row]')].map(node => node.dataset.maintenanceRow)");
  for (const value of ["urgency:asc", "urgency:desc", "nextDate:asc", "nextDate:desc", "customer:asc", "customer:desc", "status:asc", "status:desc"]) {
    await fill('[aria-label="Sorteer onderhoud"]', value);
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Sorteer onderhoud\"]').value"), value);
    await fill('[aria-label="Sorteer onderhoud"]', "default");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-maintenance-row]')].map(node => node.dataset.maintenanceRow)"), initialRows);
  }
  const sortHeaders = await evaluate("[...document.querySelectorAll('thead button')].map(node => node.getAttribute('aria-label'))");
  for (const label of sortHeaders) {
    const selector = `thead button[aria-label="${label}"]`;
    await clickSelector(selector); assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('th').getAttribute('aria-sort')`), "ascending");
    await clickSelector(selector); assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('th').getAttribute('aria-sort')`), "descending");
    await clickSelector(selector); assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('th').getAttribute('aria-sort')`), "none");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-maintenance-row]')].map(node => node.dataset.maintenanceRow)"), initialRows);
  }
  const priorityOrder = ["overdue:to-start", "overdue:to-plan", "overdue:check-closure", "overdue:planned", "upcoming:to-start", "upcoming:to-plan", "missing:to-start", "missing:to-plan", "upcoming:check-closure", "missing:check-closure", "upcoming:planned", "missing:planned", "ok:check-closure", "ok:to-plan", "ok:planned", "ok:to-start"];
  const ranks = (await evaluate("[...document.querySelectorAll('[data-maintenance-row]')].map(node => node.dataset.maintenanceUrgency + ':' + node.dataset.maintenanceState)")).map(pair => priorityOrder.indexOf(pair));
  assert.ok(ranks.every((rank, index) => rank >= 0 && (!index || rank >= ranks[index - 1])));
  for (const filter of ["overdue", "upcoming", "to-plan", "planned"]) {
    await clickSelector(`[data-summary="${filter}"]`);
    assert.equal(await evaluate(`document.querySelector('[data-summary="${filter}"]').getAttribute('aria-pressed')`), "true");
    assert.ok(await evaluate(`[...document.querySelectorAll('[data-maintenance-row]')].every(node => node.dataset.maintenanceUrgency === '${filter}' || node.dataset.maintenanceState === '${filter}')`));
    await clickSelector(`[data-summary="${filter}"]`);
    await waitFor("document.querySelectorAll('[data-maintenance-row]').length === 193", "clear summary filter");
  }
  await fill('[aria-label="Filter onderhoud"]', "missing");
  assert.equal(await evaluate("document.querySelectorAll('[data-maintenance-row]').length"), 185);
  assert.ok(await evaluate("[...document.querySelectorAll('[data-maintenance-row]')].every(node => node.dataset.maintenanceUrgency === 'missing')"));
  await screenshot("maintenance-unknown");
  await fill('[aria-label="Filter onderhoud"]', "check-closure");
  assert.ok(await evaluate("[...document.querySelectorAll('[data-maintenance-row]')].every(node => node.dataset.maintenanceState === 'check-closure')"));
  await fill('[aria-label="Filter onderhoud"]', "all");
  results.push("Compact table has exactly eight columns and both status badges; all column headers sort in both directions and reset to the 16 requested priority groups; summary filters and unknown-date access work.");
  for (const id of ["1004", "1062"]) assert.equal(await evaluate(`document.querySelector('${rowSelector(id)}').dataset.maintenanceState`), "check-closure");
  assert.equal(await evaluate(`document.querySelector('${rowSelector("1197")}').dataset.maintenanceState`), "planned");
  assert.ok(await evaluate(`document.querySelector('${rowSelector("1197")} [data-appointment]').textContent.includes('16/11/2026')`));
  await clickSelector(`${rowSelector("1197")} td:nth-child(2)`);
  await waitFor(`document.querySelector('dialog [data-current-work-order="WB2026-0248"][data-work-order-state=planned]')`, "1197 current work order");
  const appointmentText = await evaluate(`document.querySelector('dialog [data-current-work-order="WB2026-0248"]').textContent`);
  for (const value of ["16/11/2026", "08:00–16:00", "Wout Vanhoutte"]) assert.ok(appointmentText.includes(value));
  assert.equal(await evaluate("document.querySelector('dialog [data-maintenance-warnings]').open"), false);
  await clickText('dialog summary', "Gegevensmeldingen");
  assert.ok(await evaluate("document.querySelector('dialog [data-reason-code=inconsistent-maintenance-dates]') !== null"));
  await clickText('dialog summary', "Onderhoudshistorie"); await clickText('dialog details summary', "WB2026-0248");
  assert.ok(await evaluate("document.querySelector('dialog [data-history-planning]').textContent.includes('16/11/2026')"));
  await screenshot("maintenance-1197-planned");
  await clickText('dialog a', "Afspraak bekijken");
  await waitFor(`document.querySelector('[data-work-order="WB2026-0248"]')`, "appointment link opens correct week");
  assert.equal(new URL(await evaluate("location.href")).searchParams.get("wo"), "WB2026-0248");
  const relevant = await slotValues("WB2026-0248"); assert.equal(relevant.date, "2026-11-16"); assert.equal(relevant.resource, "WVH");
  await clickText('a[href="/"]', "Onderhoud"); await waitFor("document.querySelector('[data-maintenance-row]')", "return maintenance");
  assert.equal(await evaluate(`document.querySelector('${rowSelector("1089")}').dataset.maintenanceState`), "to-plan");
  assert.equal(await evaluate(`document.querySelector('${rowSelector("1089")} [data-active-work-order]').dataset.activeWorkOrder`), "WB2025-0163");
  await evaluate(`document.querySelector('${rowSelector("1089")}').focus()`); await key("Enter", "Enter", 13); await waitFor("document.querySelector('dialog[open]')", "keyboard row opens Lieve history");
  await clickText('dialog summary', "Onderhoudshistorie");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('dialog [data-history-work-order]')].map(node => node.dataset.historyWorkOrder)"), ["WB2026-0037", "WB2025-0163", "WB2023-0007"]);
  await clickText('dialog details summary', "WB2026-0037");
  assert.ok(await evaluate("document.querySelector('dialog [data-history-execution]').textContent.includes('15/02/2026')"));
  assert.ok(await evaluate("document.querySelector('dialog [data-history-work-order]').textContent.includes('Completed')"));
  await clickSelector('dialog button[aria-label="Sluiten"]');
  await clickText(`${rowSelector("1089")} a`, "Plannen");
  await waitFor(`document.querySelector('details[data-selected-order="WB2025-0163"][open]')`, "past-only WO selected for planning");
  const selectedWeek = await evaluate(`document.querySelector('[data-resource-id="TDC"][data-date]').dataset.date`);
  await clickText('[aria-label=Weekplanner] button', "Vandaag");
  assert.equal(await evaluate(`document.querySelector('[data-resource-id="TDC"][data-date]').dataset.date`), selectedWeek);
  await clickText('a[href="/"]', "Onderhoud"); await waitFor("document.querySelector('[data-maintenance-row]')", "return from past WO planning");
  await clickText(`${rowSelector("1004")} button`, "Afsluiting controleren");
  await waitFor("document.querySelector('dialog[open] h2')?.textContent === 'Werkorder'", "direct closure action");
  assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('02/11/2026')"));
  await clickText('dialog button', "Markeren als voltooid");
  await waitFor(`document.querySelector('${rowSelector("1004")}').dataset.maintenanceState === 'to-start'`, "closed work no longer operational");
  assert.equal(await evaluate(`document.querySelector('${rowSelector("1004")}').dataset.maintenanceUrgency`), "overdue");
  assert.equal(await evaluate(`document.querySelector('${rowSelector("1004")} [data-active-work-order]').dataset.activeWorkOrder`), "");
  results.push("Real Hoeve Sabbe and Verschuere need closure; De Leie opens its correct future appointment; Lieve keeps its active WO while chronological history preserves separate PL/EX records.");
  await screenshot("maintenance-desktop");
  assert.equal(await evaluate("document.body.scrollWidth <= innerWidth"), true);
  await fill('[aria-label="Sorteer onderhoud"]', "customer:desc");
  await fill('input[placeholder="Zoek klant of installatie…"]', "Inbraakalarm");
  const filteredCount = await evaluate("document.querySelectorAll('[data-maintenance-row]').length"); assert.ok(filteredCount > 0 && filteredCount < 193);
  await clickText('a[href="/planning"]', "Planning"); await waitFor("document.querySelector('h1')?.textContent === 'Planning'", "planning route");
  for (const name of ["Tom De Coninck", "Wout Vanhoutte", "Jens Maes", "Dirk Verlinde", "Brandtec (onderaannemer)"]) assert.ok(await evaluate(`document.querySelector('[aria-label=Weekplanner]').textContent.includes(${JSON.stringify(name)})`));
  assert.equal(await evaluate("document.querySelectorAll('[data-backlog-order] button, [data-planning-slot] button').length"), 0);
  await screenshot("planning-desktop");
  await clickText('a[href="/"]', "Onderhoud"); await waitFor("document.querySelector('[data-maintenance-row]')", "saved search");
  assert.equal(await evaluate("document.querySelectorAll('[data-maintenance-row]').length"), filteredCount);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Sorteer onderhoud\"]').value"), "customer:desc");
  await fill('input[placeholder="Zoek klant of installatie…"]', ""); await fill('[aria-label="Sorteer onderhoud"]', "default");
  const createdSheet = await evaluate("document.querySelector('[data-maintenance-state=to-start][data-maintenance-urgency=overdue]').dataset.maintenanceRow");
  await clickText(`${rowSelector(createdSheet)} button`, "Werkorder maken"); await waitFor("document.body.textContent.includes('TEMP-001 aangemaakt')", "create order");
  assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 0);
  assert.equal(await evaluate(`document.querySelector('${rowSelector(createdSheet)}').dataset.maintenanceState`), "to-plan");
  await clickSelector('[data-summary="to-plan"]');
  await clickText(`${rowSelector(createdSheet)} a`, "Plannen");
  await waitFor("document.querySelector('details[data-selected-order=\"TEMP-001\"][open]')", "selected new WO");
  assert.equal(await evaluate("new URL(location.href).searchParams.get('wo')"), "TEMP-001");
  assert.equal(await evaluate("document.activeElement?.dataset.backlogOrder"), "TEMP-001");
  await clickPointer('[data-backlog-order="TEMP-001"]'); await waitFor("document.querySelector('dialog[open]')", "whole-card details");
  await clickSelector('dialog button[aria-label="Sluiten"]');
  const clickTarget = await evaluate(`[...document.querySelectorAll('[data-click-target=true][data-drop-target^="TDC-"]')].filter(node => node.getAttribute('aria-label').endsWith('Beschikbaar')).at(-1).dataset.dropTarget`);
  await clickSelector(`[data-drop-target="${clickTarget}"]`); await waitFor("document.body.textContent.includes('Werkorder ingepland')", "click scheduling");
  if (!await evaluate("[...document.querySelectorAll('details')].find(node => node.querySelector('summary')?.textContent.includes('Afspraak plannen')).open")) await clickText("summary", "Afspraak plannen");
  await fill('form select[id$="-order"]', "TEMP-001"); await fill("form select:not([id])", "TDC"); await fill('form input[type="date"]', "2030-01-07"); await fill("form div.grid select", "08:00");
  await clickText('form button[type="submit"]', "Verplaatsen"); await waitFor("document.body.textContent.includes('Afspraak verplaatst')", "manual move");
  await fill('form input[type="date"]', "2030-01-08"); await fill("form div.grid select", "10:00"); await clickText('form button[type="submit"]', "Verplaatsen");
  await clickText('a[href="/"]', "Onderhoud"); await waitFor("document.querySelector('[aria-label=\"Filter onderhoud\"]')", "saved filter");
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Filter onderhoud\"]').value"), "to-plan");
  await fill('[aria-label="Filter onderhoud"]', "all");
  assert.equal(await evaluate(`document.querySelector('${rowSelector(createdSheet)}').dataset.maintenanceState`), "planned");
  const appointment = await evaluate(`document.querySelector('${rowSelector(createdSheet)} [data-appointment]').textContent`);
  for (const text of ["08/01/2030", "10:00–12:00", "Tom De Coninck"]) assert.ok(appointment.includes(text));
  await clickText(`${rowSelector(createdSheet)} a`, "Afspraak bekijken");
  await waitFor("document.querySelector('[data-work-order=\"TEMP-001\"]')", "planned new WO focused");
  assert.deepEqual(await slotValues("TEMP-001"), { start: 600, end: 720, date: "2030-01-08", resource: "TDC" });
  await clickPointer(slotSelector("TEMP-001")); await waitFor("document.querySelector('dialog[open]')", "planned WO details");
  for (let index = 0; index < 6; index++) await key("Tab", "Tab", 9);
  assert.equal(await evaluate("document.querySelector('dialog').contains(document.activeElement)"), true);
  await clickText('dialog button', "Markeren als voltooid"); await waitFor("document.body.textContent.includes('TEMP-001 voltooid')", "complete new WO");
  await clickText('a[href="/"]', "Onderhoud"); await waitFor(`document.querySelector('${rowSelector(createdSheet)}')?.dataset.maintenanceState === 'to-start'`, "closed WO stays history");
  assert.equal(await evaluate(`document.querySelector('${rowSelector(createdSheet)} [data-active-work-order]').dataset.activeWorkOrder`), "");
  await clickSelector(`${rowSelector(createdSheet)} td:first-child button`); await waitFor("document.querySelector('dialog[open]')", "completed history");
  await clickText('dialog summary', "Onderhoudshistorie"); await clickText('dialog details summary', "TEMP-001");
  assert.equal(await evaluate("document.querySelector('[data-history-work-order=TEMP-001] [data-history-execution]').children.length"), 1);
  assert.ok(await evaluate("document.querySelector('[data-history-work-order=TEMP-001]').textContent.includes('Voltooid')"));
  await clickSelector('dialog button[aria-label="Sluiten"]');
  results.push("Create → selected WO → click schedule → move → appointment navigation → complete recalculates both statuses, retains history and navigation preferences, and never changes maintenance dates.");

  await clickText(`${rowSelector(createdSheet)} button`, "Werkorder maken"); await waitFor("document.body.textContent.includes('TEMP-002 aangemaakt')", "second order");

  await clickText('a[href="/planning"]', "Planning"); await waitFor("document.querySelector('[data-backlog-order=\"TEMP-002\"]')", "drag backlog");
  const thirdOrder = await evaluate("[...document.querySelectorAll('[data-backlog-order]')].find(node => node.dataset.backlogOrder !== 'TEMP-002').dataset.backlogOrder");
  await mouseDrag('[data-backlog-order="TEMP-002"]', 0, async () => {
    const text = await feedback(); assert.ok(text.includes("Tom De Coninck")); assert.ok(text.includes("08:00–10:00"));
    assert.equal(await evaluate("document.querySelector('[data-drop-preview]').dataset.invalid"), "false");
    assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 0);
    await screenshot("planning-live-preview");
  });
  await waitFor("document.querySelector('[data-work-order=\"TEMP-002\"]')", "whole-card placement");
  await mouseDrag(`[data-backlog-order="${thirdOrder}"]`, 0, async () => {
    assert.ok((await feedback()).includes("overlapt"));
    assert.equal(await evaluate("document.querySelector('[data-drop-preview]').dataset.invalid"), "true");
    await screenshot("planning-live-conflict");
  });
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('overlapt')", "rejected overlap");
  assert.ok(await evaluate(`document.querySelector('[data-backlog-order="${thirdOrder}"]') !== null`));
  await mouseDrag(slotSelector("TEMP-002"), 8);
  await waitFor("document.body.textContent.includes('Afspraak verplaatst')", "whole-block move");
  const moved = await slotValues("TEMP-002"); assert.equal(moved.end - moved.start, 120);
  assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 0);
  await evaluate(`document.querySelector('[data-backlog-order="${thirdOrder}"]').focus()`);
  await key("Space", " ", 32); await key("ArrowRight", "ArrowRight", 39); await key("Space", " ", 32);
  await waitFor(`document.querySelector('[data-work-order="${thirdOrder}"]')`, "keyboard placement");
  assert.equal((await slotValues(thirdOrder)).start, 480);
  await mouseDrag(slotSelector(thirdOrder), 14);
  const conflictBooking = await slotValues(thirdOrder);
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
  await clickText('a[href="/"]', "Onderhoud"); await waitFor("document.querySelector('[data-maintenance-row]')", "maintenance after reload");
  assert.equal(await evaluate(`document.querySelector('[data-maintenance-row="1004"]').dataset.maintenanceState`), "check-closure");
  const sourcePlanned = await evaluate("document.querySelector('[data-maintenance-state=planned] [data-active-work-order]').dataset.activeWorkOrder");
  await send("Page.navigate", { url: `${baseUrl}/planning?wo=${encodeURIComponent(sourcePlanned)}` });
  await waitFor(`document.querySelector('[data-work-order="${sourcePlanned}"]')`, "direct planned WO navigation");
  await send("Page.navigate", { url: `${baseUrl}/planning?wo=WB2023-0090` });
  await waitFor(`document.querySelector('[data-work-order="WB2023-0090"][data-appointment-kind=history]')`, "historical calendar navigation");
  assert.equal(await evaluate(`document.querySelectorAll('[data-work-order="WB2023-0090"] [data-resize-edge]').length`), 0);
  assert.equal(await evaluate(`document.querySelectorAll('[data-backlog-order="WB2023-0090"]').length`), 0);
  await screenshot("planning-history");
  await send("Page.navigate", { url: `${baseUrl}/planning?wo=UNKNOWN` });
  await waitFor("document.body.textContent.includes('Deze werkorder bestaat niet.')", "unknown query target");
  assert.equal(await evaluate("document.querySelectorAll('[data-backlog-order][data-selected=true]').length"), 0);
  results.push("Query URLs select/focus work orders, clicking a slot schedules them immediately, existing appointments open in their week, historical bookings are read-only and reload restores imported execution state.");
  await clickText('a[href="/"]', "Onderhoud"); await waitFor("document.querySelector('[data-maintenance-row]')", "maintenance responsive");
  await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 1100, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate("document.body.scrollWidth <= innerWidth"), true); assert.equal(await evaluate("document.querySelector('[data-maintenance-scroll]').scrollWidth > document.querySelector('[data-maintenance-scroll]').clientWidth"), true); await screenshot("maintenance-tablet");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(300);
  assert.equal(await evaluate("document.body.scrollWidth <= innerWidth"), true); assert.equal(await evaluate("document.querySelector('[data-maintenance-scroll]').scrollWidth > document.querySelector('[data-maintenance-scroll]').clientWidth"), true); await screenshot("maintenance-mobile");
  await evaluate("document.querySelector('[data-maintenance-scroll]').scrollLeft = document.querySelector('[data-maintenance-scroll]').scrollWidth"); await screenshot("maintenance-mobile-actions");
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
