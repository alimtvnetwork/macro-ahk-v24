/**
 * Marco Extension — Keyword Events Panel
 *
 * UI for managing custom keyword events that fire scripted key presses and
 * wait periods during recorder playback. Backed by {@link useKeywordEvents}
 * (localStorage-persisted). Pure presentational; mounted from the recorder
 * surface via a Dialog trigger.
 */

import { useState } from "react";
import { ArrowDown, ArrowUp, Clock, Keyboard, Play, Plus, Square, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useKeywordEvents } from "@/hooks/use-keyword-events";
import { useKeywordEventPlayback } from "@/hooks/use-keyword-event-playback";
import { cn } from "@/lib/utils";

export interface KeywordEventsPanelProps {
    readonly trigger?: React.ReactNode;
    readonly className?: string;
}

export function KeywordEventsPanel(props: KeywordEventsPanelProps): JSX.Element {
    const { trigger, className } = props;
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button
                        size="sm"
                        variant="outline"
                        className={cn("h-8 px-3", className)}
                        data-testid="keyword-events-open"
                    >
                        <Keyboard className="h-3.5 w-3.5 mr-1" />
                        Keyword Events
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Custom Keyword Events</DialogTitle>
                    <DialogDescription>
                        Attach keywords that trigger scripted key presses and wait periods during playback.
                    </DialogDescription>
                </DialogHeader>
                <KeywordEventsEditor />
            </DialogContent>
        </Dialog>
    );
}

function KeywordEventsEditor(): JSX.Element {
    const api = useKeywordEvents();
    const playback = useKeywordEventPlayback();
    const [newKeyword, setNewKeyword] = useState("");

    const handleAdd = () => {
        const k = newKeyword.trim();
        if (!k) return;
        api.addEvent(k);
        setNewKeyword("");
    };

    return (
        <div className="space-y-3" data-testid="keyword-events-panel">
            <div className="flex items-center gap-2">
                <Input
                    value={newKeyword}
                    onChange={e => setNewKeyword(e.target.value)}
                    placeholder="New keyword (e.g. submit-form)"
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
                    className="h-9"
                    data-testid="keyword-events-new-input"
                />
                <Button onClick={handleAdd} disabled={!newKeyword.trim()} size="sm" className="h-9">
                    <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
            </div>

            <Separator />

            <ScrollArea className="h-[420px] pr-3">
                {api.events.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-12">
                        No keyword events yet. Add one above to script key presses and waits.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {api.events.map(ev => (
                            <KeywordEventCard
                                key={ev.Id}
                                event={ev}
                                isRunning={playback.isRunning(ev.Id)}
                                currentStepIndex={playback.isRunning(ev.Id) ? playback.currentStepIndex : null}
                                onPlay={() => { void playback.play(ev); }}
                                onCancel={playback.cancel}
                                onRemove={() => api.removeEvent(ev.Id)}
                                onUpdate={patch => api.updateEvent(ev.Id, patch)}
                                onAddStep={step => api.addStep(ev.Id, step)}
                                onRemoveStep={sid => api.removeStep(ev.Id, sid)}
                                onMoveStep={(sid, dir) => api.moveStep(ev.Id, sid, dir)}
                            />
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}

interface KeywordEventCardProps {
    readonly event: import("@/hooks/use-keyword-events").KeywordEvent;
    readonly isRunning: boolean;
    readonly currentStepIndex: number | null;
    readonly onPlay: () => void;
    readonly onCancel: () => void;
    readonly onRemove: () => void;
    readonly onUpdate: (patch: Partial<Omit<import("@/hooks/use-keyword-events").KeywordEvent, "Id">>) => void;
    readonly onAddStep: (step: Omit<import("@/hooks/use-keyword-events").KeywordEventStep, "Id">) => void;
    readonly onRemoveStep: (stepId: string) => void;
    readonly onMoveStep: (stepId: string, dir: "up" | "down") => void;
}

function KeywordEventCard(props: KeywordEventCardProps): JSX.Element {
    const { event, isRunning, currentStepIndex, onPlay, onCancel, onRemove, onUpdate, onAddStep, onRemoveStep, onMoveStep } = props;
    const [keyCombo, setKeyCombo] = useState("");
    const [waitMs, setWaitMs] = useState("500");

    return (
        <div
            className={cn(
                "rounded-md border border-border bg-card/60 p-3 space-y-3 transition-shadow",
                isRunning && "ring-2 ring-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]",
            )}
            data-testid={`keyword-event-${event.Id}`}
        >
            <div className="flex items-center gap-2">
                <Input
                    value={event.Keyword}
                    onChange={e => onUpdate({ Keyword: e.target.value })}
                    className="h-8 font-medium"
                    aria-label="Keyword"
                />
                <div className="flex items-center gap-1.5">
                    <Switch
                        checked={event.Enabled}
                        onCheckedChange={v => onUpdate({ Enabled: v })}
                        aria-label="Enabled"
                    />
                    <Label className="text-xs text-muted-foreground">{event.Enabled ? "On" : "Off"}</Label>
                </div>
                {isRunning ? (
                    <Button
                        size="sm"
                        variant="destructive"
                        className="h-8"
                        onClick={onCancel}
                        data-testid={`keyword-event-stop-${event.Id}`}
                        aria-label="Stop keyword event playback"
                    >
                        <Square className="h-3.5 w-3.5 mr-1" /> Stop
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        variant="secondary"
                        className="h-8"
                        onClick={onPlay}
                        disabled={!event.Enabled || event.Steps.length === 0}
                        data-testid={`keyword-event-play-${event.Id}`}
                        aria-label="Run keyword event"
                    >
                        <Play className="h-3.5 w-3.5 mr-1" /> Run
                    </Button>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onRemove} aria-label="Remove keyword event">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            <Input
                value={event.Description}
                onChange={e => onUpdate({ Description: e.target.value })}
                placeholder="Optional description"
                className="h-8 text-xs"
            />

            <div className="space-y-1.5">
                {event.Steps.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No steps yet — add a key press or wait below.</p>
                )}
                {event.Steps.map((s, i) => (
                    <div
                        key={s.Id}
                        className={cn(
                            "flex items-center gap-2 rounded bg-muted/40 px-2 py-1.5 text-xs transition-colors",
                            currentStepIndex === i && "bg-primary/15 ring-1 ring-primary/40",
                        )}
                    >
                        <Badge variant="outline" className="text-[10px] w-6 justify-center">{i + 1}</Badge>
                        {s.Kind === "Key" ? (
                            <>
                                <Keyboard className="h-3.5 w-3.5 text-primary" />
                                <code className="font-mono">{s.Combo}</code>
                            </>
                        ) : (
                            <>
                                <Clock className="h-3.5 w-3.5 text-primary" />
                                <span>Wait <strong>{s.DurationMs}</strong> ms</span>
                            </>
                        )}
                        <div className="ml-auto flex items-center gap-0.5">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMoveStep(s.Id, "up")} disabled={i === 0} aria-label="Move step up">
                                <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMoveStep(s.Id, "down")} disabled={i === event.Steps.length - 1} aria-label="Move step down">
                                <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => onRemoveStep(s.Id)} aria-label="Remove step">
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5">
                    <Input
                        value={keyCombo}
                        onChange={e => setKeyCombo(e.target.value)}
                        placeholder="Enter / Ctrl+Tab"
                        className="h-8 text-xs"
                        aria-label="Key combo"
                    />
                    <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 shrink-0"
                        disabled={!keyCombo.trim()}
                        onClick={() => { onAddStep({ Kind: "Key", Combo: keyCombo.trim() } as Omit<import("@/hooks/use-keyword-events").KeywordEventStep, "Id">); setKeyCombo(""); }}
                    >
                        <Plus className="h-3 w-3 mr-1" /> Key
                    </Button>
                </div>
                <div className="flex items-center gap-1.5">
                    <Input
                        type="number"
                        min={0}
                        value={waitMs}
                        onChange={e => setWaitMs(e.target.value)}
                        placeholder="ms"
                        className="h-8 text-xs"
                        aria-label="Wait duration in milliseconds"
                    />
                    <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 shrink-0"
                        onClick={() => {
                            const n = Math.max(0, Math.floor(Number(waitMs) || 0));
                            onAddStep({ Kind: "Wait", DurationMs: n } as Omit<import("@/hooks/use-keyword-events").KeywordEventStep, "Id">);
                        }}
                    >
                        <Plus className="h-3 w-3 mr-1" /> Wait
                    </Button>
                </div>
            </div>
        </div>
    );
}
