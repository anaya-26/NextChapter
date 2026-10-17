import { SpaceTabs } from "@/components/space-tabs";

export default function GoalsLayout({ children }: LayoutProps<"/goals">) {
  return (
    <div>
      <SpaceTabs
        label="Goals & Career sections"
        tabs={[
          { href: "/goals", label: "Goals", exact: true },
          { href: "/goals/career", label: "Career" },
          { href: "/goals/opportunities", label: "Opportunities" },
          { href: "/goals/portfolio", label: "Portfolio" },
          { href: "/goals/cv", label: "CV" },
        ]}
      />
      {children}
    </div>
  );
}
