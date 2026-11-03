import { readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import type { DataIssue } from "../../types/domain.ts";

export type RawRow = Record<string, string>;
export interface CsvTable { file: string; rows: { row: number; raw: RawRow }[]; issues: DataIssue[] }
const headers = {
  REL: ["code", "naam"], MS_HDR: ["nr", "klant", "omschrijving", "type", "pand", "laatste", "volgende", "frequentie"],
  WO_HDR: ["nr", "klant", "omschrijving", "werfadres", "fiche", "status", "soort"],
  WO_OBJ: ["werkbon", "fiche", "omschrijving", "soort"], WO_HRS_PL: ["werkbon", "datum", "tech", "van", "tot", "taak"],
  WO_HRS_EX: ["werkbon", "datum", "tech", "van", "tot", "taak"], RES: ["code", "naam", "rol"],
  WO_ART_PL: ["werkbon", "artikel", "omschrijving", "aantal", "prijs"],
} satisfies Record<string, string[]>;
export type TableName = keyof typeof headers;
export function parseCsv(text: string, file: string, required: readonly string[]): CsvTable {
  const parsed = Papa.parse<RawRow>(text.replace(/^\uFEFF/, ""), { header: true, delimiter: ";", skipEmptyLines: "greedy", transformHeader: value => value.trim() });
  const issues: DataIssue[] = parsed.errors.map((error, index) => ({ id: `${file}-parse-${index}`, file, row: (error.row ?? 0) + 2, field: "csv", severity: "error", message: `CSV-structuur: ${error.message}` }));
  const missing = required.filter(field => !parsed.meta.fields?.includes(field));
  missing.forEach(field => issues.push({ id: `${file}-header-${field}`, file, row: 1, field, severity: "error", message: `Vereiste kolom ontbreekt: ${field}.` }));
  return { file, rows: missing.length ? [] : parsed.data.map((raw, index) => ({ row: index + 2, raw })), issues };
}
export async function loadTable(name: TableName, directory = path.join(process.cwd(), "data")): Promise<CsvTable> {
  const file = `BD_EXP_${name}_20261103.csv`;
  try { return parseCsv(await readFile(path.join(directory, file), "utf8"), file, headers[name]); }
  catch { return { file, rows: [], issues: [{ id: `${file}-read`, file, row: 0, field: "bestand", severity: "error", message: "Bestand ontbreekt of kan niet gelezen worden." }] }; }
}
export const loadRelations = (directory?: string) => loadTable("REL", directory);
export const loadManagementSheets = (directory?: string) => loadTable("MS_HDR", directory);
export const loadWorkOrders = (directory?: string) => loadTable("WO_HDR", directory);
export const loadPlannedHours = (directory?: string) => loadTable("WO_HRS_PL", directory);
export const loadExecutedHours = (directory?: string) => loadTable("WO_HRS_EX", directory);
export const loadResources = (directory?: string) => loadTable("RES", directory);
export const loadWorkOrderObjects = (directory?: string) => loadTable("WO_OBJ", directory);
export const loadPlannedArticles = (directory?: string) => loadTable("WO_ART_PL", directory);
