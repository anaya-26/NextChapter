import type { Metadata } from "next";
import Link from "next/link";
import { Brain, ChevronRight, Download, FlaskConical, PlugZap, Shield } from "lucide-react";
import { requireUser } from "@/server/session";
import { env } from "@/server/env";
import { getPrivacy, getProfile, profileCompleteness } from "@/server/services/profile";
import { listCommitments } from "@/server/services/commitments";
import { toProfileInit } from "../onboarding/profile-init";
import { ProfileSections } from "@/components/settings/profile-sections";
import { CommitmentForm, CommitmentList } from "@/components/settings/commitment-editor";
import { DeleteAccountForm } from "@/components/settings/delete-account";
import { Card } from "@/components/ui/card";
import { PageHeader, Progress, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [profile, privacy, commitments] = await Promise.all([getProfile(user.id), getPrivacy(user.id), listCommitments(user.id)]);
  const completeness = profileCompleteness(profile);
  const e = env();
  const links = [
    { href: "/settings/privacy", icon: Shield, title: "Privacy & AI permissions", text: "Choose what the companion may use; guardian consent" },
    { href: "/settings/memory", icon: Brain, title: "What NextChapter remembers", text: "View, correct or delete remembered information" },
    { href: "/settings/integrations", icon: PlugZap, title: "Integrations & status", text: "What works in this installation" },
    ...(e.testClockEnabled || e.ENABLE_DEMO_TOOLS
      ? [{ href: "/settings/developer", icon: FlaskConical, title: "Testing tools", text: "Test clock and labelled demo history" }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Your profile, preferences and privacy. Everything here can be changed at any time." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {links.map(({ href, icon: Icon, title, text }) => (
          <Link key={href} href={href} className="group flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card hover:border-primary">
            <span className="rounded-xl bg-primary-soft p-2.5 text-primary-soft-fg">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{title}</span>
              <span className="block text-sm text-muted">{text}</span>
            </span>
            <ChevronRight className="size-4 text-muted group-hover:text-fg" aria-hidden />
          </Link>
        ))}
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">Profile {completeness.percent}% complete</p>
          {completeness.percent < 100 ? <Link className="text-sm text-primary underline-offset-4 hover:underline" href="/onboarding">Continue guided setup</Link> : null}
        </div>
        <Progress value={completeness.percent} className="mt-3" label="Profile completeness" />
        {completeness.missing.length ? <p className="mt-2 text-sm text-muted">Still to add: {completeness.missing.join(", ")}.</p> : null}
      </Card>

      <ProfileSections profile={toProfileInit(profile, user.name)} privacy={{ aiUseJournal: privacy.aiUseJournal, aiInferPatterns: privacy.aiInferPatterns }} />

      <Card id="commitments" className="scroll-mt-20 p-5 sm:p-6">
        <SectionTitle>Regular commitments</SectionTitle>
        <p className="mb-4 text-sm text-muted">Classes, coaching, commute and responsibilities — the planner only schedules study in genuinely free time.</p>
        <CommitmentList commitments={commitments} />
        <details className="mt-4 rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Add a commitment</summary>
          <div className="pt-3">
            <CommitmentForm />
          </div>
        </details>
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle>Your data</SectionTitle>
        <p className="text-sm text-muted">Download everything NextChapter stores about you, or delete your account permanently.</p>
        <div className="mt-4 flex flex-col gap-4">
          <a href="/api/account/export" className="inline-flex w-fit items-center gap-2 rounded-[10px] border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-2">
            <Download className="size-4" aria-hidden /> Export my data (JSON)
          </a>
          <DeleteAccountForm />
        </div>
      </Card>
    </div>
  );
}
