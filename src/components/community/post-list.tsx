import Link from "next/link";
import { AlertTriangle, MessageSquare, ThumbsUp } from "lucide-react";
import { INCORRECT_WARNING_AT } from "@/lib/community-safety";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/** Kinds a student can choose when writing a post (achievement posts come from sharing). */
export const POST_KINDS = [
  { value: "QUESTION", label: "Question" },
  { value: "EXPLANATION", label: "Explanation" },
  { value: "RESOURCE", label: "Resource" },
  { value: "DISCUSSION", label: "Discussion" },
  { value: "GOAL", label: "Goal (for accountability)" },
  { value: "SHOWCASE", label: "Showcase of my work" },
] as const;

export const KIND_LABEL: Record<string, string> = { QUESTION: "Question", RESOURCE: "Resource", EXPLANATION: "Explanation", GOAL: "Goal", ACHIEVEMENT: "Achievement", SHOWCASE: "Showcase", DISCUSSION: "Discussion" };

type ListPost = {
  id: string;
  kind: string;
  title: string;
  body: string;
  status: string;
  helpfulCount: number;
  incorrectFlagCount: number;
  createdAt: Date;
  author: { communityProfile: { handle: string } | null };
  group: { slug: string; name: string };
  _count: { comments: number };
};

export function PostList({ posts, tz, showGroup = true }: { posts: ListPost[]; tz: string; showGroup?: boolean }) {
  return (
    <Card className="divide-y divide-border">
      {posts.map((p) => (
        <article key={p.id} className="flex flex-col gap-1.5 p-4">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <Badge tone="primary">{KIND_LABEL[p.kind] ?? p.kind}</Badge>
            {p.status === "PENDING_REVIEW" ? <Badge tone="warning">Waiting for a moderator — only you can see it</Badge> : null}
            {p.incorrectFlagCount >= INCORRECT_WARNING_AT ? (
              <Badge tone="warning">
                <AlertTriangle aria-hidden /> Flagged as possibly incorrect
              </Badge>
            ) : null}
            <span>
              {p.author.communityProfile?.handle ?? "former member"}
              {showGroup ? (
                <>
                  {" in "}
                  <Link href={`/community/groups/${p.group.slug}`} className="hover:underline">
                    {p.group.name}
                  </Link>
                </>
              ) : null}
              {" · "}
              {p.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: tz })}
            </span>
          </div>
          <Link href={`/community/posts/${p.id}`} className="font-medium hover:text-primary hover:underline">
            {p.title}
          </Link>
          <p className="line-clamp-2 text-sm text-muted">{p.body}</p>
          <div className="flex gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3.5" aria-hidden /> {p._count.comments} {p._count.comments === 1 ? "reply" : "replies"}
            </span>
            {p.helpfulCount ? (
              <span className="inline-flex items-center gap-1">
                <ThumbsUp className="size-3.5" aria-hidden /> {p.helpfulCount} found it helpful
              </span>
            ) : null}
          </div>
        </article>
      ))}
    </Card>
  );
}
