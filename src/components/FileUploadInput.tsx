import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { X, Check, FileText, Image, Music } from "lucide-react";
import { uploadFile, UploadableFileType } from "@/lib/fileUpload";
import { useToast } from "@/hooks/use-toast";

interface FileUploadInputProps {
  type: UploadableFileType;
  value: string;
  onValueChange: (url: string) => void;
}

const typeConfig: Record<
  UploadableFileType,
  {
    label: string;
    accept: string;
    icon: React.ReactNode;
    description: string;
    badge: string;
    badgeColor: string;
  }
> = {
  image: {
    label: "Upload Image",
    accept: "image/jpeg,image/png,image/gif,image/webp",
    icon: <Image className="w-4 h-4 text-white" />,
    description: "JPEG, PNG, GIF, WebP (max 10MB)",
    badge: "IMG",
    badgeColor: "bg-primary",
  },
  pdf: {
    label: "Upload PDF",
    accept: "application/pdf",
    icon: <FileText className="w-4 h-4 text-white" />,
    description: "PDF files (max 10MB)",
    badge: "PDF",
    badgeColor: "bg-destructive",
  },
  mp3: {
    label: "Upload MP3",
    accept: "audio/mpeg,audio/mp3",
    icon: <Music className="w-4 h-4 text-white" />,
    description: "MP3 audio files (max 10MB)",
    badge: "MP3",
    badgeColor: "bg-emerald-500",
  },
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function FileBadge({ type }: { type: UploadableFileType }) {
  const config = typeConfig[type];
  return (
    <div className={`w-10 h-10 rounded-lg ${config.badgeColor} flex items-center justify-center`}>
      {config.icon}
    </div>
  );
}

export function FileUploadInput({ type, value, onValueChange }: FileUploadInputProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const config = typeConfig[type];

  const processFile = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setUploadProgress(0);
      setFileName(file.name);
      setFileSize(file.size);

      // Create image preview for image files
      if (type === "image" && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setImagePreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }

      const result = await uploadFile(file, type, {
        onProgress: (progress) => setUploadProgress(progress),
      });

      setIsUploading(false);

      if (result.success && result.url) {
        onValueChange(result.url);
        toast({
          title: "File uploaded!",
          description: "Your QR code now links to this file.",
        });
      } else {
        setFileName(null);
        setFileSize(null);
        setImagePreview(null);
        toast({
          title: "Upload failed",
          description: result.error || "An error occurred during upload.",
          variant: "destructive",
        });
      }
    },
    [type, onValueChange, toast],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await processFile(file);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isUploading) {
        setIsDragOver(true);
      }
    },
    [isUploading],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (isUploading) return;

      const files = e.dataTransfer.files;
      if (files.length === 0) return;

      const file = files[0];
      await processFile(file);
    },
    [isUploading, processFile],
  );

  const handleClear = () => {
    onValueChange("");
    setFileName(null);
    setFileSize(null);
    setImagePreview(null);
    setUploadProgress(0);
  };

  // File item component for uploading/uploaded states
  const FileItem = ({ showProgress }: { showProgress?: boolean }) => (
    <div className="flex items-center gap-3 px-4 py-3 bg-background rounded-xl border border-border">
      {/* File Preview/Badge */}
      <div className="flex-shrink-0">
        {imagePreview ? (
          <div className="w-10 h-10 rounded-lg overflow-hidden">
            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
          </div>
        ) : (
          <FileBadge type={type} />
        )}
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{fileName || "File"}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{fileSize ? formatFileSize(fileSize) : ""}</span>
          {!showProgress && value && (
            <>
              <span className="text-muted-foreground">|</span>
              <span className="flex items-center gap-1 text-primary">
                <Check className="w-3 h-3" />
                100%
              </span>
            </>
          )}
        </div>
      </div>

      {/* Progress bar or close button */}
      {showProgress ? (
        <div className="flex items-center gap-2 flex-shrink-0 w-24">
          <Progress value={uploadProgress} className="h-1.5 flex-1" />
          <span className="text-xs text-muted-foreground w-8 text-right">{uploadProgress}%</span>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClear}
          aria-label="Bestand verwijderen"
          className="flex-shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="input-label">{config.label}</p>

      {value ? (
        <FileItem />
      ) : isUploading ? (
        <FileItem showProgress />
      ) : (
        <Button
          type="button"
          variant="outline"
          aria-label={config.label}
          className={`relative flex flex-col items-center justify-center gap-2 p-6 h-[120px] rounded-xl transition-all cursor-pointer ${
            isDragOver
              ? "border border-transparent bg-[#EEF2FF]"
              : "border-2 border-dashed border-border hover:border-primary/50"
          }`}
          style={
            isDragOver
              ? {
                  background: "#EEF2FF",
                  border: "1px solid transparent",
                  backgroundImage:
                    "linear-gradient(#EEF2FF, #EEF2FF), linear-gradient(91deg, #4613FF 0%, #BFDEFF 100%)",
                  backgroundOrigin: "border-box",
                  backgroundClip: "padding-box, border-box",
                  boxShadow:
                    "0 134px 38px 0 rgba(0, 0, 0, 0.00), 0 86px 34px 0 rgba(0, 0, 0, 0.00), 0 48px 29px 0 rgba(0, 0, 0, 0.01), 0 21px 21px 0 rgba(0, 0, 0, 0.02), 0 5px 12px 0 rgba(0, 0, 0, 0.02)",
                }
              : undefined
          }
          onClick={() => inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isDragOver ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
            }`}
          >
            {type === "image" && <Image className="w-5 h-5" />}
            {type === "pdf" && <FileText className="w-5 h-5" />}
            {type === "mp3" && <Music className="w-5 h-5" />}
          </div>
          <div className="text-center">
            <p className={`text-sm font-medium ${isDragOver ? "text-primary" : ""}`}>
              {isDragOver ? "Drop file here" : "Click or drag to upload"}
            </p>
            {!isDragOver && <p className="text-xs text-muted-foreground">{config.description}</p>}
          </div>
        </Button>
      )}

      <input ref={inputRef} type="file" aria-label={config.label} accept={config.accept} onChange={handleFileChange} className="hidden" disabled={isUploading} />

      <p className="text-sm text-muted-foreground">
        Upload a file and we'll generate a QR code linking to it
      </p>
    </div>
  );
}
