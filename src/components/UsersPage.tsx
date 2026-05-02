import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
    Alert,
    Button,
    EmptyState,
    EmptyStateBody,
    Label,
    MenuToggle,
    PageSection,
    SearchInput,
    Select,
    SelectList,
    SelectOption,
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

import cockpit from "cockpit";
import { listUsersLight, getUserDetails, refreshUser, enableUser, disableUser, listGroupsLight } from "../lib/samba.ts";
import { useTwoPhaseLoad } from "../lib/hooks.ts";
import type { AnyUser, User } from "../lib/types.ts";
import { CreateUserModal } from "./modals/CreateUserModal.tsx";
import { DeleteUserModal } from "./modals/DeleteUserModal.tsx";

// ---------------------------------------------------------------------------
// UsersPage
// ---------------------------------------------------------------------------
type ModalState =
    | { kind: "none" }
    | { kind: "create" }
    | { kind: "delete"; user: AnyUser };

export function UsersPage() {
    const {
        items: users,
        setItems: setUsers,
        loading,
        detailsLoading,
        error,
        reload: loadUsers,
    } = useTwoPhaseLoad("username", listUsersLight, getUserDetails);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Disabled">("all");
    const [statusSelectOpen, setStatusSelectOpen] = useState(false);
    const [groupFilter, setGroupFilter] = useState<string | null>(null);
    const [groupSelectOpen, setGroupSelectOpen] = useState(false);
    const [groupSearch, setGroupSearch] = useState("");
    const [allGroups, setAllGroups] = useState<string[]>([]);

    useEffect(() => {
        listGroupsLight()
            .then(rows => setAllGroups(rows.map(r => r.name).sort((a, b) => a.localeCompare(b))))
            .catch(() => setAllGroups([]));
    }, []);

    const [modal, setModal] = useState<ModalState>({ kind: "none" });
    const [actionError, setActionError] = useState<string | null>(null);
    const [sortIndex, setSortIndex] = useState<number | null>(null);
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

    function onSort(_evt: React.MouseEvent, index: number, direction: "asc" | "desc") {
        setSortIndex(index);
        setSortDir(direction);
    }

    const handleToggleUser = useCallback(async (user: User) => {
        setActionError(null);
        try {
            if (user.status === "Active") {
                await disableUser(user.username);
            } else {
                await enableUser(user.username);
            }
            const updated = await refreshUser(user.username);
            setUsers(prev => prev.map(u => u.username === user.username ? updated : u));
        } catch (err: unknown) {
            setActionError(err instanceof Error ? err.message : String(err));
        }
    }, [setUsers]);

    const filtered = useMemo<AnyUser[]>(() => {
        let result = users;
        if (!detailsLoading && statusFilter !== "all") {
            result = result.filter(u => u.detailsLoaded && u.status === statusFilter);
        }
        if (!detailsLoading && search) {
            const q = search.toLowerCase();
            result = result.filter(u => {
                if (u.username.toLowerCase().includes(q)) return true;
                if (u.detailsLoaded) {
                    return u.fullName.toLowerCase().includes(q) || u.id.toLowerCase().includes(q);
                }
                return false;
            });
        }
        if (!detailsLoading && groupFilter !== null) {
            result = result.filter(u => u.detailsLoaded && u.groups.includes(groupFilter));
        }
        if (sortIndex !== null) {
            result = [...result].sort((a, b) => {
                let aVal: string | number;
                let bVal: string | number;
                switch (sortIndex) {
                    case 0: aVal = a.username.toLowerCase(); bVal = b.username.toLowerCase(); break;
                    case 1: aVal = a.detailsLoaded ? a.fullName.toLowerCase() : ""; bVal = b.detailsLoaded ? b.fullName.toLowerCase() : ""; break;
                    case 2: aVal = a.detailsLoaded ? (parseInt(a.id) || 0) : 0; bVal = b.detailsLoaded ? (parseInt(b.id) || 0) : 0; break;
                    case 3: aVal = a.detailsLoaded ? a.status : ""; bVal = b.detailsLoaded ? b.status : ""; break;
                    default: return 0;
                }
                if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
                if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [users, detailsLoading, search, statusFilter, groupFilter, sortIndex, sortDir]);

    const activeCount = useMemo(
        () => users.filter(u => u.detailsLoaded && u.status === "Active").length,
        [users],
    );

    return (
        <PageSection>
            {/* ---- Toolbar ---- */}
            <Toolbar>
                <ToolbarContent>
                    <ToolbarItem>
                        <SearchInput
                            placeholder="Filter by username or name"
                            value={search}
                            onChange={(_evt, val) => setSearch(val)}
                            onClear={() => setSearch("")}
                            aria-label="Filter users"
                            isDisabled={detailsLoading}
                        />
                    </ToolbarItem>
                    <ToolbarItem>
                        <Select
                            isOpen={statusSelectOpen}
                            onOpenChange={setStatusSelectOpen}
                            onSelect={(_evt, val) => {
                                setStatusFilter(val as "all" | "Active" | "Disabled");
                                setStatusSelectOpen(false);
                            }}
                            selected={statusFilter}
                            toggle={(ref) => (
                                <MenuToggle
                                    ref={ref}
                                    onClick={() => setStatusSelectOpen(o => !o)}
                                    isExpanded={statusSelectOpen}
                                    isDisabled={detailsLoading}
                                >
                                    {statusFilter === "all" ? "All statuses" : statusFilter}
                                </MenuToggle>
                            )}
                        >
                            <SelectList>
                                <SelectOption value="all">All statuses</SelectOption>
                                <SelectOption value="Active">Active</SelectOption>
                                <SelectOption value="Disabled">Disabled</SelectOption>
                            </SelectList>
                        </Select>
                    </ToolbarItem>
                    <ToolbarItem>
                        <Select
                            isOpen={groupSelectOpen}
                            onOpenChange={isOpen => { setGroupSelectOpen(isOpen); if (!isOpen) setGroupSearch(""); }}
                            onSelect={(_evt, val) => {
                                setGroupFilter(val === "all" ? null : val as string);
                                setGroupSelectOpen(false);
                            }}
                            selected={groupFilter ?? "all"}
                            toggle={(ref) => (
                                <MenuToggle
                                    ref={ref}
                                    onClick={() => setGroupSelectOpen(o => !o)}
                                    isExpanded={groupSelectOpen}
                                    isDisabled={detailsLoading}
                                >
                                    {groupFilter ?? "All groups"}
                                </MenuToggle>
                            )}
                        >
                            <div style={{ padding: "4px 8px" }}>
                                <SearchInput
                                    value={groupSearch}
                                    onChange={(_e, val) => setGroupSearch(val)}
                                    onClear={() => setGroupSearch("")}
                                    placeholder="Filter groups…"
                                    onClick={e => e.stopPropagation()}
                                />
                            </div>
                            <SelectList style={{ maxHeight: "200px", overflowY: "auto" }}>
                                {!groupSearch && <SelectOption value="all">All groups</SelectOption>}
                                {allGroups
                                    .filter(g => g.toLowerCase().includes(groupSearch.toLowerCase()))
                                    .map(g => <SelectOption key={g} value={g}>{g}</SelectOption>)
                                }
                            </SelectList>
                        </Select>
                    </ToolbarItem>
                    <ToolbarItem>
                        <Label color="blue">{users.length} users</Label>
                    </ToolbarItem>
                    {!detailsLoading && (
                        <ToolbarItem>
                            <Label color="green">{activeCount} active</Label>
                        </ToolbarItem>
                    )}
                    {detailsLoading && (
                        <ToolbarItem>
                            <Spinner size="sm" aria-label="Loading user details" />
                        </ToolbarItem>
                    )}
                    <ToolbarItem align={{ default: "alignEnd" }}>
                        <Button
                            variant="primary"
                            onClick={() => setModal({ kind: "create" })}
                        >
                            Create user
                        </Button>
                    </ToolbarItem>
                    <ToolbarItem>
                        <Button
                            variant="secondary"
                            onClick={loadUsers}
                            isDisabled={loading || detailsLoading}
                        >
                            Refresh
                        </Button>
                    </ToolbarItem>
                </ToolbarContent>
            </Toolbar>

            {/* ---- Inline errors ---- */}
            {error && (
                <Alert variant="danger" isInline title="Failed to load users" style={{ marginBottom: "1rem" }}>
                    {error}
                </Alert>
            )}
            {actionError && (
                <Alert variant="danger" isInline title="Action failed" style={{ marginBottom: "1rem" }}>
                    {actionError}
                </Alert>
            )}

            {/* ---- Loading spinner (phase 1 only) ---- */}
            {loading && (
                <div style={{ textAlign: "center", padding: "2rem" }}>
                    <Spinner aria-label="Loading users" />
                </div>
            )}

            {/* ---- Empty state ---- */}
            {!loading && !error && filtered.length === 0 && (
                <EmptyState
                    titleText={(search || statusFilter !== "all" || groupFilter !== null) ? "No users match the filter" : "No users found"}
                    headingLevel="h4"
                >
                    <EmptyStateBody>
                        {(search || statusFilter !== "all" || groupFilter !== null) ? "Try clearing the search, status or group filter." : "No domain users are available."}
                    </EmptyStateBody>
                </EmptyState>
            )}

            {/* ---- Users table ---- */}
            {!loading && filtered.length > 0 && (
                <Table aria-label="Users table" variant="compact">
                    <Thead>
                        <Tr>
                            <Th sort={{ sortBy: { index: sortIndex ?? -1, direction: sortDir }, onSort, columnIndex: 0 }}>Username</Th>
                            <Th sort={{ sortBy: { index: sortIndex ?? -1, direction: sortDir }, onSort, columnIndex: 1 }}>Full name</Th>
                            <Th sort={{ sortBy: { index: sortIndex ?? -1, direction: sortDir }, onSort, columnIndex: 2 }}>ID</Th>
                            <Th sort={{ sortBy: { index: sortIndex ?? -1, direction: sortDir }, onSort, columnIndex: 3 }}>Status</Th>
                            <Th>Groups</Th>
                            <Th>Last activity</Th>
                            <Th aria-label="Row actions" />
                        </Tr>
                    </Thead>
                    <Tbody>
                        {filtered.map(u => (
                            <Tr key={u.username}>
                                <Td dataLabel="Username">
                                    {u.detailsLoaded
                                        ? <Button variant="link" isInline onClick={() => cockpit.location.go(u.username)}>{u.username}</Button>
                                        : u.username}
                                </Td>
                                <Td dataLabel="Full name">
                                    {u.detailsLoaded ? u.fullName : <Skeleton width="120px" />}
                                </Td>
                                <Td dataLabel="ID">
                                    {u.detailsLoaded ? u.id : <Skeleton width="50px" />}
                                </Td>
                                <Td dataLabel="Status">
                                    {u.detailsLoaded ? (
                                        u.status === "Active" ? (
                                            <Label color="green">Active</Label>
                                        ) : u.status === "Disabled" ? (
                                            <Label color="grey">Disabled</Label>
                                        ) : (
                                            <Label color="orange">Unknown</Label>
                                        )
                                    ) : <Skeleton width="60px" />}
                                </Td>
                                <Td dataLabel="Groups">
                                    {u.detailsLoaded ? (
                                        u.groups.length === 0 ? "—" : (
                                            <>
                                                {u.groups.slice(0, 2).map(g => (
                                                    <Label key={g} color="blue" isCompact style={{ marginRight: "0.25rem" }}>{g}</Label>
                                                ))}
                                                {u.groups.length > 2 && (
                                                    <span style={{ fontSize: "0.8em" }}>+{u.groups.length - 2} more</span>
                                                )}
                                            </>
                                        )
                                    ) : <Skeleton width="100px" />}
                                </Td>
                                <Td dataLabel="Last activity">
                                    {u.detailsLoaded ? u.lastActivity : <Skeleton width="80px" />}
                                </Td>
                                <Td isActionCell>
                                    <ActionsColumn
                                        items={[
                                            {
                                                title: "Properties",
                                                onClick: () => { if (u.detailsLoaded) cockpit.location.go(u.username); },
                                                isDisabled: !u.detailsLoaded,
                                            },
                                            {
                                                title: u.detailsLoaded
                                                    ? (u.status === "Active" ? "Disable" : "Enable")
                                                    : "Enable / Disable",
                                                onClick: () => {
                                                    if (u.detailsLoaded) handleToggleUser(u);
                                                },
                                                isDisabled: !u.detailsLoaded || (u.detailsLoaded && u.isStatusLocked),
                                            },
                                            { isSeparator: true, title: "" },
                                            {
                                                title: "Delete",
                                                onClick: () => setModal({ kind: "delete", user: u }),
                                                isDisabled: u.isProtected,
                                                isDanger: true,
                                            },
                                        ]}
                                    />
                                </Td>
                            </Tr>
                        ))}
                    </Tbody>
                </Table>
            )}

            {/* ---- Modals ---- */}
            {modal.kind === "create" && (
                <CreateUserModal
                    onClose={() => setModal({ kind: "none" })}
                    onSuccess={() => { setModal({ kind: "none" }); loadUsers(); }}
                />
            )}

            {modal.kind === "delete" && (
                <DeleteUserModal
                    user={modal.user}
                    onClose={() => setModal({ kind: "none" })}
                    onSuccess={() => {
                        const username = modal.user.username;
                        setModal({ kind: "none" });
                        setUsers(prev => prev.filter(u => u.username !== username));
                    }}
                />
            )}
        </PageSection>
    );
}
