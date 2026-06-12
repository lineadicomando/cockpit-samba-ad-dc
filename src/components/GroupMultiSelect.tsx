import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
    Select, SelectList, SelectOption,
    MenuToggle,
    LabelGroup, Label,
    Spinner,
    SearchInput,
} from "@patternfly/react-core";
import { listGroups } from "../lib/samba.ts";

interface Props {
    selected: string[];
    onChange: (groups: string[]) => void;
    isDisabled?: boolean;
}

const ADMIN_GROUPS = new Set(["domain admins", "administrators", "enterprise admins", "schema admins"]);

export function GroupMultiSelect({ selected, onChange, isDisabled }: Props) {
    const { t } = useTranslation();
    const [allGroups, setAllGroups] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [filterText, setFilterText] = useState("");

    const filteredGroups = allGroups.filter(g =>
        g.toLowerCase().includes(filterText.toLowerCase())
    );

    useEffect(() => {
        listGroups()
            .then(rows => setAllGroups(rows.map(r => r.name).sort((a, b) => a.localeCompare(b))))
            .catch(() => setAllGroups([]))
            .finally(() => setLoading(false));
    }, []);

    function toggle(group: string) {
        if (selected.includes(group)) {
            onChange(selected.filter(g => g !== group));
        } else {
            onChange([...selected, group]);
        }
    }

    const toggleLabel = loading
        ? t("Loading groups...")
        : selected.length === 0
            ? t("Select groups")
            : t("groups_selected", { count: selected.length });

    return (
        <div>
            <Select
                isOpen={open}
                onOpenChange={isOpen => { setOpen(isOpen); if (!isOpen) setFilterText(""); }}
                toggle={ref => (
                    <MenuToggle
                        ref={ref}
                        onClick={() => setOpen(o => !o)}
                        isExpanded={open}
                        isDisabled={isDisabled || loading}
                        style={{ width: "100%" }}
                    >
                        {loading ? <Spinner size="sm" /> : toggleLabel}
                    </MenuToggle>
                )}
                onSelect={(_e, value) => toggle(value as string)}
            >
                <div style={{ padding: "4px 8px" }}>
                    <SearchInput
                        value={filterText}
                        onChange={(_e, val) => setFilterText(val)}
                        onClear={() => setFilterText("")}
                        placeholder={t("Filter groups…")}
                        onClick={e => e.stopPropagation()}
                    />
                </div>
                <SelectList style={{ maxHeight: "200px", overflowY: "auto" }}>
                    {filteredGroups.length > 0
                        ? filteredGroups.map(g => (
                            <SelectOption
                                key={g}
                                value={g}
                                hasCheckbox
                                isSelected={selected.includes(g)}
                            >
                                {g}
                            </SelectOption>
                        ))
                        : (
                            <SelectOption isDisabled value="">
                                {t("No groups found")}
                            </SelectOption>
                        )
                    }
                </SelectList>
            </Select>
            {selected.length > 0 && (
                <LabelGroup style={{ marginTop: "0.5rem" }}>
                    {selected.map(g => (
                        <Label
                            key={g}
                            color={ADMIN_GROUPS.has(g.toLowerCase()) ? "orange" : "blue"}
                            onClose={isDisabled ? undefined : () => onChange(selected.filter(x => x !== g))}
                        >
                            {g}
                        </Label>
                    ))}
                </LabelGroup>
            )}
        </div>
    );
}
