import { SpaceTabs } from "@/components/space-tabs";

export default function ProgressLayout({ children }: LayoutProps<"/progress">) {
  return (
    <div>
      <SpaceTabs
        label="Progress sections"
        tabs={[
          { href: "/progress", label: "Overview", exact: true },
          { href: "/progress/experiments", label: "Experiments" },
        ]}
      />
      {children}
    </div>
  );
}
