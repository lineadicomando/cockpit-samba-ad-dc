import React, { useState, useMemo } from "react";
import {
    Alert,
    Button,
    EmptyState,
    EmptyStateBody,
    Label,
    PageSection,
    SearchInput,
    Skeleton,
    Spinner,
    Toolbar,
    ToolbarContent,
    ToolbarItem,
} from "@patternfly/react-core";
import {
    ActionsColumn,
    Table,
    Tbody,
    Td,
    Th,
    Thead,
    Tr,
} from "@patternfly/react-table";
import type { IAction } from "@patternfly/react-table";

import { listGroupsLight, getGroupDetails, refreshGroup } from "../lib/samba.ts";
import { useTwoPhaseLoad } from "../lib/hooks.ts";
import type { AnyGroup } from "../lib/types.ts";
import { CreateGroupModal } from "./modals/CreateGroupModal.tsx";
import { ManageMembersModal } from "./modals/ManageMembersModal.tsx";
import { DeleteGroupModal } from "./modals/DeleteGroupModal.tsx";
import { RenameGroupModal } from "./modals/RenameGroupModal.tsx";

// ---------------------------------------------------------------------------
// GroupsPage
// ---------------------------------------------------------------------------
type ModalState =
    | { kind: "none" }
    | { kind: "create" }
    | { kind: "manageMembers"; group: AnyGroup }
    | { kind: "rename"; group: AnyGroup }
    | { kind: "delete"; group: AnyGroup };

export function GroupsPage() {
    const {
        items: groups,
        setItems: setGroups,
        loading,
        detailsLoading,
        error,
        reload: loadGroups,
    } = useTwoPhaseLoad("name", listGroupsLight, getGroupDetails);

    const [search, setSearch] = useState("");
    const [modal, setModal] = useState<ModalState>({ kind: "none" });

    const filtered = useMemo<AnyGroup[]>(() => {
        if (detailsLoading || !search) return groups;
        const q = search.toLowerCase();
        return groups.filter(g => {
            if (g.name.toLowerCase().includes(q)) return true;
            if (g.detailsLoaded) {
                return g.description.toLowerCase().includes(q);
            }
            return false;
        });
    }, [groups, detailsLoading, search]);

    function rowActions(g: AnyGroup): IAction[] {
        return [
            {
                title: "Manage members",
                onClick: () => setModal({ kind: "manageMembers", group: g }),
            },
            {
                title: "Rename group",
                onClick: () => setModal({ kind: "rename", group: g }),
                isDisabled: g.isProtected,
            },
            { isSeparator: true, title: "" },
            {
                title: "Delete group",
                onClick: () => setModal({ kind: "delete", group: g }),
                isDisabled: g.isProtected,
                isDanger: true,
            },
        ];
    }

    return (
        <PageSection>
            {/* ---- Toolbar ---- */}
            <Toolbar>
                <ToolbarContent>
                    <ToolbarItem>
                        <SearchInput
                            placeholder="Filter by name or description"
                            value={search}
                            onChange={(_evt, val) => setSearch(val)}
                            onClear={() => setSearch("")}
                            aria-label="Filter groups"
                            isDisabled={detailsLoading}
                        />
                    </ToolbarItem>
                    <ToolbarItem>
                        <Label color="blue">{groups.length} groups</Label>
                    </ToolbarItem>
                    {detailsLoading && (
                        <ToolbarItem>
                            <Spinner size="sm" aria-label="Loading group details" />
                        </ToolbarItem>
                    )}
                    <ToolbarItem align={{ default: "alignEnd" }}>
                        <Button
                            variant="primary"
                            onClick={() => setModal({ kind: "create" })}
                        >
                            Create group
                        </Button>
                    </ToolbarItem>
                    <ToolbarItem>
                        <Button
                            variant="secondary"
                            onClick={loadGroups}
                            isDisabled={loading || detailsLoading}
                        >
                            Refresh
                        </Button>
                    </ToolbarItem>
                </ToolbarContent>
            </Toolbar>

            {/* ---- Inline errors ---- */}
            {error && (
                <Alert variant="danger" isInline title="Failed to load groups" style={{ marginBottom: "1rem" }}>
                    {error}
                </Alert>
            )}

            {/* ---- Loading spinner (phase 1 only) ---- */}
            {loading && (
                <div style={{ textAlign: "center", padding: "2rem" }}>
                    <Spinner aria-label="Loading groups" />
                </div>
            )}

            {/* ---- Empty state ---- */}
            {!loading && !error && filtered.length === 0 && (
                <EmptyState
                    titleText={search ? "No groups match the filter" : "No groups found"}
                    headingLevel="h4"
                >
                    <EmptyStateBody>
                        {search ? "Try clearing the search filter." : "No domain groups are available."}
                    </EmptyStateBody>
                </EmptyState>
            )}

            {/* ---- Groups table ---- */}
            {!loading && filtered.length > 0 && (
                <Table aria-label="Groups table" variant="compact">
                    <Thead>
                        <Tr>
                            <Th>Name</Th>
                            <Th>ID</Th>
                            <Th>Members</Th>
                            <Th>Type</Th>
                            <Th aria-label="Row actions" />
                        </Tr>
                    </Thead>
                    <Tbody>
                        {filtered.map(g => (
                            <Tr key={g.name}>
                                <Td dataLabel="Name">{g.name}</Td>
                                <Td dataLabel="ID">
                                    {g.detailsLoaded ? g.id : <Skeleton width="50px" />}
                                </Td>
                                <Td dataLabel="Members">
                                    {g.detailsLoaded ? g.memberCount : <Skeleton width="30px" />}
                                </Td>
                                <Td dataLabel="Type">
                                    {g.detailsLoaded ? (
                                        g.isProtected
                                            ? <Label color="gold">Protected</Label>
                                            : <Label color="blue">Custom</Label>
                                    ) : <Skeleton width="70px" />}
                                </Td>
                                <Td isActionCell>
                                    <ActionsColumn items={rowActions(g)} />
                                </Td>
                            </Tr>
                        ))}
                    </Tbody>
                </Table>
            )}

            {/* ---- Modals ---- */}
            {modal.kind === "create" && (
                <CreateGroupModal
                    onClose={() => setModal({ kind: "none" })}
                    onSuccess={() => { setModal({ kind: "none" }); loadGroups(); }}
                />
            )}
            {modal.kind === "manageMembers" && (
                <ManageMembersModal
                    group={modal.group}
                    onClose={() => setModal({ kind: "none" })}
                    onSuccess={async () => {
                        const groupName = modal.group.name;
                        setModal({ kind: "none" });
                        try {
                            const updated = await refreshGroup(groupName);
                            setGroups(prev => prev.map(g => g.name === groupName ? updated : g));
                        } catch {
                            // stale member count is acceptable; user can refresh manually
                        }
                    }}
                />
            )}
            {modal.kind === "rename" && (
                <RenameGroupModal
                    group={modal.group}
                    onClose={() => setModal({ kind: "none" })}
                    onSuccess={() => { setModal({ kind: "none" }); loadGroups(); }}
                />
            )}
            {modal.kind === "delete" && (
                <DeleteGroupModal
                    group={modal.group}
                    onClose={() => setModal({ kind: "none" })}
                    onSuccess={() => {
                        const groupName = modal.group.name;
                        setModal({ kind: "none" });
                        setGroups(prev => prev.filter(g => g.name !== groupName));
                    }}
                />
            )}
        </PageSection>
    );
}
