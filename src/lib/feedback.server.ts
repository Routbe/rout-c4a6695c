import { sql } from "./neon";
import { feedbackFormSchema, feedbackResponseSchema, type FeedbackForm, type FeedbackFormInput, type FeedbackReview, type PublicFeedback } from "./feedback";

type Row = Record<string, unknown>;
function formDto(r: Row): FeedbackForm {
  return {
    id: String(r.id), title: String(r.title), type: feedbackFormSchema.shape.type.parse(r.type), slug: String(r.slug),
    showOnProfile: r.show_on_profile === true, fullPage: r.full_page === true,
    profileSpace: feedbackFormSchema.shape.profileSpace.parse(r.profile_space), profileHandle: String(r.profile_handle),
    count: Number(r.count ?? 0), average: r.average == null ? null : Number(r.average),
  };
}
function reviewDto(r: Row): FeedbackReview {
  return { id: String(r.id), formId: String(r.form_id), rating: r.rating == null ? null : Number(r.rating),
    comment: String(r.comment ?? ""), reviewerName: String(r.reviewer_name ?? ""), isFeatured: r.is_featured === true,
    allowFeatured: r.allow_featured === true, createdAt: new Date(String(r.created_at)).toISOString() };
}
export async function listFeedback(userId: string, workspaceId: string | null) {
  const forms = await sql`select f.*, (select count(*) from public.feedback_responses r where r.form_id=f.id) as count,
    (select avg(r.rating) from public.feedback_responses r where r.form_id=f.id) as average
    from public.feedback_forms f where (${workspaceId}::uuid is null and f.workspace_id is null and f.user_id=${userId})
      or (${workspaceId}::uuid is not null and f.workspace_id=${workspaceId}) order by f.created_at desc limit 100` as Row[];
  const responses = await sql`select r.* from public.feedback_responses r join public.feedback_forms f on f.id=r.form_id
    where (${workspaceId}::uuid is null and f.workspace_id is null and f.user_id=${userId})
      or (${workspaceId}::uuid is not null and f.workspace_id=${workspaceId}) order by r.created_at desc,r.id limit 200` as Row[];
  return { forms: forms.map(formDto), responses: responses.map(reviewDto) };
}
export async function createFeedback(userId: string, workspaceId: string | null, input: FeedbackFormInput) {
  const d = feedbackFormSchema.parse(input);
  // The caller cannot attach a personal form to somebody else's alias/root.
  const binding = d.profileSpace === "workspace"
    ? await sql`select 1 from public.workspaces where id=${workspaceId} and slug=${d.profileHandle} limit 1`
    : d.profileSpace === "alias"
      ? await sql`select 1 from public.alias_profiles where user_id=${userId} and handle=${d.profileHandle} limit 1`
      : await sql`select 1 from public.profiles where id=${userId} and username=${d.profileHandle} and workspace_id is null limit 1`;
  if (!binding.length || ((d.profileSpace === "workspace") !== (workspaceId !== null))) throw new Error("Forbidden");
  const rows = await sql`insert into public.feedback_forms(user_id,workspace_id,title,type,show_on_profile,full_page,profile_space,profile_handle)
    values(${userId},${workspaceId},${d.title},${d.type},${d.showOnProfile},${d.fullPage},${d.profileSpace},${d.profileHandle}) returning *` as Row[];
  const row = rows[0];
  if (!row) throw new Error("feedback_save_failed");
  return formDto(row);
}
export async function updateFeedback(userId: string, workspaceId: string | null, id: string, action: "feature" | "delete_response" | "delete_form" | "visibility", enabled = false) {
  let rows: unknown[];
  if (action === "feature") rows = await sql`update public.feedback_responses r set is_featured=${enabled}
    from public.feedback_forms f where r.id=${id} and f.id=r.form_id and (not ${enabled} or r.allow_featured)
    and ((${workspaceId}::uuid is null and f.workspace_id is null and f.user_id=${userId})
      or (${workspaceId}::uuid is not null and f.workspace_id=${workspaceId})) returning r.id`;
  else if (action === "delete_response") rows = await sql`delete from public.feedback_responses r using public.feedback_forms f
    where r.id=${id} and f.id=r.form_id and ((${workspaceId}::uuid is null and f.workspace_id is null and f.user_id=${userId})
      or (${workspaceId}::uuid is not null and f.workspace_id=${workspaceId})) returning r.id`;
  else if (action === "delete_form") rows = await sql`delete from public.feedback_forms f where f.id=${id}
    and ((${workspaceId}::uuid is null and f.workspace_id is null and f.user_id=${userId})
      or (${workspaceId}::uuid is not null and f.workspace_id=${workspaceId})) returning f.id`;
  else rows = await sql`update public.feedback_forms f set show_on_profile=${enabled} where f.id=${id}
    and ((${workspaceId}::uuid is null and f.workspace_id is null and f.user_id=${userId})
      or (${workspaceId}::uuid is not null and f.workspace_id=${workspaceId})) returning f.id`;
  if (!rows.length) throw new Error("Forbidden");
  return { ok: true };
}
export async function readPublicFeedback(slug: string | null, space: string | null, handle: string | null): Promise<PublicFeedback[]> {
  const rows = await sql`select public.read_public_feedback(${slug},${space},${handle}) as items` as { items: Row[] }[];
  return (rows[0]?.items ?? []).map(({ featured, ...f }) => ({ form: { ...f, count: 0, average: null } as FeedbackForm, featured: featured as FeedbackReview[] }));
}
export async function submitFeedback(input: unknown) {
  const d = feedbackResponseSchema.parse(input);
  if (d.company) return { ok: true };
  await sql`select public.submit_public_feedback(${d.formId}::uuid,${d.rating}::int,${d.comment},${d.reviewerName},${d.allowFeatured})`;
  return { ok: true };
}