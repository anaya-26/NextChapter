import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/server/session";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const user = await requireUser();
  const t = await getTranslations("today");
  return (
    <div>
      <PageHeader title={t("greetingMorning", { name: user.name.split(" ")[0] })} description={t("nothingPlanned")} />
    </div>
  );
}
