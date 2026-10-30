"use client";
/**
 * components/cloudinary/CloudinaryUploadProgress.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Animated progress indicator shown while evidence is being uploaded
 * to Cloudinary. Shows the 4-stage pipeline:
 *   Encrypt → Hash → Upload to Cloudinary → Anchor
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";
import { Cloud, Lock, Hash, Link } from "lucide-react";
import { clsx } from "clsx";

type Stage = "encrypt" | "hash" | "upload" | "anchor" | "done";

interface CloudinaryUploadProgressProps {
  stage: Stage;
  filename?: string;
}

const STAGES: { key: Stage; icon: React.ReactNode; label: string }[] = [
  { key: "encrypt", icon: <Lock className="w-4 h-4" />, label: "AES-256-GCM encrypt" },
  { key: "hash",    icon: <Hash className="w-4 h-4" />,  label: "SHA-256 integrity hash" },
  { key: "upload",  icon: <Cloud className="w-4 h-4" />, label: "Upload to Cloudinary" },
  { key: "anchor",  icon: <Link className="w-4 h-4" />,  label: "Blockchain anchor" },
];

const STAGE_ORDER: Stage[] = ["encrypt", "hash", "upload", "anchor", "done"];

export function CloudinaryUploadProgress({
  stage,
  filename,
}: CloudinaryUploadProgressProps) {
  const currentIndex = STAGE_ORDER.indexOf(stage);

  return (
    <div className="space-y-3 p-4 rounded-2xl bg-slate-900/70 border border-slate-700/40">
      {filename && (
        <p className="text-xs text-slate-400 truncate">
          <span className="text-slate-300 font-medium">Uploading:</span> {filename}
        </p>
      )}

      <div className="space-y-2">
        {STAGES.map((s, i) => {
          const stageIdx = STAGE_ORDER.indexOf(s.key);
          const isActive = stageIdx === currentIndex;
          const isDone   = currentIndex > stageIdx || stage === "done";
          const isPending = !isActive && !isDone;

          return (
            <div
              key={s.key}
              className={clsx(
                "flex items-center gap-3 text-xs font-medium transition-all duration-300",
                isActive  && "text-blue-300",
                isDone    && "text-emerald-400",
                isPending && "text-slate-600"
              )}
            >
              {/* Status indicator */}
              <span
                className={clsx(
                  "flex items-center justify-center w-5 h-5 rounded-full border transition-all duration-300",
                  isActive  && "border-blue-500 bg-blue-500/20 animate-pulse",
                  isDone    && "border-emerald-500 bg-emerald-500/20",
                  isPending && "border-slate-700 bg-transparent"
                )}
              >
                {isDone ? (
                  <span className="text-emerald-400 text-[10px]">✓</span>
                ) : (
                  <span className={clsx(isActive ? "text-blue-400" : "text-slate-600")}>
                    {s.icon}
                  </span>
                )}
              </span>

              <span>{s.label}</span>

              {isActive && (
                <span className="ml-auto text-[10px] text-blue-400 animate-pulse">
                  In progress…
                </span>
              )}
              {isDone && (
                <span className="ml-auto text-[10px] text-emerald-500">
                  Complete
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Overall progress bar */}
      <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
          style={{
            width: stage === "done" ? "100%" : `${(currentIndex / (STAGE_ORDER.length - 1)) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
