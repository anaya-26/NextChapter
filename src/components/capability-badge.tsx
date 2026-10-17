import { Badge } from "@/components/ui/badge";
import type { CapabilityState } from "@/server/capabilities";

const LABELS: Record<CapabilityState, { label: string; tone: "success" | "warning" | "neutral" | "info" | "danger" }> = {
  ready: { label: "Working", tone: "success" },
  limited: { label: "Limited", tone: "info" },
  simulated: { label: "Simulated", tone: "warning" },
  not_configured: { label: "Not configured", tone: "neutral" },
  not_available: { label: "Not running", tone: "danger" },
};

export function CapabilityBadge({ state }: { state: CapabilityState }) {
  const { label, tone } = LABELS[state];
  return <Badge tone={tone}>{label}</Badge>;
}
