export type UploadableFileType = "image" | "pdf" | "mp3";

interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

interface UploadOptions {
  onProgress?: (progress: number) => void;
  /** How long the shared file stays available: 1, 7 or 30 days (default 7). */
  days?: 1 | 7 | 30;
}

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "audio/mpeg",
  "audio/mp3",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (server enforces the same)

// Client-side pre-validation (actual validation happens server-side)
const isValidMimeType = (file: File): boolean => {
  return ALLOWED_MIME_TYPES.includes(file.type);
};

export const uploadFile = async (
  file: File,
  type: UploadableFileType,
  options?: UploadOptions,
): Promise<UploadResult> => {
  // Client-side pre-validation for better UX (server validates again)
  if (!isValidMimeType(file)) {
    return {
      success: false,
      error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP, PDF, MP3",
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      error: "File too large. Maximum size is 5MB.",
    };
  }

  if (file.size === 0) {
    return {
      success: false,
      error: "File is empty.",
    };
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);
  formData.append("days", String(options?.days ?? 7));

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && options?.onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100);
        options.onProgress(progress);
      }
    });

    xhr.addEventListener("load", () => {
      try {
        const data = JSON.parse(xhr.responseText);

        if (xhr.status >= 200 && xhr.status < 300 && data.url) {
          resolve({ success: true, url: data.url });
        } else {
          console.error("Upload error:", data);
          resolve({ success: false, error: data.error || "Upload failed" });
        }
      } catch {
        console.error("Parse error:", xhr.responseText);
        resolve({ success: false, error: "Failed to parse server response" });
      }
    });

    xhr.addEventListener("error", () => {
      console.error("Upload network error");
      resolve({ success: false, error: "Network error during upload" });
    });

    xhr.addEventListener("abort", () => {
      resolve({ success: false, error: "Upload was cancelled" });
    });

    xhr.open("POST", "/api/public/qr/upload");
    xhr.send(formData);
  });
};
