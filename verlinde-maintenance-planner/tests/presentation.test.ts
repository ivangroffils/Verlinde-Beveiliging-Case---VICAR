import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAppData } from "../src/lib/data/normalize.ts";
import { getMaintenanceOverview, matchesMaintenanceFilter, sortMaintenanceRows } from "../src/lib/domain/maintenance.ts";
import { formatDate, formatTime, parseDate } from "../src/lib/domain/rules.ts";
import { groupMaintenanceRows, maintenanceCategories } from "../src/lib/presentation/maintenance.ts";

const source = loadAppData(undefined, "2026-11-04");

test("dates use Dutch Belgian short months without leading zeroes and preserve 24-hour times", () => {
  for (const [iso, label] of [["2026-01-12", "12 jan 2026"], ["2026-11-03", "3 nov 2026"], ["2026-12-25", "25 dec 2026"], ["2024-02-29", "29 feb 2024"]]) {
    assert.equal(formatDate(iso), label);
  }
  const months = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  months.forEach((month, index) => assert.equal(formatDate(`2026-${String(index + 1).padStart(2, "0")}-01`), `1 ${month} 2026`));
  assert.equal(formatDate("2026-11-03", "calendar"), "di 3 nov");
  assert.equal(formatTime(510), "08:30"); assert.equal(formatTime(630), "10:30");
  assert.equal(parseDate("03/11/2026"), "2026-11-03");
});

test("missing and invalid dates render a dash without repairing the source", () => {
  for (const value of [null, undefined, "", "invalid", "2026-02-29", "2026-11-31", "2026-13-01", "2026-1-01", "03/11/2026", "2026-11-03T23:00:00Z"]) {
    assert.equal(formatDate(value), "—"); assert.equal(formatDate(value, "calendar"), "—");
  }
});

test("all 193 real installations are grouped from existing normalized MS_HDR categories", async () => {
  const data = await source, before = structuredClone(data);
  const rows = sortMaintenanceRows(getMaintenanceOverview(data), null), groups = groupMaintenanceRows(rows);
  assert.deepEqual(groups.map(group => group.label), maintenanceCategories);
  assert.deepEqual(groups.map(group => group.rows.length), [66, 56, 46, 25]);
  assert.equal(new Set(groups.flatMap(group => group.rows.map(row => row.sheet.id))).size, 193);
  for (const group of groups) assert.deepEqual(group.rows, rows.filter(row => row.sheet.category === group.label));
  assert.deepEqual(data, before);
});

test("grouping preserves filtered results and both priority and selected column sorting", async () => {
  const filtered = getMaintenanceOverview(await source).filter(row => matchesMaintenanceFilter(row, "to-plan") && /inbraak/i.test(row.sheet.description));
  assert.ok(filtered.length > 0);
  for (const sort of [null, { key: "customer", direction: "desc" }, { key: "nextDate", direction: "asc" }] as const) {
    const sorted = sortMaintenanceRows(filtered, sort), before = structuredClone(sorted), groups = groupMaintenanceRows(sorted);
    assert.equal(groups.flatMap(group => group.rows).length, sorted.length);
    for (const group of groups) assert.deepEqual(group.rows, sorted.filter(row => row.sheet.category === group.label));
    assert.deepEqual(sorted, before);
  }
});

test("category aliases map to the four labels and unknown or missing categories remain in Overige", async () => {
  const row = getMaintenanceOverview(await source)[0];
  const aliases = ["INBR", "Inbraak", "ALARM", "BRAND", "Brand", "BRANDDET", "Branddetectie", "CAM", "Camera", "CCTV", "TOEG", "Toegang", "BADGE", "Toegangscontrole", "Other", "", "__proto__"];
  const rows = aliases.map((category, index) => ({ ...row, sheet: { ...row.sheet, id: String(index), category } }));
  const groups = groupMaintenanceRows(rows);
  assert.deepEqual(groups.map(group => [group.label, group.rows.length]), [["Inbraak", 3], ["Branddetectie", 4], ["Camera", 3], ["Toegangscontrole", 4], ["Overige", 3]]);
  assert.equal(groups.flatMap(group => group.rows).length, rows.length);
  assert.deepEqual(groupMaintenanceRows([]).map(group => [group.label, group.rows.length]), maintenanceCategories.map(label => [label, 0]));
});
