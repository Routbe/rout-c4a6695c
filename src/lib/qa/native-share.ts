/** Keep the actual OS share call synchronous with the user's click. */
export function storyFile(blob: Blob, filename: string): File {
  if (!blob.size || !/^(image\/png|video\/(webm|mp4))$/.test(blob.type)) throw new Error("invalid_story_file");
  return new File([blob], filename, { type: blob.type });
}
export function supportsStoryShare(file: File): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] }) === true;
}
export async function shareStoryFile(file: File): Promise<"shared" | "cancelled"> {
  if (!supportsStoryShare(file)) throw new Error("file_share_unavailable");
  try {
    await navigator.share({ files: [file] });
    return "shared";
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return "cancelled";
    throw error;
  }
}