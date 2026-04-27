/**
 * Marco Extension — Recorder Live Tree Panel
 *
 * Compact in-page tree of `Project → StepGroup → SubGroup → Steps`
 * rendered inside the Floating Controller's Expanded mode. Reads from
 * the same `useStepLibrary` hook as the Options Step Group Library
 * panel, so any step the recorder appends shows up here within one
 * React tick and the Options panel updates in lockstep (both share the
 * same `localStorage`-backed sql.js DB).
 *
 * Selection is broadcast via {@link useRecorderSelection} so clicking
 * a row here also activates the matching row in Options, and clicking
 * in Options highlights the corresponding row here.
 *
 * @see ../../hooks/use-step-library.ts
 * @see ../../hooks/use-recorder-selection.ts
 * @see ./FloatingController.tsx
 */

import { useEffect, useMemo, useState } from "react";
import {
    ChevronDown,
    ChevronRight,
    FolderOpen,
    Folder,
    Layers,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { stepKindLabel, useStepLibrary } from "@/hooks/use-step-library";
import { useRecorderSelection } from "@/hooks/use-recorder-selection";
import type { StepGroupRow, StepRow } from "@/background/recorder/step-library/db";

interface TreeNode {
    readonly Group: StepGroupRow;
    readonly Children: TreeNode[];
}

function buildForest(groups: ReadonlyArray<StepGroupRow>): TreeNode[] {
    const byParent = new Map<number | null, StepGroupRow[]>();
    for (const g of groups) {
        const key = g.ParentStepGroupId;
        const list = byParent.get(key) ?? [];
        list.push(g);
        byParent.set(key, list);
    }
    const sortFn = (a: StepGroupRow, b: StepGroupRow) =>
        a.OrderIndex - b.OrderIndex || a.Name.localeCompare(b.Name);
    const build = (parent: number | null): TreeNode[] =>
        (byParent.get(parent) ?? [])
            .slice()
            .sort(sortFn)
            .map((g) => ({ Group: g, Children: build(g.StepGroupId) }));
    return build(null);
}

function defaultExpanded(forest: TreeNode[]): Set<number> {
    // Auto-expand root + first level so the user sees structure
    // without an extra click after the controller opens.
    const set = new Set<number>();
    for (const root of forest) {
        set.add(root.Group.StepGroupId);
        for (const child of root.Children) {
            set.add(child.Group.StepGroupId);
        }
    }
    return set;
}

export function RecorderLiveTreePanel(): JSX.Element {
    const lib = useStepLibrary();
    const { selection, select } = useRecorderSelection("controller");
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [didAutoExpand, setDidAutoExpand] = useState(false);

    const forest = useMemo(() => buildForest(lib.Groups), [lib.Groups]);

    useEffect(() => {
        if (didAutoExpand || forest.length === 0) { return; }
        setExpanded(defaultExpanded(forest));
        setDidAutoExpand(true);
    }, [didAutoExpand, forest]);

    // When the Options panel selects a group, expand its ancestor chain.
    useEffect(() => {
        if (selection.StepGroupId === null) { return; }
        setExpanded((prev) => {
            const next = new Set(prev);
            let cursor: number | null = selection.StepGroupId;
            const byId = new Map(lib.Groups.map((g) => [g.StepGroupId, g] as const));
            while (cursor !== null) {
                next.add(cursor);
                const row = byId.get(cursor);
                cursor = row?.ParentStepGroupId ?? null;
            }
            return next;
        });
    }, [selection.StepGroupId, lib.Groups]);

    const toggle = (id: number) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            return next;
        });
    };

    if (lib.Loading) {
        return <div className="text-[11px] text-muted-foreground p-2">Loading library…</div>;
    }
    if (lib.Project === null) {
        return <div className="text-[11px] text-muted-foreground p-2">No project loaded.</div>;
    }

    return (
        <div className="border-t border-border/40 mt-1 pt-1.5">
            <div className="flex items-center gap-1.5 px-1 pb-1">
                <Layers className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Live tree</span>
                <Badge variant="outline" className="ml-auto text-[9px] px-1">
                    {lib.Groups.length} group{lib.Groups.length === 1 ? "" : "s"}
                </Badge>
            </div>
            <ScrollArea className="h-[220px] pr-1">
                <div className="px-1 pb-1">
                    <ProjectRow
                        name={lib.Project.Name}
                        active={selection.StepGroupId === null}
                        onClick={() => select({ StepGroupId: null, StepId: null })}
                    />
                    {forest.length === 0 ? (
                        <div className="text-[11px] text-muted-foreground italic px-3 pt-1">
                            No groups yet — recorded steps will appear here.
                        </div>
                    ) : forest.map((node) => (
                        <GroupNode
                            key={node.Group.StepGroupId}
                            node={node}
                            depth={1}
                            expanded={expanded}
                            onToggle={toggle}
                            selectedGroupId={selection.StepGroupId}
                            selectedStepId={selection.StepId}
                            stepsByGroup={lib.StepsByGroup}
                            onSelect={(payload) => select(payload)}
                        />
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function ProjectRow(props: { name: string; active: boolean; onClick: () => void }): JSX.Element {
    return (
        <button
            type="button"
            onClick={props.onClick}
            className={cn(
                "w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left transition-colors",
                "text-[12px]",
                props.active ? "bg-primary/10 text-foreground" : "hover:bg-muted/50 text-foreground",
            )}
            data-testid="controller-tree-project"
        >
            <Folder className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium truncate">{props.name}</span>
        </button>
    );
}

interface GroupNodeProps {
    readonly node: TreeNode;
    readonly depth: number;
    readonly expanded: ReadonlySet<number>;
    readonly onToggle: (id: number) => void;
    readonly selectedGroupId: number | null;
    readonly selectedStepId: number | null;
    readonly stepsByGroup: ReadonlyMap<number, ReadonlyArray<StepRow>>;
    readonly onSelect: (payload: { StepGroupId: number | null; StepId: number | null }) => void;
}

function GroupNode(props: GroupNodeProps): JSX.Element {
    const { node, depth, expanded, onToggle, selectedGroupId, selectedStepId, stepsByGroup, onSelect } = props;
    const isOpen = expanded.has(node.Group.StepGroupId);
    const isActive = selectedGroupId === node.Group.StepGroupId && selectedStepId === null;
    const steps = stepsByGroup.get(node.Group.StepGroupId) ?? [];
    const hasChildren = node.Children.length > 0 || steps.length > 0;
    return (
        <div>
            <div
                className={cn(
                    "flex items-center gap-1 rounded transition-colors group",
                    isActive ? "bg-primary/10" : "hover:bg-muted/40",
                )}
                style={{ paddingLeft: `${depth * 10}px` }}
            >
                <button
                    type="button"
                    onClick={() => onToggle(node.Group.StepGroupId)}
                    className="p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={isOpen ? "Collapse" : "Expand"}
                    aria-expanded={isOpen}
                    disabled={!hasChildren}
                >
                    {hasChildren
                        ? (isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)
                        : <span className="inline-block w-3" />}
                </button>
                <button
                    type="button"
                    onClick={() => onSelect({ StepGroupId: node.Group.StepGroupId, StepId: null })}
                    className="flex-1 min-w-0 flex items-center gap-1.5 py-0.5 text-left text-[12px]"
                    data-testid={`controller-tree-group-${node.Group.StepGroupId}`}
                >
                    {isOpen ? <FolderOpen className="h-3 w-3 text-muted-foreground" /> : <Folder className="h-3 w-3 text-muted-foreground" />}
                    <span className="truncate">{node.Group.Name}</span>
                    {steps.length > 0 ? (
                        <Badge variant="outline" className="text-[9px] px-1 ml-auto">{steps.length}</Badge>
                    ) : null}
                </button>
            </div>
            {isOpen ? (
                <>
                    {node.Children.map((child) => (
                        <GroupNode
                            key={child.Group.StepGroupId}
                            node={child}
                            depth={depth + 1}
                            expanded={expanded}
                            onToggle={onToggle}
                            selectedGroupId={selectedGroupId}
                            selectedStepId={selectedStepId}
                            stepsByGroup={stepsByGroup}
                            onSelect={onSelect}
                        />
                    ))}
                    {steps.map((step) => (
                        <StepRowNode
                            key={step.StepId}
                            step={step}
                            depth={depth + 1}
                            isActive={selectedStepId === step.StepId}
                            onClick={() => onSelect({ StepGroupId: node.Group.StepGroupId, StepId: step.StepId })}
                        />
                    ))}
                </>
            ) : null}
        </div>
    );
}

function StepRowNode(props: {
    readonly step: StepRow;
    readonly depth: number;
    readonly isActive: boolean;
    readonly onClick: () => void;
}): JSX.Element {
    const { step, depth, isActive, onClick } = props;
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "w-full flex items-center gap-1.5 py-0.5 rounded text-left text-[11px] transition-colors",
                isActive ? "bg-primary/15 text-foreground" : "hover:bg-muted/40 text-muted-foreground",
            )}
            style={{ paddingLeft: `${depth * 10 + 18}px` }}
            data-testid={`controller-tree-step-${step.StepId}`}
        >
            <Badge variant="secondary" className="text-[9px] px-1 py-0 font-mono">
                {stepKindLabel(step.StepKindId)}
            </Badge>
            <span className="truncate">
                {step.Label ?? `Step #${step.StepId}`}
            </span>
        </button>
    );
}
