import { SpaceTabs } from "@/components/space-tabs";

export function LearnTabs() {
  return (
    <SpaceTabs
      label="Learn sections"
      tabs={[
        { href: "/learn", label: "Subjects", exact: true },
        { href: "/learn/review", label: "Flashcard review" },
        { href: "/learn/mistakes", label: "Mistake library" },
        { href: "/learn/resources", label: "Saved resources" },
      ]}
    />
  );
}
