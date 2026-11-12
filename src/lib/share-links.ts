/** Snapchat camera with the link already attached to the snap. */
export function snapchatAttachUrl(link: string): string {
  return `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(link)}`;
}

/** WhatsApp chat picker with the message already typed. */
export function whatsappTextUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
