import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter,
    Form, FormGroup, TextInput,
    Button, Alert,
} from "@patternfly/react-core";
import { renameGroup } from "../../lib/samba.ts";
interface Props { group: { name: string }; onClose: () => void; onSuccess: () => void; }

export function RenameGroupModal({ group, onClose, onSuccess }: Props) {
    const { t } = useTranslation();
    const [newName, setNewName] = useState(group.name);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleRename() {
        const trimmed = newName.trim();
        if (!trimmed) { setError(t("Group name is required.")); return; }
        if (trimmed === group.name) { setError(t("The new name is the same as the current name.")); return; }
        setSubmitting(true);
        setError(null);
        try {
            await renameGroup(group.name, trimmed);
            onSuccess();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSubmitting(false);
        }
    }

    return (
        <Modal variant={ModalVariant.small} isOpen onClose={onClose}>
            <ModalHeader title={t("Rename group: {{name}}", { name: group.name })} />
            <ModalBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                <Form>
                    <FormGroup label={t("New name")} isRequired fieldId="rg-name">
                        <TextInput id="rg-name" value={newName} onChange={(_e, v) => setNewName(v)} isRequired />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button key="rename" variant="primary" isLoading={submitting} onClick={handleRename}>{t("Rename")}</Button>
                <Button key="cancel" variant="link" onClick={onClose}>{t("Cancel")}</Button>
            </ModalFooter>
        </Modal>
    );
}
