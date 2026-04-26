/**
 * Marco Extension — Selector Comparison Panel
 *
 * Visualises the per-selector outcome of a replay attempt so the user can
 * see at a glance which selector failed and which DOM element (if any) was
 * found. Designed to live next to or inside the failure post-mortem flow.
 *
 * Pure presentation — the comparison itself is computed by
 * `compareSelectorAttempts` (background module). This component only renders
 * the result.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, Crosshair } from "lucide-react";
import type { SelectorComparison, SelectorAttemptComparison } from "@/background/recorder/selector-comparison";
import type { DomContext } from "@/background/recorder/failure-logger";

interface SelectorComparisonPanelProps {
    readonly comparison: SelectorComparison;
}

function elementSummary(el: DomContext | null): string {
    if (el === null) return "no match";
    const attrs: string[] = [];
    if (el.Id !== null)        attrs.push(`#${el.Id}`);
    if (el.ClassName !== null) attrs.push(`.${el.ClassName.split(/\s+/).filter(Boolean).join(".")}`);
    const head = `<${el.TagName}${attrs.length > 0 ? ` ${attrs.join("")}` : ""}>`;
    if (el.TextSnippet.length === 0) return head;
    return `${head} "${el.TextSnippet}"`;
}

function AttemptRow({ attempt }: { attempt: SelectorAttemptComparison }) {
    const matched = attempt.Matched;
    const Icon = matched ? CheckCircle2 : XCircle;
    const tone = matched ? "text-emerald-500" : "text-destructive";
    const border = attempt.IsPrimary
        ? matched ? "border-emerald-500/40" : "border-destructive/40"
        : "border-border";

    return (
        <li className={`rounded-md border ${border} bg-card p-2.5 text-xs space-y-1`}>
            <div className="flex items-center gap-2">
                <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden />
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{attempt.Kind}</Badge>
                {attempt.IsPrimary && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">PRIMARY</Badge>
                )}
                <code className="text-muted-foreground truncate" title={attempt.Expression}>
                    {attempt.Expression}
                </code>
                <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    {attempt.MatchCount} match{attempt.MatchCount === 1 ? "" : "es"}
                </Badge>
            </div>

            {attempt.ResolvedExpression !== attempt.Expression && (
                <div className="text-[11px] text-muted-foreground pl-5">
                    Resolved: <code>{attempt.ResolvedExpression}</code>
                </div>
            )}

            <div className="flex items-start gap-2 pl-5">
                <Crosshair className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" aria-hidden />
                <code className={`${matched ? "text-foreground" : "text-muted-foreground italic"} break-all`}>
                    {elementSummary(attempt.Element)}
                </code>
            </div>

            {attempt.Error !== null && (
                <div className="pl-5 text-destructive text-[11px]">Error: {attempt.Error}</div>
            )}
        </li>
    );
}

export function SelectorComparisonPanel({ comparison }: SelectorComparisonPanelProps) {
    const { Attempts, PrimaryMatched, AnyFallbackMatched, DriftDetected } = comparison;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Crosshair className="h-4 w-4 text-primary" />
                    Selector Comparison
                    <Badge
                        variant={PrimaryMatched ? "secondary" : "destructive"}
                        className="ml-1 text-[10px]"
                    >
                        {PrimaryMatched ? "Primary OK" : "Primary failed"}
                    </Badge>
                    {AnyFallbackMatched && (
                        <Badge variant="outline" className="text-[10px]">Fallback found</Badge>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {DriftDetected && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                            <strong>Selector drift:</strong> the primary selector no longer matches,
                            but a fallback resolved. Consider promoting the fallback or repairing the primary.
                        </span>
                    </div>
                )}
                {Attempts.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2 text-center">
                        No selectors recorded for this step.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {Attempts.map((a) => <AttemptRow key={a.SelectorId} attempt={a} />)}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
