/**
 * Token Seeder Status Indicator
 *
 * Compact row for the System Status panel that surfaces JWT seed
 * failures on inaccessible tabs and shows a live countdown until the
 * next retry attempt across all blocked tabs.
 *
 * Hides itself when no tabs are currently throttled.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ShieldOff, Timer } from "lucide-react";
import { sendMessage } from "@/lib/message-client";

interface InaccessibleSeedTarget {
    tabId: number;
    tabUrl: string;
    reason: string;
    code: string;
    firstFailureAt: number;
    lastFailureAt: number;
    attemptCount: number;
    cooldownMs: number;
}

interface TokenSeederDiagnostics {
    targets: InaccessibleSeedTarget[];
    cooldownMs: number;
    capturedAt: string;
}

const POLL_INTERVAL_MS = 5_000;
const TICK_INTERVAL_MS = 500;

function formatRemaining(ms: number): string {
    if (ms <= 0) return "ready";
    return `${Math.ceil(ms / 1000)}s`;
}

export function TokenSeederStatusIndicator() {
    const [data, setData] = useState<TokenSeederDiagnostics | null>(null);
    const [now, setNow] = useState<number>(() => Date.now());
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchDiagnostics = useCallback(async () => {
        try {
            const res = await sendMessage<TokenSeederDiagnostics>({
                type: "GET_TOKEN_SEEDER_DIAGNOSTICS",
            });
            setData(res);
        } catch {
            // Background may not be ready — silently skip this poll
        }
    }, []);

    useEffect(() => {
        void fetchDiagnostics();
        pollRef.current = setInterval(() => void fetchDiagnostics(), POLL_INTERVAL_MS);
        tickRef.current = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
            if (tickRef.current) clearInterval(tickRef.current);
        };
    }, [fetchDiagnostics]);

    const targets = data?.targets ?? [];

    const nextRetryMs = useMemo(() => {
        if (targets.length === 0) return 0;
        const remainings = targets.map((t) => Math.max(0, t.cooldownMs - (now - t.lastFailureAt)));
        return Math.min(...remainings);
    }, [targets, now]);

    if (targets.length === 0) {
        return null;
    }

    const isReady = nextRetryMs <= 0;

    return (
        <div
            className="flex items-center justify-between rounded-md border border-warning/40 bg-warning/10 px-3 py-2"
            title={`${targets.length} tab(s) blocked Chrome scripting access. Token seeding will retry automatically.`}
        >
            <div className="flex items-center gap-2 min-w-0">
                <ShieldOff className="h-4 w-4 text-warning shrink-0" />
                <span className="text-sm">Token Seed Blocked</span>
            </div>
            <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                    {targets.length} tab{targets.length === 1 ? "" : "s"}
                </Badge>
                <span className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
                    <Timer className="h-3 w-3" />
                    {isReady ? "retrying…" : `retry in ${formatRemaining(nextRetryMs)}`}
                </span>
            </div>
        </div>
    );
}

export default TokenSeederStatusIndicator;
