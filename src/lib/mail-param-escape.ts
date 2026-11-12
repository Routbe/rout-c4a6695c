/** HTML-escape a user-controlled value before it is placed in an email template parameter. */
export function escapeMailParam(value: string | null | undefined): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
