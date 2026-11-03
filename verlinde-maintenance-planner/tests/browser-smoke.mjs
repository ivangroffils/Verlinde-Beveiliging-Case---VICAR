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
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: baseUrl });
  await waitFor("document.querySelector('h1')?.textContent === 'Onderhoudsoverzicht' && document.querySelector('table tbody tr')", "maintenance ready");
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await evaluate("document.documentElement.lang"), "nl");
  assert.equal(await evaluate("document.body.textContent.includes('Prototype mode') || document.body.textContent.includes('CSV-snapshot')"), false);
  await waitFor("[...document.querySelectorAll('img[alt=Verlinde]')].every(image => image.complete && image.naturalWidth > 0)", "logos loaded");
  const logoStyles = await evaluate("[...document.querySelectorAll('img[alt=Verlinde]')].map(image => { const rect = image.getBoundingClientRect(); const parent = image.parentElement.getBoundingClientRect(); return { fit: getComputedStyle(image).objectFit, fits: rect.width <= parent.width && rect.height <= parent.height }; })");
  assert.equal(logoStyles.length, 2);
  assert.ok(logoStyles.every(logo => logo.fit === "contain" && logo.fits));
  assert.equal(await evaluate("document.querySelectorAll('table tbody tr').length"), 193);
  assert.equal(await evaluate("document.body.scrollWidth <= innerWidth"), true);
  await screenshot("maintenance-desktop");
  await fill('input[placeholder="Zoek klant of installatie…"]', "Inbraakalarm");
  await waitFor("document.querySelectorAll('table tbody tr').length < 193", "search applies");
  const filteredCount = await evaluate("document.querySelectorAll('table tbody tr').length"); assert.ok(filteredCount > 0);
  await clickText('a[href="/planning"]', "Planning");
  await waitFor("document.querySelector('h1')?.textContent === 'Planning'", "planning route");
  await waitFor("document.querySelector('[aria-label=Weekplanner]')", "planner mounted");
  for (const name of ["Tom De Coninck", "Wout Vanhoutte", "Jens Maes", "Dirk Verlinde", "Brandtec (onderaannemer)"]) assert.ok(await evaluate(`document.querySelector('[aria-label=Weekplanner]').textContent.includes(${JSON.stringify(name)})`));
  const bookingLabels = await evaluate("(() => { const handle = document.querySelector('[aria-label^=\"Verplaats \"]'); const lines = [...handle.nextElementSibling.querySelectorAll('p')].map(line => line.textContent); return { order: handle.getAttribute('aria-label').split(',')[0].replace('Verplaats ', ''), lines }; })()");
  assert.notEqual(bookingLabels.lines[0], bookingLabels.order);
  assert.equal(bookingLabels.lines[1], bookingLabels.order);
  await screenshot("planning-desktop");
  await clickText('a[href="/"]', "Onderhoud");
  await waitFor("document.querySelector('h1')?.textContent === 'Onderhoudsoverzicht'", "return to maintenance");
  assert.equal(await evaluate("document.querySelectorAll('table tbody tr').length"), filteredCount);
  assert.equal(await evaluate('document.querySelector(\'input[placeholder="Zoek klant of installatie…"]\').value'), "Inbraakalarm");
  await fill('input[placeholder="Zoek klant of installatie…"]', "");
  await waitFor("document.querySelectorAll('table tbody tr').length === 193", "clear search");
  await clickText("table button", "Werkorder maken");
  await waitFor("document.body.textContent.includes('TEMP-001 aangemaakt')", "create order");
  await clickText('a[href="/planning"]', "Planning");
  await waitFor("document.querySelector('h1')?.textContent === 'Planning' && document.querySelector('[aria-label=\"Ongeplande werkorders\"]').textContent.includes('TEMP-001')", "created order in backlog");
  await clickText("summary", "Afspraak plannen");
  await fill('form select[id$="-order"]', "TEMP-001");
  await fill("form select:not([id])", "TDC");
  await fill('form input[type="date"]', "2030-01-07");
  await clickText('form button[type="submit"]', "Inplannen");
  await waitFor("document.body.textContent.includes('TEMP-001 ingepland.')", "schedule order");
  
  await fill('form input[type="date"]', "2030-01-08");
  await fill("form div.grid select", "10:00");
  await clickText('form button[type="submit"]', "Verplaatsen");
  await waitFor("document.body.textContent.includes('TEMP-001 verplaatst.')", "reschedule order");
  // Select the first 2030 week by navigating directly through the retained form's order drawer.
  await clickText('a[href="/"]', "Onderhoud");
  await waitFor("document.querySelector('h1')?.textContent === 'Onderhoudsoverzicht'", "maintenance with session state");
  await clickText("table button", "TEMP-001");
  await waitFor("document.querySelector('dialog[open]')?.textContent.includes('08/01/2030')", "drawer reflects move");
  assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('10:00')"));
  // Native modal focus remains inside the drawer when tabbing.
  for (let index = 0; index < 6; index++) { await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); }
  assert.equal(await evaluate("document.querySelector('dialog').contains(document.activeElement)"), true);
  await clickText("dialog button", "Markeren als voltooid");
  await waitFor("document.body.textContent.includes('TEMP-001 voltooid.')", "complete order");
  results.push("Create -> navigate -> schedule -> reschedule -> complete; filters survive navigation; native drawer traps keyboard focus.");
  // Exercise actual pointer drag-and-drop, including a rejected collision and a move.
  await clickText("table button", "Werkorder maken");
  await waitFor("document.body.textContent.includes('TEMP-002 aangemaakt')", "second temporary order");
  await clickText("table button", "Werkorder maken");
  await waitFor("document.body.textContent.includes('TEMP-003 aangemaakt')", "third temporary order");
  await clickText('a[href="/planning"]', "Planning");
  await waitFor("document.querySelector('[aria-label=Weekplanner]')", "drag planner");
  const point = async (selector, index = 0) => evaluate(`(() => { const node = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!node) throw new Error('Missing drag node'); const rect = node.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
  const mouseDrag = async (selector, targetIndex) => {
    const from = await point(selector);
    const to = await point('[title^="Tom De Coninck"]', targetIndex);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...from });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...from });
    for (let step = 1; step <= 12; step++) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1, x: from.x + (to.x - from.x) * step / 12, y: from.y + (to.y - from.y) * step / 12 });
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...to });
  };
  await mouseDrag('[aria-label="Sleep TEMP-002 naar de planner"]', 0);
  await waitFor("document.body.textContent.includes('TEMP-002 ingepland.')", "pointer schedules backlog order");
  await mouseDrag('[aria-label="Sleep TEMP-003 naar de planner"]', 0);
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('overlapt met TEMP-002')", "pointer overlap rejected");
  assert.ok(await evaluate("document.querySelector('[aria-label=\"Ongeplande werkorders\"]').textContent.includes('TEMP-003')"));
  await mouseDrag('[aria-label^="Verplaats TEMP-002,"]', 4);
  await waitFor("document.body.textContent.includes('TEMP-002 verplaatst.')", "pointer reschedules existing order");
  await screenshot("planning-dragged");
  // Keyboard drag uses the same actual drop targets and validation.
  await evaluate("document.querySelector('[aria-label=\"Sleep TEMP-003 naar de planner\"]').focus()");
  const key = async (code, key, windowsVirtualKeyCode) => { await send("Input.dispatchKeyEvent", { type: "keyDown", code, key, windowsVirtualKeyCode }); await send("Input.dispatchKeyEvent", { type: "keyUp", code, key, windowsVirtualKeyCode }); await new Promise(resolve => setTimeout(resolve, 150)); };
  await key("Space", " ", 32);
  await key("ArrowRight", "ArrowRight", 39);
  await key("Space", " ", 32);
  await waitFor("document.body.textContent.includes('TEMP-003 ingepland.')", "keyboard drag schedules order");
  const expectedKeyboardDate = await evaluate("document.querySelector('[title^=\"Tom De Coninck\"]').title.split(' · ')[1]");
  const keyboardLabel = await evaluate("document.querySelector('[aria-label^=\"Verplaats TEMP-003,\"]').getAttribute('aria-label')");
  assert.ok(keyboardLabel.includes(expectedKeyboardDate));
  assert.ok(keyboardLabel.endsWith("08:00"));
  results.push("Actual pointer drag schedules and moves orders, rejects overlaps without losing backlog cards; keyboard drag schedules successfully.");
  await send("Page.reload");
  await waitFor("document.querySelector('h1')?.textContent === 'Planning' && !document.body.textContent.includes('TEMP-001') && !document.body.textContent.includes('TEMP-002') && !document.body.textContent.includes('TEMP-003')", "reload restores source");
  await clickText('a[href="/"]', "Onderhoud");
  await waitFor("document.querySelector('table tbody tr')", "maintenance after reload");
  results.push("Reload restores original CSV state.");
  await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 1100, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate("document.body.scrollWidth <= innerWidth"), true);
  await screenshot("maintenance-tablet");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await evaluate("document.body.scrollWidth <= innerWidth"), true);
  await screenshot("maintenance-mobile");
  await evaluate("document.querySelector('[aria-label=\"Menu openen\"]').click()");
  await clickText('a[href="/planning"]', "Planning");
  await waitFor("document.querySelector('h1')?.textContent === 'Planning'", "mobile planning");
  await waitFor("document.querySelector('[aria-label=Weekplanner] h3')", "selected-day mobile planner");
  assert.equal(await evaluate("document.body.scrollWidth <= innerWidth"), true);
  await evaluate("document.querySelector('[aria-label=Weekplanner]').scrollIntoView({block: 'start'})");
  await screenshot("planning-mobile");
  results.push("Desktop, tablet and mobile layouts fit the viewport; mobile uses a selected-day resource planner.");
  await evaluate("document.querySelector('header button[aria-label=\"Menu openen\"]')?.blur()");
  await evaluate("document.querySelector('[aria-label=\"Gegevensproblemen tonen\"]').click()");
  await waitFor("document.querySelector('dialog[open]')?.textContent.includes('Gegevensproblemen')", "issues dialog");
  await clickText("dialog button", "Informatie");
  await fill('dialog input', "Tijdvolgorde");
  await waitFor("document.querySelectorAll('dialog article').length === 69", "reversed times are informational");
  assert.ok(await evaluate("[...document.querySelectorAll('dialog article')].every(article => article.textContent.includes('Informatie'))"));
  await screenshot("data-issues-mobile");
  assert.deepEqual(errors, []);
  results.push("No browser exceptions; all 69 reversed imported time ranges are informational. Full logos use object-contain without cropping.");
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
