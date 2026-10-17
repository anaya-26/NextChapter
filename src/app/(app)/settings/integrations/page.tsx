import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { getCapabilities } from "@/server/capabilities";
import { CapabilityBadge } from "@/components/capability-badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Integrations & status" };

export default async function IntegrationsPage() {
  await requireUser();
  const caps = await getCapabilities();
  return (
    <div>
      <PageHeader
        title="Integrations & status"
        description="Exactly what works in this installation, what each feature falls back to, and how to enable more."
      />
      <div className="grid gap-3">
        {caps.map((c) => (
          <Card key={c.id} className="p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-semibold">{c.name}</h2>
                <p className="mt-1 text-sm text-muted">{c.summary}</p>
              </div>
              <CapabilityBadge state={c.state} />
            </div>
            {c.fallback || c.setup ? (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {c.fallback ? (
                  <div className="rounded-lg bg-surface-2 p-3">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">Without it</dt>
                    <dd className="mt-1">{c.fallback}</dd>
                  </div>
                ) : null}
                {c.setup ? (
                  <div className="rounded-lg bg-surface-2 p-3">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">To enable</dt>
                    <dd className="mt-1">{c.setup}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
