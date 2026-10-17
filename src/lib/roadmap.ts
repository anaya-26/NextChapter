export type RoadmapTopic = {
  id: string;
  title: string;
  kind: string;
  status: string;
  order: number;
  studiedAt: Date | null;
  prerequisiteIds: string[];
};

const done = (t: RoadmapTopic) => t.status === "SKIPPED" || t.status === "STUDIED" || !!t.studiedAt;

/**
 * The next step on a roadmap: the earliest required/background topic (in suggested order)
 * that isn't done. If it depends on an unfinished foundation, that foundation comes first.
 */
export function nextStep(topics: RoadmapTopic[]): { topic: RoadmapTopic; reason: string } | null {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const candidates = [...topics].filter((t) => t.kind !== "OPTIONAL" && !done(t)).sort((a, b) => a.order - b.order);
  for (const t of candidates) {
    const blocking = t.prerequisiteIds.map((id) => byId.get(id)).filter((p): p is RoadmapTopic => !!p && !done(p));
    if (!blocking.length) {
      return { topic: t, reason: t.kind === "BACKGROUND" ? "A foundation for upcoming syllabus topics" : "Next in your suggested sequence" };
    }
    const foundation = blocking.sort((a, b) => a.order - b.order)[0];
    if (!blocking.some((b) => b.prerequisiteIds.some((id) => byId.get(id) && !done(byId.get(id)!)))) {
      return { topic: foundation, reason: `Needed before “${t.title}”` };
    }
  }
  return null;
}

/** True if every prerequisite of the topic is studied or skipped. */
export function prerequisitesMet(topic: RoadmapTopic, all: RoadmapTopic[]) {
  const byId = new Map(all.map((t) => [t.id, t]));
  return topic.prerequisiteIds.every((id) => {
    const p = byId.get(id);
    return !p || done(p);
  });
}
