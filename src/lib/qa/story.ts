/** Status-style answer stories around the avatar (pure, shared). */
export const QA_STORY_HOURS = 24;

export type QaAnswer = {
  id: string;
  body: string;
  answer: string;
  prompt: string | null;
  answeredAt: string;
  storyUntil: string | null;
};

/** Answers still inside their story window, oldest first (like a status reel). */
export function activeStories(answers: QaAnswer[], now: number = Date.now()): QaAnswer[] {
  return answers
    .filter((a) => {
      const until = a.storyUntil ? Date.parse(a.storyUntil) : Date.parse(a.answeredAt) + QA_STORY_HOURS * 3_600_000;
      return Number.isFinite(until) && until > now;
    })
    .sort((a, b) => Date.parse(a.answeredAt) - Date.parse(b.answeredAt));
}

/** Ring is "unseen" while any story is newer than the last one the visitor watched. */
export function hasUnseen(stories: QaAnswer[], seenAt: string | null): boolean {
  if (stories.length === 0) return false;
  if (!seenAt) return true;
  const seen = Date.parse(seenAt);
  return stories.some((s) => Date.parse(s.answeredAt) > seen);
}

export function seenStorageKey(space: "root" | "alias", handle: string): string {
  return `rout_qa_seen:${space}:${handle.toLowerCase()}`;
}
