import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
    Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter,
    Form, FormGroup, TextArea,
    Button, Alert, Spinner, Content,
} from "@patternfly/react-core";
import { listGroupMembers, addGroupMembers, removeGroupMembers } from "../../lib/samba.ts";
interface Props { group: { name: string }; onClose: () => void; onSuccess: () => void | Promise<void>; }

export function ManageMembersModal({ group, onClose, onSuccess }: Props) {
    const { t } = useTranslation();
    const [members, setMembers] = useState<string[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(true);
    const [addInput, setAddInput] = useState("");
    const [removeInput, setRemoveInput] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        listGroupMembers(group.name)
            .then(setMembers)
            .catch(e => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setLoadingMembers(false));
    }, [group.name]);

    async function handleAdd() {
        const toAdd = addInput.split(",").map(s => s.trim()).filter(Boolean);
        if (toAdd.length === 0) return;
        setSubmitting(true);
        setError(null);
        try { await addGroupMembers(group.name, toAdd); await onSuccess(); }
        catch (e) { setError(e instanceof Error ? e.message : String(e)); setSubmitting(false); }
    }

    async function handleRemove() {
        const toRemove = removeInput.split(",").map(s => s.trim()).filter(Boolean);
        if (toRemove.length === 0) return;
        setSubmitting(true);
        setError(null);
        try { await removeGroupMembers(group.name, toRemove); await onSuccess(); }
        catch (e) { setError(e instanceof Error ? e.message : String(e)); setSubmitting(false); }
    }

    return (
        <Modal variant={ModalVariant.medium} isOpen onClose={onClose}>
            <ModalHeader title={t("Members of {{name}}", { name: group.name })} />
            <ModalBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                <Content>
                    <Content component="h3">{t("Current members")}</Content>
                    {loadingMembers ? <Spinner size="sm" /> : (
                        <Content component="p">{members.length > 0 ? members.join(", ") : t("No members.")}</Content>
                    )}
                </Content>
                <Form style={{ marginTop: "1rem" }}>
                    <FormGroup label={t("Add members (comma-separated)")} fieldId="mm-add">
                        <TextArea id="mm-add" value={addInput} onChange={(_e, v) => setAddInput(v)} rows={2} />
                    </FormGroup>
                    <Button key="add" variant="primary" isLoading={submitting} onClick={handleAdd} style={{ marginBottom: "1rem" }}>{t("Add")}</Button>
                    <FormGroup label={t("Remove members (comma-separated)")} fieldId="mm-remove">
                        <TextArea id="mm-remove" value={removeInput} onChange={(_e, v) => setRemoveInput(v)} rows={2} />
                    </FormGroup>
                    <Button key="remove" variant="danger" isLoading={submitting} onClick={handleRemove}>{t("Remove")}</Button>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button key="close" variant="link" onClick={onClose}>{t("Close")}</Button>
            </ModalFooter>
        </Modal>
    );
}
