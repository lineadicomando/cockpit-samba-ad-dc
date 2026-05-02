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

import { listComputersLight, getComputerDetails } from "../lib/samba.ts";
import { useTwoPhaseLoad } from "../lib/hooks.ts";
import type { AnyComputer } from "../lib/types.ts";
import { DeleteComputerModal } from "./modals/DeleteComputerModal.tsx";

// ---------------------------------------------------------------------------
// ComputersPage
// ---------------------------------------------------------------------------
type ModalState =
    | { kind: "none" }
    | { kind: "delete"; computer: AnyComputer };

export function ComputersPage() {
    const {
        items: computers,
        setItems: setComputers,
        loading,
        detailsLoading,
        error,
        reload: loadComputers,
    } = useTwoPhaseLoad("name", listComputersLight, getComputerDetails);

    const [search, setSearch] = useState("");
    const [modal, setModal] = useState<ModalState>({ kind: "none" });

    const filtered = useMemo<AnyComputer[]>(() => {
        if (detailsLoading || !search) return computers;
        const q = search.toLowerCase();
        return computers.filter(c => {
            if (c.name.toLowerCase().includes(q)) return true;
            if (c.detailsLoaded) {
                return c.os.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
            }
            return false;
        });
    }, [computers, detailsLoading, search]);

    function rowActions(computer: AnyComputer): IAction[] {
        return [
            {
                title: "Delete computer",
                onClick: () => setModal({ kind: "delete", computer }),
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
                            placeholder="Filter by name, OS or ID"
                            value={search}
                            onChange={(_evt, val) => setSearch(val)}
                            onClear={() => setSearch("")}
                            aria-label="Filter computers"
                            isDisabled={detailsLoading}
                        />
                    </ToolbarItem>
                    <ToolbarItem>
                        <Label color="blue">{computers.length} computers</Label>
                    </ToolbarItem>
                    {detailsLoading && (
                        <ToolbarItem>
                            <Spinner size="sm" aria-label="Loading computer details" />
                        </ToolbarItem>
                    )}
                    <ToolbarItem align={{ default: "alignEnd" }}>
                        <Button
                            variant="secondary"
                            onClick={loadComputers}
                            isDisabled={loading || detailsLoading}
                        >
                            Refresh
                        </Button>
                    </ToolbarItem>
                </ToolbarContent>
            </Toolbar>

            {/* ---- Inline errors ---- */}
            {error && (
                <Alert variant="danger" isInline title="Failed to load computers" style={{ marginBottom: "1rem" }}>
                    {error}
                </Alert>
            )}

            {/* ---- Loading spinner (phase 1 only) ---- */}
            {loading && (
                <div style={{ textAlign: "center", padding: "2rem" }}>
                    <Spinner aria-label="Loading computers" />
                </div>
            )}

            {/* ---- Empty state ---- */}
            {!loading && !error && filtered.length === 0 && (
                <EmptyState
                    titleText={search ? "No computers match the filter" : "No computers found"}
                    headingLevel="h4"
                >
                    <EmptyStateBody>
                        {search ? "Try clearing the search filter." : "No domain computers are available."}
                    </EmptyStateBody>
                </EmptyState>
            )}

            {/* ---- Computers table ---- */}
            {!loading && filtered.length > 0 && (
                <Table aria-label="Computers table" variant="compact">
                    <Thead>
                        <Tr>
                            <Th>Name</Th>
                            <Th>ID</Th>
                            <Th>OS</Th>
                            <Th>Last logon</Th>
                            <Th aria-label="Row actions" />
                        </Tr>
                    </Thead>
                    <Tbody>
                        {filtered.map(c => (
                            <Tr key={c.name}>
                                <Td dataLabel="Name">{c.name}</Td>
                                <Td dataLabel="ID">
                                    {c.detailsLoaded ? c.id : <Skeleton width="50px" />}
                                </Td>
                                <Td dataLabel="OS">
                                    {c.detailsLoaded ? c.os : <Skeleton width="120px" />}
                                </Td>
                                <Td dataLabel="Last logon">
                                    {c.detailsLoaded ? c.lastLogon : <Skeleton width="80px" />}
                                </Td>
                                <Td isActionCell>
                                    <ActionsColumn items={rowActions(c)} />
                                </Td>
                            </Tr>
                        ))}
                    </Tbody>
                </Table>
            )}

            {/* ---- Modals ---- */}
            {modal.kind === "delete" && (
                <DeleteComputerModal
                    computer={modal.computer}
                    onClose={() => setModal({ kind: "none" })}
                    onSuccess={() => {
                        const name = modal.computer.name;
                        setModal({ kind: "none" });
                        setComputers(prev => prev.filter(c => c.name !== name));
                    }}
                />
            )}
        </PageSection>
    );
}
