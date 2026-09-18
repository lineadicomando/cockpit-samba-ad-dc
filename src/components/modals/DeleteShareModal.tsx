import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter,
    Form, FormGroup, TextInput, Checkbox,
    Button, Alert,
} from "@patternfly/react-core";
import { deleteShare } from "../../lib/shares.ts";
import type { SharedFolder } from "../../lib/types.ts";

interface Props { share: SharedFolder; onClose: () => void; onSuccess: () => void; }

export function DeleteShareModal({ share, onClose, onSuccess }: Props) {
    const { t } = useTranslation();
    const [confirm, setConfirm] = useState("");
    const [deleteData, setDeleteData] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleDelete() {
        if (confirm !== share.name) { setError(t("type_name_to_confirm_exact", { name: share.name })); return; }
        setSubmitting(true);
        setError(null);
        try { await deleteShare(share.name, deleteData); onSuccess(); }
        catch (e) { setError(e instanceof Error ? e.message : String(e)); setSubmitting(false); }
    }

    return (
        <Modal variant={ModalVariant.small} isOpen onClose={onClose}>
            <ModalHeader title={t("Delete shared folder: {{name}}", { name: share.name })} />
            <ModalBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                <Form onSubmit={e => e.preventDefault()}>
                    <FormGroup fieldId="ds-data">
                        <Checkbox
                            id="ds-data"
                            label={t("Also delete the folder and all its contents")}
                            description={share.path}
                            isChecked={deleteData}
                            onChange={(_e, v) => setDeleteData(v)}
                        />
                    </FormGroup>
                    {deleteData
                        ? <Alert variant="danger" isInline title={t("The files will be permanently deleted.")} />
                        : <Alert variant="info" isInline title={t("The files are kept on the server; only network access is removed.")} />}
                    <FormGroup label={t("type_name_to_confirm", { name: share.name })} isRequired fieldId="ds-confirm">
                        <TextInput id="ds-confirm" value={confirm} onChange={(_e, v) => setConfirm(v)} />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button key="delete" variant="danger" isLoading={submitting} isDisabled={confirm !== share.name} onClick={handleDelete}>{t("Delete")}</Button>
                <Button key="cancel" variant="link" onClick={onClose}>{t("Cancel")}</Button>
            </ModalFooter>
        </Modal>
    );
}
