import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  EmptyState,
  EmptyStateBody,
  Label,
  MenuToggle,
  PageSection,
  Pagination,
  SearchInput,
  Select,
  SelectList,
  SelectOption,
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
import {
  listUsers,
  refreshUser,
  enableUser,
  disableUser,
  listGroups,
} from "../lib/samba.ts";
import {
  useSingleLoad,
  usePagination,
  PER_PAGE_OPTIONS,
} from "../lib/hooks.ts";
import type { User } from "../lib/types.ts";
import { CreateUserModal } from "./modals/CreateUserModal.tsx";
import { DeleteUserModal } from "./modals/DeleteUserModal.tsx";
import {
  BulkConfirmModal,
  type BulkConfirmAction,
} from "./modals/BulkConfirmModal.tsx";
import {
  BulkGroupModal,
  type BulkGroupAction,
} from "./modals/BulkGroupModal.tsx";

// ---------------------------------------------------------------------------
// UsersPage
// ---------------------------------------------------------------------------
type ModalState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "delete"; user: User }
  | { kind: "bulk-confirm"; action: BulkConfirmAction; users: User[] }
  | { kind: "bulk-group"; action: BulkGroupAction; users: User[] };

export function UsersPage() {
  const { t } = useTranslation();
  const {
    items: users,
    setItems: setUsers,
    loading,
    error,
    reload: loadUsers,
  } = useSingleLoad(listUsers);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "Active" | "Disabled"
  >("all");
  const [statusSelectOpen, setStatusSelectOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [groupSelectOpen, setGroupSelectOpen] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [allGroups, setAllGroups] = useState<string[]>([]);

  useEffect(() => {
    listGroups()
      .then((rows) =>
        setAllGroups(
          rows.map((r) => r.name).sort((a, b) => a.localeCompare(b)),
        ),
      )
      .catch(() => setAllGroups([]));
  }, []);

  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(
    new Set(),
  );

  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [sortIndex, setSortIndex] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function onSort(
    _evt: React.MouseEvent,
    index: number,
    direction: "asc" | "desc",
  ) {
    setSortIndex(index);
    setSortDir(direction);
  }

  const handleToggleUser = useCallback(
    async (user: User) => {
      setActionError(null);
      try {
        if (user.status === "Active") {
          await disableUser(user.username);
        } else {
          await enableUser(user.username);
        }
        const updated = await refreshUser(user.username);
        setUsers((prev) =>
          prev.map((u) => (u.username === user.username ? updated : u)),
        );
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : String(err));
      }
    },
    [setUsers],
  );

  const filtered = useMemo<User[]>(() => {
    let result = users;
    if (statusFilter !== "all") {
      result = result.filter((u) => u.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.fullName.toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q),
      );
    }
    if (groupFilter !== null) {
      result = result.filter((u) => u.groups.includes(groupFilter));
    }
    if (sortIndex !== null) {
      result = [...result].sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;
        switch (sortIndex) {
          case 0:
            aVal = a.username.toLowerCase();
            bVal = b.username.toLowerCase();
            break;
          case 1:
            aVal = a.fullName.toLowerCase();
            bVal = b.fullName.toLowerCase();
            break;
          case 2:
            aVal = parseInt(a.id) || 0;
            bVal = parseInt(b.id) || 0;
            break;
          case 3:
            aVal = a.status;
            bVal = b.status;
            break;
          default:
            return 0;
        }
        if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [users, search, statusFilter, groupFilter, sortIndex, sortDir]);

  const activeCount = useMemo(
    () => users.filter((u) => u.status === "Active").length,
    [users],
  );

  const { page, perPage, paginated, onSetPage, onPerPageSelect } =
    usePagination(filtered);

  const selectedUsers = useMemo(
    () => users.filter((u) => selectedUsernames.has(u.username)),
    [users, selectedUsernames],
  );

  const allFilteredSelected =
    filtered.length > 0 &&
    filtered.every((u) => selectedUsernames.has(u.username));

  const handleSelectAll = (isSelected: boolean) => {
    setSelectedUsernames((prev) => {
      const next = new Set(prev);
      if (isSelected) filtered.forEach((u) => next.add(u.username));
      else filtered.forEach((u) => next.delete(u.username));
      return next;
    });
  };

  const handleSelectRow = (username: string, isSelected: boolean) => {
    setSelectedUsernames((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(username);
      else next.delete(username);
      return next;
    });
  };

  const handleBulkSuccess = () => {
    setModal({ kind: "none" });
    setSelectedUsernames(new Set());
    loadUsers();
  };

  return (
    <PageSection>
      {/* ---- Toolbar ---- */}
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <SearchInput
              placeholder={t("Filter by username or name")}
              value={search}
              onChange={(_evt, val) => setSearch(val)}
              onClear={() => setSearch("")}
              aria-label={t("Filter users")}
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
                  onClick={() => setStatusSelectOpen((o) => !o)}
                  isExpanded={statusSelectOpen}
                >
                  {statusFilter === "all" ? t("All statuses") : t(statusFilter)}
                </MenuToggle>
              )}
            >
              <SelectList>
                <SelectOption value="all">{t("All statuses")}</SelectOption>
                <SelectOption value="Active">{t("Active")}</SelectOption>
                <SelectOption value="Disabled">{t("Disabled")}</SelectOption>
              </SelectList>
            </Select>
          </ToolbarItem>
          <ToolbarItem>
            <Select
              isOpen={groupSelectOpen}
              onOpenChange={(isOpen) => {
                setGroupSelectOpen(isOpen);
                if (!isOpen) setGroupSearch("");
              }}
              onSelect={(_evt, val) => {
                setGroupFilter(val === "all" ? null : (val as string));
                setGroupSelectOpen(false);
              }}
              selected={groupFilter ?? "all"}
              toggle={(ref) => (
                <MenuToggle
                  ref={ref}
                  onClick={() => setGroupSelectOpen((o) => !o)}
                  isExpanded={groupSelectOpen}
                >
                  {groupFilter ?? t("All groups")}
                </MenuToggle>
              )}
            >
              <div style={{ padding: "4px 8px" }}>
                <SearchInput
                  value={groupSearch}
                  onChange={(_e, val) => setGroupSearch(val)}
                  onClear={() => setGroupSearch("")}
                  placeholder={t("Filter groups…")}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <SelectList style={{ maxHeight: "200px", overflowY: "auto" }}>
                {!groupSearch && (
                  <SelectOption value="all">{t("All groups")}</SelectOption>
                )}
                {allGroups
                  .filter((g) =>
                    g.toLowerCase().includes(groupSearch.toLowerCase()),
                  )
                  .map((g) => (
                    <SelectOption key={g} value={g}>
                      {g}
                    </SelectOption>
                  ))}
              </SelectList>
            </Select>
          </ToolbarItem>
          <ToolbarItem>
            <Label color="blue">{t("users_count", { count: users.length })}</Label>
          </ToolbarItem>
          <ToolbarItem>
            <Label color="green">{t("active_count", { count: activeCount })}</Label>
          </ToolbarItem>
          <ToolbarItem align={{ default: "alignEnd" }}>
            <Button
              variant="primary"
              onClick={() => setModal({ kind: "create" })}
            >
              {t("Create user")}
            </Button>
          </ToolbarItem>
          <ToolbarItem>
            <Button
              variant="secondary"
              onClick={loadUsers}
              isDisabled={loading}
            >
              {t("Refresh")}
            </Button>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {/* ---- Bulk Actions Toolbar ---- */}
      {selectedUsernames.size > 0 && (
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <Label color="blue">{t("users_selected", { count: selectedUsernames.size })}</Label>
            </ToolbarItem>
            <ToolbarItem>
              <Button
                variant="link"
                onClick={() => setSelectedUsernames(new Set())}
              >
                {t("Clear selection")}
              </Button>
            </ToolbarItem>
            <ToolbarItem>
              <Button
                variant="secondary"
                onClick={() =>
                  setModal({
                    kind: "bulk-confirm",
                    action: "enable",
                    users: selectedUsers,
                  })
                }
              >
                {t("Enable")}
              </Button>
            </ToolbarItem>
            <ToolbarItem>
              <Button
                variant="secondary"
                onClick={() =>
                  setModal({
                    kind: "bulk-confirm",
                    action: "disable",
                    users: selectedUsers,
                  })
                }
              >
                {t("Disable")}
              </Button>
            </ToolbarItem>
            <ToolbarItem>
              <Button
                variant="secondary"
                onClick={() =>
                  setModal({
                    kind: "bulk-group",
                    action: "add-group",
                    users: selectedUsers,
                  })
                }
              >
                {t("Add to group")}
              </Button>
            </ToolbarItem>
            <ToolbarItem>
              <Button
                variant="secondary"
                onClick={() =>
                  setModal({
                    kind: "bulk-group",
                    action: "remove-group",
                    users: selectedUsers,
                  })
                }
              >
                {t("Remove from group")}
              </Button>
            </ToolbarItem>
            <ToolbarItem>
              <Button
                variant="secondary"
                onClick={() =>
                  setModal({
                    kind: "bulk-group",
                    action: "change-primary-group",
                    users: selectedUsers,
                  })
                }
              >
                {t("Change primary group")}
              </Button>
            </ToolbarItem>
            <ToolbarItem>
              <Button
                variant="secondary"
                onClick={() =>
                  setModal({
                    kind: "bulk-confirm",
                    action: "provision-home",
                    users: selectedUsers,
                  })
                }
              >
                {t("Provision home dir")}
              </Button>
            </ToolbarItem>
            <ToolbarItem align={{ default: "alignEnd" }}>
              <Button
                variant="danger"
                onClick={() =>
                  setModal({
                    kind: "bulk-confirm",
                    action: "delete",
                    users: selectedUsers,
                  })
                }
              >
                {t("Delete")}
              </Button>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
      )}

      {/* ---- Inline errors ---- */}
      {error && (
        <Alert
          variant="danger"
          isInline
          title={t("Failed to load users")}
          style={{ marginBottom: "1rem" }}
        >
          {error}
        </Alert>
      )}
      {actionError && (
        <Alert
          variant="danger"
          isInline
          title={t("Action failed")}
          style={{ marginBottom: "1rem" }}
        >
          {actionError}
        </Alert>
      )}

      {/* ---- Loading spinner (phase 1 only) ---- */}
      {loading && (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <Spinner aria-label={t("Loading users")} />
        </div>
      )}

      {/* ---- Empty state ---- */}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          titleText={
            search || statusFilter !== "all" || groupFilter !== null
              ? t("No users match the filter")
              : t("No users found")
          }
          headingLevel="h4"
        >
          <EmptyStateBody>
            {search || statusFilter !== "all" || groupFilter !== null
              ? t("Try clearing the search, status or group filter.")
              : t("No domain users are available.")}
          </EmptyStateBody>
        </EmptyState>
      )}

      {/* ---- Users table ---- */}
      {!loading && filtered.length > 0 && (
        <Table aria-label={t("Users table")} variant="compact">
          <Thead>
            <Tr>
              <Th
                select={{
                  onSelect: (_evt, isSelected) => handleSelectAll(isSelected),
                  isSelected: allFilteredSelected,
                }}
              />
              <Th
                sort={{
                  sortBy: { index: sortIndex ?? -1, direction: sortDir },
                  onSort,
                  columnIndex: 0,
                }}
              >
                {t("Username")}
              </Th>
              <Th
                sort={{
                  sortBy: { index: sortIndex ?? -1, direction: sortDir },
                  onSort,
                  columnIndex: 1,
                }}
              >
                {t("Full name")}
              </Th>
              <Th
                sort={{
                  sortBy: { index: sortIndex ?? -1, direction: sortDir },
                  onSort,
                  columnIndex: 2,
                }}
              >
                {t("ID")}
              </Th>
              <Th
                sort={{
                  sortBy: { index: sortIndex ?? -1, direction: sortDir },
                  onSort,
                  columnIndex: 3,
                }}
              >
                {t("Status")}
              </Th>
              <Th>{t("Groups")}</Th>
              <Th>{t("Last activity")}</Th>
              <Th aria-label={t("Row actions")} />
            </Tr>
          </Thead>
          <Tbody>
            {paginated.map((u, idx) => (
              <Tr key={u.username}>
                <Td
                  select={{
                    rowIndex: idx,
                    onSelect: (_evt, isSelected) =>
                      handleSelectRow(u.username, isSelected),
                    isSelected: selectedUsernames.has(u.username),
                  }}
                />
                <Td dataLabel={t("Username")}>
                  <Button
                    variant="link"
                    isInline
                    onClick={() => cockpit.location.go(u.username)}
                  >
                    {u.username}
                  </Button>
                </Td>
                <Td dataLabel={t("Full name")}>{u.fullName}</Td>
                <Td dataLabel={t("ID")}>{u.id}</Td>
                <Td dataLabel={t("Status")}>
                  {u.status === "Active" ? (
                    <Label color="green">{t("Active")}</Label>
                  ) : u.status === "Disabled" ? (
                    <Label color="grey">{t("Disabled")}</Label>
                  ) : (
                    <Label color="orange">{t("Unknown")}</Label>
                  )}
                </Td>
                <Td dataLabel={t("Groups")}>
                  {u.groups.length === 0 ? (
                    "—"
                  ) : (
                    <>
                      {u.groups.slice(0, 2).map((g) => (
                        <Label
                          key={g}
                          color="blue"
                          isCompact
                          style={{ marginRight: "0.25rem" }}
                        >
                          {g}
                        </Label>
                      ))}
                      {u.groups.length > 2 && (
                        <span style={{ fontSize: "0.8em" }}>
                          +{u.groups.length - 2} {t("more")}
                        </span>
                      )}
                    </>
                  )}
                </Td>
                <Td dataLabel={t("Last activity")}>{u.lastActivity}</Td>
                <Td isActionCell>
                  <ActionsColumn
                    items={[
                      {
                        title: t("Properties"),
                        onClick: () => cockpit.location.go(u.username),
                      },
                      {
                        title: u.status === "Active" ? t("Disable") : t("Enable"),
                        onClick: () => handleToggleUser(u),
                        isDisabled: u.isStatusLocked,
                      },
                      { isSeparator: true, title: "" },
                      {
                        title: t("Delete"),
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

      {/* ---- Pagination ---- */}
      {!loading && filtered.length > 0 && (
        <Pagination
          itemCount={filtered.length}
          perPage={perPage}
          page={page}
          onSetPage={onSetPage}
          onPerPageSelect={onPerPageSelect}
          perPageOptions={PER_PAGE_OPTIONS}
        />
      )}

      {/* ---- Modals ---- */}
      {modal.kind === "create" && (
        <CreateUserModal
          onClose={() => setModal({ kind: "none" })}
          onSuccess={() => {
            setModal({ kind: "none" });
            loadUsers();
          }}
        />
      )}

      {modal.kind === "delete" && (
        <DeleteUserModal
          user={modal.user}
          onClose={() => setModal({ kind: "none" })}
          onSuccess={() => {
            const username = modal.user.username;
            setModal({ kind: "none" });
            setUsers((prev) => prev.filter((u) => u.username !== username));
          }}
        />
      )}
      {modal.kind === "bulk-confirm" && (
        <BulkConfirmModal
          action={modal.action}
          users={modal.users}
          onClose={() => setModal({ kind: "none" })}
          onSuccess={handleBulkSuccess}
        />
      )}

      {modal.kind === "bulk-group" && (
        <BulkGroupModal
          action={modal.action}
          users={modal.users}
          onClose={() => setModal({ kind: "none" })}
          onSuccess={handleBulkSuccess}
        />
      )}
    </PageSection>
  );
}
