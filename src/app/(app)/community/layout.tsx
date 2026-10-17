import { SpaceTabs } from "@/components/space-tabs";

export default function CommunityLayout({ children }: LayoutProps<"/community">) {
  return (
    <div>
      <SpaceTabs
        label="Community sections"
        tabs={[
          { href: "/community", label: "Home", exact: true },
          { href: "/community/groups", label: "Groups" },
          { href: "/community/rooms", label: "Focus rooms" },
          { href: "/community/buddies", label: "Study buddies" },
          { href: "/community/profile", label: "Profile & safety" },
        ]}
      />
      {children}
    </div>
  );
}
