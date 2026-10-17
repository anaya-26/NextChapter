import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { requireUser } from "@/server/session";
import { getProfile } from "@/server/services/profile";
import { listCareerInterests } from "@/server/services/goals";
import { InterestCard, InterestForm } from "@/components/goals/career-interest-ui";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Career" };

export default async function CareerPage() {
  const user = await requireUser();
  const [interests, profile] = await Promise.all([listCareerInterests(user.id), getProfile(user.id)]);
  const clarity =
    profile.careerClarity === "CLEAR"
      ? "You know your direction — save target roles, companies and cities so opportunities and preparation goals match."
      : "Not knowing yet is normal. Add domains you're curious about; Kadam will suggest small exploration projects and, as you build a history of real work, an evidence-based discovery review.";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Career" description={clarity} />
      <Card className="p-5 sm:p-6">
        <SectionTitle>Add a domain or direction</SectionTitle>
        <InterestForm />
      </Card>
      {interests.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {interests.map((i) => (
            <InterestCard key={i.id} interest={{ id: i.id, domain: i.domain, roles: i.roles, companies: i.companies, cities: i.cities, workModes: i.workModes, status: i.status, notes: i.notes }} />
          ))}
        </div>
      ) : (
        <EmptyState icon={Compass} title="No career interests yet" description="Add one domain — even a vague one like “something with computers and people”." />
      )}
    </div>
  );
}
