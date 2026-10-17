import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { requireUser } from "@/server/session";
import { now } from "@/server/clock";
import { getProfile } from "@/server/services/profile";
import { communityAccess, getPost } from "@/server/services/community";
import { FLAG_REASONS } from "@/server/services/moderation";
import { INCORRECT_WARNING_AT } from "@/lib/community-safety";
import { SUPPORT_LINES } from "@/lib/wellbeing";
import { BlockButton, CommentForm, DeleteOwnButton, HelpfulButton, ReportButton, SaveResourceButton } from "@/components/community/community-ui";
import { KIND_LABEL } from "@/components/community/post-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice, SectionTitle } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Post" };

export default async function PostPage(props: PageProps<"/community/posts/[postId]">) {
  const user = await requireUser();
  const at = await now(user.id);
  const { postId } = await props.params;
  const { held } = await props.searchParams;
  const access = await communityAccess(user.id, at);
  if (!access.member || access.needsConsent) redirect("/community");
  const post = await getPost(user.id, postId, at);
  if (!post) notFound();
  const profile = await getProfile(user.id);
  const mine = post.author.id === user.id;
  const handle = post.author.communityProfile?.handle ?? "former member";
  const fmt = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: profile.timezone });
  const contentReasons = FLAG_REASONS.filter((r) => r.value !== "INCORRECT");

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/community/groups/${post.group.slug}`} className="text-sm text-muted hover:text-fg">
        ← {post.group.name}
      </Link>
      {held && mine ? (
        <Notice tone="info" title="Your post is waiting for a moderator">
          It sounded like things might be hard right now. You don’t have to handle it alone — talk to someone you trust, or call {SUPPORT_LINES.map((s) => `${s.name}: ${s.contact}`).join(" · ")}.
        </Notice>
      ) : null}
      {post.status === "PENDING_REVIEW" ? <Notice tone="warning">Only you can see this until a moderator reviews it.</Notice> : null}
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Badge tone="primary">{KIND_LABEL[post.kind]}</Badge>
          <span>
            {handle} · {fmt(post.createdAt)}
          </span>
          {post.sharedFromType ? <Badge tone="outline">Shared from their {post.sharedFromType}</Badge> : null}
        </div>
        <h1 className="text-xl font-semibold">{post.title}</h1>
        <p className="whitespace-pre-line">{post.body}</p>
        {post.resourceUrl ? (
          <a href={post.resourceUrl} target="_blank" rel="noreferrer noopener nofollow ugc" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            {post.resourceUrl.replace(/^https?:\/\//, "").slice(0, 80)} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
        {post.attribution ? <p className="text-xs text-muted">Source: {post.attribution}</p> : null}
        {post.kind === "RESOURCE" && post.incorrectFlagCount ? (
          <p className={`inline-flex items-center gap-1 text-sm ${post.incorrectFlagCount >= INCORRECT_WARNING_AT ? "text-warning" : "text-muted"}`}>
            <AlertTriangle className="size-4" aria-hidden /> {post.incorrectFlagCount} student{post.incorrectFlagCount === 1 ? "" : "s"} flagged this as possibly incorrect or outdated — check before relying on it.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1 border-t border-border pt-3">
          <HelpfulButton target={{ postId: post.id }} marked={post.reactions.length > 0} count={post.helpfulCount} own={mine} />
          {post.kind === "RESOURCE" ? <SaveResourceButton postId={post.id} /> : null}
          {post.kind === "RESOURCE" && !mine ? <ReportButton targetType="RESOURCE" targetId={post.id} label="Flag as incorrect" reasons={[{ value: "INCORRECT", label: "Incorrect or outdated" }]} /> : null}
          {mine ? (
            <DeleteOwnButton postId={post.id} />
          ) : (
            <>
              <ReportButton targetType="POST" targetId={post.id} reasons={contentReasons} />
              <BlockButton handle={handle} />
            </>
          )}
        </div>
      </Card>

      <section>
        <SectionTitle>
          {post.comments.length} {post.comments.length === 1 ? "reply" : "replies"}
        </SectionTitle>
        <div className="flex flex-col gap-3">
          {post.comments.map((c) => {
            const own = c.author.id === user.id;
            const ch = c.author.communityProfile?.handle ?? "former member";
            return (
              <Card key={c.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {c.isExplanation ? <Badge tone="info">Peer explanation</Badge> : null}
                  {c.status === "PENDING_REVIEW" ? <Badge tone="warning">Waiting for a moderator</Badge> : null}
                  <span>
                    {ch} · {fmt(c.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-line text-sm">{c.body}</p>
                {c.attribution ? <p className="text-xs text-muted">Source: {c.attribution}</p> : null}
                <div className="flex flex-wrap items-center gap-1">
                  <HelpfulButton target={{ commentId: c.id }} marked={c.reactions.length > 0} count={c.helpfulCount} own={own} />
                  {own ? (
                    <DeleteOwnButton commentId={c.id} />
                  ) : (
                    <>
                      <ReportButton targetType="COMMENT" targetId={c.id} reasons={FLAG_REASONS} />
                      <BlockButton handle={ch} />
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        {access.canPost && post.status === "VISIBLE" ? (
          <Card className="mt-4 p-4">
            <CommentForm postId={post.id} question={post.kind === "QUESTION"} />
            <p className="mt-2 text-xs text-muted">Explain in your own words where you can. Marking an explanation helpful gives its author XP once.</p>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
