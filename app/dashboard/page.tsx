"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  AlertTriangle,
  Lock,
  Search,
  Users,
  Activity,
  Clock,
  Database,
  Trash2,
  ShieldOff,
} from "lucide-react";
import {
  getStoredContacts,
  getStoredEvidence,
  getStoredScanHistory,
  getStoredSosEvents,
} from "@/lib/storage";
import { seedDemoDataset, clearAllLocalData } from "@/lib/demoSeed";
import {
  buildActivityFeed,
  computeDailyTrend,
  computeReadiness,
  computeSafetyScore,
  computeThreatDistribution,
  formatBytes,
  isSevere,
  summarizeVault,
  withinDays,
} from "@/lib/safetyScore";
import {
  EvidenceItem,
  SosEvent,
  ThreatAnalysisResult,
  TrustedContact,
} from "@/lib/types";
import { ScorePanel } from "@/components/dashboard/ScorePanel";
import {
  StatTile,
  TrendChart,
  DistributionBars,
} from "@/components/dashboard/Charts";
import { ActivityFeed, ReadinessList } from "@/components/dashboard/Streams";
import { GlobalThreatSection } from "@/components/dashboard/GlobalThreatSection";
import { SakhiHero } from "@/components/dashboard/SakhiHero";

const TREND_DAYS = 14;

interface DashboardStats {
  totalCases: number;
  totalEvidence: number;
  encryptedEvidence: number;
  cloudinaryBacked: number;
  totalContacts: number;
  verifiedContacts: number;
  hasPrimary: boolean;
}

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [scans, setScans] = useState<ThreatAnalysisResult[]>([]);
  const [sosEvents, setSosEvents] = useState<SosEvent[]>([]);
  const [dbStats, setDbStats] = useState<DashboardStats | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [recentCases, setRecentCases] = useState<Array<{
    id: string; caseNumber: string | null; title: string | null;
    severity: string | null; status: string | null; createdAt: string;
  }>>([]);

  const refresh = useCallback(() => {
    setContacts(getStoredContacts());
    setEvidence(getStoredEvidence());
    setScans(getStoredScanHistory());
    setSosEvents(getStoredSosEvents());
  }, []);

  // Load real DB stats
  const loadDbStats = useCallback(async () => {
    setDbLoading(true);
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) {
        const data = await res.json();
        setDbStats(data.stats);
        setRecentCases(data.recentCases || []);
      }
    } catch {
      // Non-fatal — local data still shows
    } finally {
      setDbLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    setMounted(true);
    loadDbStats();
  }, [refresh, loadDbStats]);

  // Another tab writing to the vault or the scan log refreshes this one too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("cyber_sakhi_")) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const inputs = useMemo(
    () => ({ scans, evidence, contacts, sosEvents }),
    [scans, evidence, contacts, sosEvents]
  );

  const score = useMemo(() => computeSafetyScore(inputs), [inputs]);
  const trend = useMemo(() => computeDailyTrend(scans, TREND_DAYS), [scans]);
  const distribution = useMemo(() => computeThreatDistribution(scans), [scans]);
  const readiness = useMemo(() => computeReadiness(inputs), [inputs]);
  const vault = useMemo(() => summarizeVault(evidence), [evidence]);
  const feed = useMemo(
    () => buildActivityFeed(scans, evidence, sosEvents, 6),
    [scans, evidence, sosEvents]
  );

  const scans7 = scans.filter((s) => withinDays(s.timestamp, 7)).length;
  const severeAll = scans.filter((s) => isSevere(s.threatLevel)).length;
  const severe14 = scans.filter(
    (s) => isSevere(s.threatLevel) && withinDays(s.timestamp, 14)
  ).length;
  const verifiedContacts = contacts.filter((c) => c.isVerified).length;
  const hasPrimary = contacts.some((c) => c.isPrimary && c.isVerified);

  const handleSeed = () => {
    seedDemoDataset();
    refresh();
  };

  const handleClear = () => {
    if (
      window.confirm(
        "Clear every scan, evidence artifact, contact and SOS record stored in this browser? This cannot be undone."
      )
    ) {
      clearAllLocalData();
      refresh();
    }
  };

  // localStorage is not available during SSR, so hold a skeleton until mount
  // rather than rendering server values the client would immediately replace.
  if (!mounted) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-72 rounded-lg bg-slate-800/60 animate-pulse" />
        <div className="h-40 rounded-3xl bg-slate-900/60 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-slate-900/60 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Sakhi ID hero — Sambhav's, kept verbatim */}
      <SakhiHero />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emergency-950/70 border border-emergency-500/40 text-emergency-300 text-xs font-semibold">
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Personal Security Telemetry</span>
          </div>
          {/* h2, not h1: the Sakhi hero above already owns the page heading. */}
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Safety Command Dashboard
          </h2>
          <p className="text-sm text-slate-300">
            Every figure below is computed from the records held in this browser.
          </p>
        </div>
      </div>

      {/* Empty-history callout — shown instead of inventing numbers */}
      {scans.length === 0 && (
        <div className="p-5 rounded-2xl glass-panel border-amber-700/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldOff className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-white">
                No Screening History On This Device Yet
              </h2>
              <p className="text-xs text-slate-400 max-w-2xl">
                The threat charts stay empty until messages are screened, rather
                than filling in placeholder figures. Screen a real message, or
                load the walkthrough dataset to see the dashboard populated.
              </p>
            </div>
          </div>
          <button
            onClick={handleSeed}
            className="px-4 py-2 rounded-xl bg-amber-950/70 hover:bg-amber-900 border border-amber-500/40 text-amber-200 text-xs font-bold transition flex items-center gap-1.5 shrink-0"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Load Demo Dataset</span>
          </button>
        </div>
      )}

      {/* Metrics row — DB stats take priority over localStorage counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Investigation Cases"
          value={dbStats ? dbStats.totalCases : scans.length}
          sub={dbStats ? `${recentCases.length} recent` : `${scans7} scans in last 7 days`}
          icon={<Search className="w-4 h-4 text-emergency-400" />}
        />
        <StatTile
          label="Severe Detections"
          value={dbStats
            ? recentCases.filter(c => ["high","critical"].includes((c.severity||"").toLowerCase())).length
            : severeAll}
          sub={dbStats ? "high/critical cases" : `${severe14} in the last 14 days`}
          tone={severeAll > 0 ? "alert" : "neutral"}
          icon={<AlertTriangle className="w-4 h-4 text-orange-400" />}
        />
        <StatTile
          label="Evidence Vaulted"
          value={dbStats ? dbStats.totalEvidence : vault.total}
          sub={
            dbStats
              ? `${dbStats.encryptedEvidence} encrypted · ${dbStats.cloudinaryBacked} cloud-backed`
              : vault.total === 0
              ? "Vault empty"
              : `${vault.pct}% checksum verified · ${formatBytes(vault.bytes)}`
          }
          tone={
            (dbStats ? dbStats.totalEvidence > 0 : vault.total > 0 && vault.pct === 100)
              ? "good"
              : "neutral"
          }
          icon={<Lock className="w-4 h-4 text-emergency-400" />}
        />
        <StatTile
          label="Trusted Circle"
          value={dbStats ? dbStats.verifiedContacts : verifiedContacts}
          sub={
            dbStats
              ? `${dbStats.verifiedContacts} of ${dbStats.totalContacts} verified · ${dbStats.hasPrimary ? "primary set" : "no primary"}`
              : `${verifiedContacts} of ${contacts.length} verified · ${hasPrimary ? "primary set" : "no primary"}`
          }
          tone={
            (dbStats
              ? dbStats.verifiedContacts >= 1 && dbStats.hasPrimary
              : verifiedContacts >= 3 && hasPrimary)
              ? "good"
              : "neutral"
          }
          icon={<Users className="w-4 h-4 text-emerald-400" />}
        />
      </div>

      {/* Score model + charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5">
          <ScorePanel result={score} />
        </div>

        <div className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-emergency-400" />
              <span>Screening Volume · Last {TREND_DAYS} Days</span>
            </h3>
            {scans.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                Nothing screened in the last {TREND_DAYS} days.
              </p>
            ) : (
              <TrendChart days={trend} />
            )}
          </div>

          <div className="p-6 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-emergency-400" />
              <span>Threat Category Mix</span>
            </h3>
            {distribution.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                No risk factors detected yet. Categories appear once the engine
                flags a message.
              </p>
            ) : (
              <DistributionBars slices={distribution} />
            )}
          </div>
        </div>
      </div>

      {/* Activity + readiness */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7">
          <div className="p-6 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-emergency-400" />
                <span>Recent Activity</span>
              </h3>
              <Link
                href="/locker"
                className="text-xs text-emergency-400 hover:underline"
              >
                Open Vault
              </Link>
            </div>
            <ActivityFeed entries={feed} />
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="p-6 rounded-2xl glass-panel border-emergency-900/30">
            <ReadinessList items={readiness} />
          </div>
        </div>
      </div>

      {/* Global landscape — context around the personal numbers above */}
      <GlobalThreatSection />

      {/* Recent cases from DB (when user is logged in) */}
      {recentCases.length > 0 && (
        <div className="p-6 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-emergency-400" />
            <span>Recent Investigation Cases</span>
          </h3>
          <div className="space-y-2">
            {recentCases.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-emergency-300 shrink-0">{c.caseNumber || "—"}</span>
                  <span className="text-slate-300 truncate">{c.title || "Untitled"}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                    c.severity === "critical" ? "bg-red-950 text-red-300 border border-red-700/50" :
                    c.severity === "high" ? "bg-orange-950 text-orange-300 border border-orange-700/50" :
                    "bg-slate-900 text-slate-400 border border-slate-700"
                  }`}>{c.severity || "unknown"}</span>
                  <span className="text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data controls */}
      <div className="p-4 rounded-2xl glass-card border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500 max-w-xl">
          All records are stored in this browser only. Nothing on this page is
          uploaded to a server, and clearing site data removes it permanently.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSeed}
            className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold transition flex items-center gap-1.5"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Load Demo Dataset</span>
          </button>
          <button
            onClick={handleClear}
            className="px-3.5 py-2 rounded-lg bg-red-950/50 hover:bg-red-900/60 border border-red-800/50 text-red-300 text-[11px] font-semibold transition flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Local Data</span>
          </button>
        </div>
      </div>
    </div>
  );
}
