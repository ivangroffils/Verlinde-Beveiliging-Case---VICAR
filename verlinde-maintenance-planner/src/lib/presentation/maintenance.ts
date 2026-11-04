import type { MaintenanceOverviewRow } from "../domain/maintenance.ts";

export const maintenanceCategories = ["Inbraak", "Branddetectie", "Camera", "Toegangscontrole"] as const;
type Category = typeof maintenanceCategories[number] | "Overige";
const categoryLabels: Record<string, Category> = {
  inbr: "Inbraak", inbraak: "Inbraak", alarm: "Inbraak",
  brand: "Branddetectie", branddet: "Branddetectie", branddetectie: "Branddetectie",
  cam: "Camera", camera: "Camera", cctv: "Camera",
  toeg: "Toegangscontrole", toegang: "Toegangscontrole", toegangscontrole: "Toegangscontrole", badge: "Toegangscontrole",
};

// Consume the existing filtered/sorted rows; grouping never changes their priority or domain state.
export function groupMaintenanceRows(rows: MaintenanceOverviewRow[]) {
  const groups = new Map<Category, MaintenanceOverviewRow[]>(maintenanceCategories.map(label => [label, []]));
  for (const row of rows) {
    const key = row.sheet.category.trim().toLocaleLowerCase("nl-BE");
    const label = Object.hasOwn(categoryLabels, key) ? categoryLabels[key] : "Overige";
    const group = groups.get(label) ?? [];
    group.push(row);
    groups.set(label, group);
  }
  return [...groups].map(([label, rows]) => ({ label, rows }));
}
