import { PlanningOverview } from "@/components/planning";
export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ wo?: string | string[] }> }) {
  const { wo } = await searchParams;
  const workOrderId = typeof wo === "string" && wo ? wo : null;
  return <PlanningOverview key={workOrderId ?? "default"} workOrderId={workOrderId} />;
}
