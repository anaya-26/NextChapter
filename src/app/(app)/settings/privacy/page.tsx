import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { env } from "@/server/env";
import { aiRequestsToday } from "@/server/ai";
import { getPrivacy, getProfile, isMinor } from "@/server/services/profile";
import { PrivacyForm, ConsentForm } from "@/components/settings/privacy-forms";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader, SectionTitle } from "@/components/ui/feedback";
import { formatInTz } from "@/lib/time";

export const metadata: Metadata = { title: "Privacy & AI permissions" };

export default async function PrivacyPage() {
  const user = await requireUser();
  const [profile, privacy, used] = await Promise.all([getProfile(user.id), getPrivacy(user.id), aiRequestsToday(user.id)]);
  const minor = isMinor(profile.ageBand);
  const locked = minor && profile.guardianConsent !== "RECORDED";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Privacy & AI permissions"
        description="You decide what the companion can see. Changes apply to every future suggestion immediately."
      />

      <Card className="p-5 sm:p-6">
        <PrivacyForm
          initial={{
            aiUseProfile: privacy.aiUseProfile,
            aiUseProgress: privacy.aiUseProgress,
            aiUseGoals: privacy.aiUseGoals,
            aiUseCalendar: privacy.aiUseCalendar,
            aiUseJournal: privacy.aiUseJournal,
            aiInferPatterns: privacy.aiInferPatterns,
            aiMemoryEnabled: privacy.aiMemoryEnabled,
            communityVisible: privacy.communityVisible,
          }}
          locked={locked}
        />
      </Card>

      {minor ? (
        <Card className="p-5 sm:p-6">
          <SectionTitle>Parent or guardian consent</SectionTitle>
          {profile.guardianConsent === "RECORDED" ? (
            <Notice tone="success" title="Consent recorded">
              Recorded on {profile.guardianConsentAt ? formatInTz(profile.guardianConsentAt, profile.timezone, { dateStyle: "medium" }) : "an earlier date"}. A guardian can ask
              for it to be withdrawn at any time by deleting the account or contacting support.
            </Notice>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                India&apos;s Digital Personal Data Protection Act treats everyone under 18 as a child. Until a parent or guardian consents, NextChapter keeps optional
                features off: noticing behaviour patterns and being discoverable to other students. Learning tools, your private journal and planning work as normal.
              </p>
              <Notice tone="warning" className="mb-4" title="This records a declaration, not verified consent">
                Verifiable guardian consent (required under the DPDP Rules from 2027) needs an identity-verification integration that is not yet available here.
              </Notice>
              <ConsentForm />
            </>
          )}
        </Card>
      ) : null}

      <Card className="p-5 sm:p-6">
        <SectionTitle>AI usage today</SectionTitle>
        <p className="text-sm text-muted">
          {used} of {env().AI_DAILY_REQUEST_LIMIT} AI requests used. The limit resets at midnight (India time) and keeps costs and over-reliance in check.
        </p>
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle>How your data is handled</SectionTitle>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>Your journal, notes, uploads and plans are private to you. Nothing is shared to the community unless you post it yourself.</li>
          <li>When AI is used, only the categories switched on above are sent to the AI provider (Anthropic), together with the material you are working on.</li>
          <li>Uploaded documents and web pages are treated as reference material, never as instructions to the AI.</li>
          <li>You can export or delete all your data from Settings.</li>
        </ul>
      </Card>
    </div>
  );
}
