"use client";

import { useEffect } from "react";
import { UploadCloud } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/store/app-store";

export function UploadDropzone() {
  const { uploadProgress, setUploadProgress } = useAppStore();

  useEffect(() => {
    const timer = window.setInterval(() => {
      setUploadProgress(uploadProgress >= 94 ? 58 : uploadProgress + 6);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [setUploadProgress, uploadProgress]);

  return (
    <div className="rounded-lg border border-dashed bg-[#fbfcfe] p-5">
      <div className="flex items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-md bg-[#f5ecd0] text-[#9b740e]">
          <UploadCloud className="size-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-mercy-navy">Upload document set</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Drag PDFs, DOCX files, pleadings, contracts, and exhibits into the vault.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Progress value={uploadProgress} />
            <span className="w-10 text-right text-xs font-medium text-mercy-navy">{uploadProgress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
