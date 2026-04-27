/**
 * Marco Extension — Keyword Event Bulk Context Menu
 *
 * Right-click menu for the keyword events list. Shown on selected rows;
 * exposes bulk Run-state toggles, Add/Remove tags, Rename in sequence,
 * Export selected as ZIP, and Delete.
 *
 * Why a dedicated component:
 *   • Keeps `KeywordEventsPanel.tsx` focused on layout/selection plumbing.
 *   • Centralises the dialog state for the three multi-step actions
 *     (tags, rename, export) so reuse by other surfaces (Steps, Sessions,
 *     Scripts/Projects) is a matter of swapping the data source.
 *
 * The Export action ships JSON-in-ZIP today; the SQLite-in-ZIP pipeline is
 * a separate roadmap item tracked in plan.md.
 */

import { useMemo, useState } from "react";
import {
    Download,
    Eye,
    EyeOff,
    FolderTree,
    Pencil,
    Tag,
    TagsIcon,
    Trash2,
} from "lucide-react";

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    DEFAULT_SEQUENCE_RENAME,
    collectCategories,
    mergeTags,
    normaliseCategory,
    parseTagInput,
    removeTags,
    renderSequenceName,
    type SequenceRenameInput,
} from "@/lib/keyword-event-bulk-actions";
import { downloadKeywordEventsZip } from "@/lib/keyword-events-sqlite-export";
import type { KeywordEvent } from "@/hooks/use-keyword-events";

export interface KeywordEventBulkContextMenuProps {
    /** The row this menu wraps. Right-clicking it opens the menu. */
    readonly children: React.ReactNode;
    /** Events that are currently part of the selection set. */
    readonly selectedEvents: ReadonlyArray<KeywordEvent>;
    /** Called when the user right-clicks a row that isn't yet selected — the
     *  parent should add it to the selection so the menu acts on it. */
    readonly onContextOpenForUnselected?: () => void;
    /** True when the wrapped row is itself in the selection. */
    readonly isRowSelected: boolean;
    /** Apply a patch to one event by id. */
    readonly onUpdateEvent: (id: string, patch: Partial<Omit<KeywordEvent, "Id">>) => void;
    /** Delete one event by id. */
    readonly onRemoveEvent: (id: string) => void;
    /** Clear the selection set (called after destructive actions). */
    readonly onClearSelection: () => void;
}

type DialogKind = null | "tags-add" | "tags-remove" | "category" | "rename" | "export";

export function KeywordEventBulkContextMenu(
    props: KeywordEventBulkContextMenuProps,
): JSX.Element {
    const {
        children, selectedEvents, isRowSelected, onContextOpenForUnselected,
        onUpdateEvent, onRemoveEvent, onClearSelection,
    } = props;

    const [dialog, setDialog] = useState<DialogKind>(null);
    const count = selectedEvents.length;

    const handleOpenChange = (open: boolean): void => {
        if (open && !isRowSelected) onContextOpenForUnselected?.();
    };

    const handleEnable = (enabled: boolean): void => {
        for (const ev of selectedEvents) onUpdateEvent(ev.Id, { Enabled: enabled });
    };

    const handleDelete = (): void => {
        for (const ev of selectedEvents) onRemoveEvent(ev.Id);
        onClearSelection();
    };

    return (
        <>
            <ContextMenu onOpenChange={handleOpenChange}>
                <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
                <ContextMenuContent
                    className="w-56"
                    data-testid="keyword-events-context-menu"
                >
                    <ContextMenuLabel className="text-xs text-muted-foreground">
                        {count} selected
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        onSelect={() => handleEnable(true)}
                        data-testid="keyword-events-context-enable"
                    >
                        <Eye className="mr-2 h-4 w-4" /> Enable
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => handleEnable(false)}
                        data-testid="keyword-events-context-disable"
                    >
                        <EyeOff className="mr-2 h-4 w-4" /> Disable
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        onSelect={() => setDialog("tags-add")}
                        data-testid="keyword-events-context-tags-add"
                    >
                        <Tag className="mr-2 h-4 w-4" /> Add labels…
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => setDialog("tags-remove")}
                        data-testid="keyword-events-context-tags-remove"
                    >
                        <TagsIcon className="mr-2 h-4 w-4" /> Remove labels…
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => setDialog("category")}
                        data-testid="keyword-events-context-category"
                    >
                        <FolderTree className="mr-2 h-4 w-4" /> Set category…
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => setDialog("rename")}
                        data-testid="keyword-events-context-rename"
                    >
                        <Pencil className="mr-2 h-4 w-4" /> Rename in sequence…
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => setDialog("export")}
                        data-testid="keyword-events-context-export"
                    >
                        <Download className="mr-2 h-4 w-4" /> Export selected as ZIP…
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={handleDelete}
                        data-testid="keyword-events-context-delete"
                    >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            <BulkTagsDialog
                mode="add"
                open={dialog === "tags-add"}
                onOpenChange={(o) => setDialog(o ? "tags-add" : null)}
                selectedEvents={selectedEvents}
                onApply={(tags) => {
                    for (const ev of selectedEvents) {
                        onUpdateEvent(ev.Id, { Tags: mergeTags(ev.Tags, tags) });
                    }
                }}
            />
            <BulkTagsDialog
                mode="remove"
                open={dialog === "tags-remove"}
                onOpenChange={(o) => setDialog(o ? "tags-remove" : null)}
                selectedEvents={selectedEvents}
                onApply={(tags) => {
                    for (const ev of selectedEvents) {
                        onUpdateEvent(ev.Id, { Tags: removeTags(ev.Tags, tags) });
                    }
                }}
            />
            <BulkRenameSequenceDialog
                open={dialog === "rename"}
                onOpenChange={(o) => setDialog(o ? "rename" : null)}
                selectedEvents={selectedEvents}
                onApply={(input) => {
                    selectedEvents.forEach((ev, i) => {
                        onUpdateEvent(ev.Id, { Keyword: renderSequenceName(input, i) });
                    });
                }}
            />
            <BulkCategoryDialog
                open={dialog === "category"}
                onOpenChange={(o) => setDialog(o ? "category" : null)}
                selectedEvents={selectedEvents}
                onApply={(category) => {
                    for (const ev of selectedEvents) {
                        onUpdateEvent(ev.Id, { Category: category });
                    }
                }}
            />
            <BulkExportDialog
                open={dialog === "export"}
                onOpenChange={(o) => setDialog(o ? "export" : null)}
                selectedEvents={selectedEvents}
            />
        </>
    );
}

/* ------------------------------------------------------------------ */
/*  Tags dialog                                                       */
/* ------------------------------------------------------------------ */

interface BulkTagsDialogProps {
    readonly mode: "add" | "remove";
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly selectedEvents: ReadonlyArray<KeywordEvent>;
    readonly onApply: (tags: string[]) => void;
}

function BulkTagsDialog(props: BulkTagsDialogProps): JSX.Element {
    const { mode, open, onOpenChange, selectedEvents, onApply } = props;
    const [raw, setRaw] = useState("");
    const tags = useMemo(() => parseTagInput(raw), [raw]);
    const existing = useMemo(() => {
        const all = new Set<string>();
        for (const ev of selectedEvents) {
            (ev.Tags ?? []).forEach(t => all.add(t));
        }
        return Array.from(all).sort((a, b) => a.localeCompare(b));
    }, [selectedEvents]);

    const handleApply = (): void => {
        if (tags.length === 0) return;
        onApply(tags);
        setRaw("");
        onOpenChange(false);
    };

    const title = mode === "add" ? "Add labels" : "Remove labels";
    const desc = mode === "add"
        ? `Label ${selectedEvents.length} selected event${selectedEvents.length === 1 ? "" : "s"}.`
        : `Remove labels from ${selectedEvents.length} selected event${selectedEvents.length === 1 ? "" : "s"}.`;

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) setRaw(""); onOpenChange(o); }}>
            <DialogContent data-testid={`keyword-events-bulk-tags-dialog-${mode}`}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{desc} Separate labels with commas or spaces.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="bulk-tags-input">Labels</Label>
                        <Input
                            id="bulk-tags-input"
                            value={raw}
                            onChange={(e) => setRaw(e.target.value)}
                            placeholder="e.g. login, smoke, regression"
                            autoFocus
                            data-testid="keyword-events-bulk-tags-input"
                        />
                    </div>
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {tags.map(t => (
                                <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                            ))}
                        </div>
                    )}
                    {mode === "remove" && existing.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">Existing labels on selection:</p>
                            <div className="flex flex-wrap gap-1">
                                {existing.map(t => (
                                    <Badge
                                        key={t}
                                        variant="outline"
                                        className="cursor-pointer text-[10px]"
                                        onClick={() => setRaw(r => r.length === 0 ? t : `${r}, ${t}`)}
                                    >
                                        {t}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={handleApply}
                        disabled={tags.length === 0}
                        data-testid={`keyword-events-bulk-tags-apply-${mode}`}
                    >
                        {mode === "add" ? "Add" : "Remove"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/*  Rename in sequence dialog                                          */
/* ------------------------------------------------------------------ */

interface BulkRenameSequenceDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly selectedEvents: ReadonlyArray<KeywordEvent>;
    readonly onApply: (input: SequenceRenameInput) => void;
}

function BulkRenameSequenceDialog(props: BulkRenameSequenceDialogProps): JSX.Element {
    const { open, onOpenChange, selectedEvents, onApply } = props;
    const [input, setInput] = useState<SequenceRenameInput>(DEFAULT_SEQUENCE_RENAME);

    const previews = useMemo(
        () => selectedEvents.slice(0, 5).map((ev, i) => ({
            old: ev.Keyword,
            next: renderSequenceName(input, i),
        })),
        [selectedEvents, input],
    );

    const handleApply = (): void => {
        onApply(input);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid="keyword-events-bulk-rename-dialog">
                <DialogHeader>
                    <DialogTitle>Rename in sequence</DialogTitle>
                    <DialogDescription>
                        Renames {selectedEvents.length} event{selectedEvents.length === 1 ? "" : "s"}.
                        Use <code>{"{n}"}</code> in the base to control number placement.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1.5">
                        <Label htmlFor="bulk-rename-base">Base name</Label>
                        <Input
                            id="bulk-rename-base"
                            value={input.Base}
                            onChange={(e) => setInput(s => ({ ...s, Base: e.target.value }))}
                            data-testid="keyword-events-bulk-rename-base"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="bulk-rename-start">Start number</Label>
                        <Input
                            id="bulk-rename-start"
                            type="number"
                            min={0}
                            value={input.Start}
                            onChange={(e) => setInput(s => ({ ...s, Start: Math.max(0, Number(e.target.value) || 0) }))}
                            data-testid="keyword-events-bulk-rename-start"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="bulk-rename-padding">Padding</Label>
                        <Input
                            id="bulk-rename-padding"
                            type="number"
                            min={1}
                            max={6}
                            value={input.Padding}
                            onChange={(e) => setInput(s => ({ ...s, Padding: Math.max(1, Math.min(6, Number(e.target.value) || 1)) }))}
                            data-testid="keyword-events-bulk-rename-padding"
                        />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                        <Label htmlFor="bulk-rename-separator">Separator (used when {"{n}"} is absent)</Label>
                        <Input
                            id="bulk-rename-separator"
                            value={input.Separator}
                            onChange={(e) => setInput(s => ({ ...s, Separator: e.target.value }))}
                            data-testid="keyword-events-bulk-rename-separator"
                        />
                    </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                    <p className="mb-1 font-medium text-muted-foreground">Preview</p>
                    <ul className="space-y-0.5 font-mono">
                        {previews.map((p, i) => (
                            <li key={i} className="flex gap-2">
                                <span className="truncate text-muted-foreground line-through">{p.old}</span>
                                <span aria-hidden>→</span>
                                <span className="truncate text-foreground">{p.next}</span>
                            </li>
                        ))}
                        {selectedEvents.length > previews.length && (
                            <li className="text-muted-foreground">…and {selectedEvents.length - previews.length} more</li>
                        )}
                    </ul>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleApply} data-testid="keyword-events-bulk-rename-apply">
                        Rename
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/*  Category dialog                                                    */
/* ------------------------------------------------------------------ */

interface BulkCategoryDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly selectedEvents: ReadonlyArray<KeywordEvent>;
    /** undefined => clear category. Trimmed, whitespace-collapsed string => set. */
    readonly onApply: (category: string | undefined) => void;
}

function BulkCategoryDialog(props: BulkCategoryDialogProps): JSX.Element {
    const { open, onOpenChange, selectedEvents, onApply } = props;
    const [raw, setRaw] = useState("");
    const existing = useMemo(() => collectCategories(selectedEvents), [selectedEvents]);
    const normalised = normaliseCategory(raw);

    const handleSet = (): void => {
        onApply(normalised);
        setRaw("");
        onOpenChange(false);
    };

    const handleClear = (): void => {
        onApply(undefined);
        setRaw("");
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) setRaw(""); onOpenChange(o); }}>
            <DialogContent data-testid="keyword-events-bulk-category-dialog">
                <DialogHeader>
                    <DialogTitle>Set category</DialogTitle>
                    <DialogDescription>
                        Assigns a single category to {selectedEvents.length} selected
                        event{selectedEvents.length === 1 ? "" : "s"}. Categories are a
                        primary grouping bucket — use labels for multi-tagging.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="bulk-category-input">Category</Label>
                        <Input
                            id="bulk-category-input"
                            value={raw}
                            onChange={(e) => setRaw(e.target.value)}
                            placeholder="e.g. Auth, Smoke, Regression"
                            autoFocus
                            data-testid="keyword-events-bulk-category-input"
                        />
                    </div>
                    {existing.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">
                                Existing categories on selection (click to reuse):
                            </p>
                            <div className="flex flex-wrap gap-1">
                                {existing.map(c => (
                                    <Badge
                                        key={c}
                                        variant="outline"
                                        className="cursor-pointer text-[10px]"
                                        onClick={() => setRaw(c)}
                                    >
                                        {c}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        variant="outline"
                        onClick={handleClear}
                        data-testid="keyword-events-bulk-category-clear"
                    >
                        Clear category
                    </Button>
                    <Button
                        onClick={handleSet}
                        disabled={normalised === undefined}
                        data-testid="keyword-events-bulk-category-apply"
                    >
                        Set
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/*  Export dialog                                                      */
/* ------------------------------------------------------------------ */

interface BulkExportDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly selectedEvents: ReadonlyArray<KeywordEvent>;
}

function BulkExportDialog(props: BulkExportDialogProps): JSX.Element {
    const { open, onOpenChange, selectedEvents } = props;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleExport = async (): Promise<void> => {
        setBusy(true);
        setError(null);
        try {
            // Real SQLite DB inside the .zip — same PascalCase + Uid + Meta
            // conventions as `marco-backup.zip`, with a `bundle_kind` marker
            // so a future importer can branch between full backups and
            // partial keyword-event bundles. A JSON snapshot ships alongside
            // for diff-friendly review and JSON-only re-import.
            await downloadKeywordEventsZip(selectedEvents);
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Export failed");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid="keyword-events-bulk-export-dialog">
                <DialogHeader>
                    <DialogTitle>Export selected as ZIP</DialogTitle>
                    <DialogDescription>
                        Bundles {selectedEvents.length} event{selectedEvents.length === 1 ? "" : "s"} into a
                        downloadable .zip containing a real SQLite database
                        (<code>keyword-events.db</code>) plus a
                        readable <code>keyword-events.json</code> snapshot —
                        the same export format the app uses elsewhere.
                    </DialogDescription>
                </DialogHeader>
                {error && (
                    <p className="text-xs text-destructive" role="alert">{error}</p>
                )}
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
                    <Button
                        onClick={() => { void handleExport(); }}
                        disabled={busy || selectedEvents.length === 0}
                        data-testid="keyword-events-bulk-export-apply"
                    >
                        {busy ? "Building…" : "Download .zip"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
