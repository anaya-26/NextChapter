import { SpaceTabs } from "@/components/space-tabs";

export default function JournalLayout({ children }: LayoutProps<"/journal">) {
  return (
    <div>
      <SpaceTabs
        label="Journal sections"
        tabs={[
          { href: "/journal", label: "Entries", exact: true },
          { href: "/journal/log", label: "Study log" },
          { href: "/journal/review", label: "Weekly review" },
        ]}
      />
      {children}
    </div>
  );
}
