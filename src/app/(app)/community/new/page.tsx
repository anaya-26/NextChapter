import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { CommunityError, communityAccess, listGroups, shareDraft, type ShareDraft } from "@/server/services/community";
import { PostComposer } from "@/components/community/community-ui";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "New post" };

export default async function NewPostPage(props: PageProps<"/community/new">) {
  const user = await requireUser();
  const at = await now(user.id);
  const sp = await props.searchParams;
  const access = await communityAccess(user.id, at);
  if (!access.member || access.needsConsent) redirect("/community");
  const groups = await listGroups(user.id, at);
  const share = typeof sp.share === "string" ? sp.share : null;
  let draft: ShareDraft | undefined;
  let shareError: string | null = null;
  if (share) {
    const [type, id] = share.split(":");
    try {
      draft = await shareDraft(user.id, type, id ?? "");
    } catch (e) {
      shareError = e instanceof CommunityError ? e.message : "This can’t be shared";
    }
  }
  const groupSlug = typeof sp.group === "string" ? sp.group : null;
  const preferred = groups.find((g) => g.slug === groupSlug) ?? groups.find((g) => g.myRole);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={draft ? `Share your ${draft.label}` : "New post"} description={draft ? "This is an editable copy. Change anything before posting — nothing is shared until you press Post." : "Ask a question, explain something, share a resource or your work."} />
      {shareError ? <Notice tone="warning">{shareError}</Notice> : null}
      {access.suspendedUntil ? <Notice tone="warning">Posting is paused for now.</Notice> : null}
      {access.canPost ? (
        <Card className="max-w-3xl p-5">
          <PostComposer groups={groups.map((g) => ({ id: g.id, name: g.name }))} defaultGroupId={preferred?.id} draft={draft} handle={access.member.handle} />
        </Card>
      ) : null}
    </div>
  );
}
