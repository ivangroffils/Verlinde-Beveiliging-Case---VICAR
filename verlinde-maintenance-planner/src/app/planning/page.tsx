import { PlanningOverview } from "@/components/planning";
import { plannerModeFromQuery } from "@/lib/domain/planning";
export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ wo?: string | string[]; mode?: string | string[] }> }) {
  const { wo, mode } = await searchParams;
  const workOrderId = typeof wo === "string" && wo ? wo : null;
  const plannerMode = plannerModeFromQuery(mode);
  return <PlanningOverview key={`${workOrderId ?? "default"}:${plannerMode}`} workOrderId={workOrderId} plannerMode={plannerMode} />;
}
