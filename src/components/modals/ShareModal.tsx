import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter,
    Form, FormGroup, TextInput, Checkbox,
    FormHelperText, HelperText, HelperTextItem,
    Button, Alert,
} from "@patternfly/react-core";
import { createShare, updateShare } from "../../lib/shares.ts";
import { SHARES_DIR } from "../../lib/exec.ts";
import { validateShareName, shareNameViolationMessage } from "../../lib/validators.ts";
import type { SharedFolder, ShareAccess } from "../../lib/types.ts";
import { ShareAccessEditor } from "../ShareAccessEditor.tsx";

interface Props {
    // Edit mode when set, create mode otherwise
    share?: SharedFolder;
    // Names of the existing shares, to reject duplicates before submitting
    existingNames: string[];
    onClose: () => void;
    onSuccess: () => void;
}

export function ShareModal({ share, existingNames, onClose, onSuccess }: Props) {
    const { t } = useTranslation();
    const isEdit = share !== undefined;
    const [name, setName] = useState(share?.name ?? "");
    const [comment, setComment] = useState(share?.comment ?? "");
    const [browseable, setBrowseable] = useState(share?.browseable ?? true);
    const [access, setAccess] = useState<ShareAccess[]>(share?.access ?? []);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const trimmedName = name.trim();

    async function handleSubmit() {
        if (!isEdit) {
            const violation = validateShareName(trimmedName);
            if (violation) { setError(shareNameViolationMessage(t, violation)); return; }
            if (existingNames.some(n => n.toLowerCase() === trimmedName.toLowerCase())) {
                setError(t("A shared folder with this name already exists."));
                return;
            }
        }
        if (access.length === 0) { setError(t("Add at least one user or group.")); return; }
        setSubmitting(true);
        setError(null);
        const data = { comment: comment.trim(), browseable, access };
        try {
            if (isEdit) await updateShare(share.name, data);
            else await createShare(trimmedName, data);
            onSuccess();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSubmitting(false);
        }
    }

    return (
        <Modal variant={ModalVariant.medium} isOpen onClose={onClose}>
            <ModalHeader title={isEdit ? t("Edit shared folder: {{name}}", { name: share.name }) : t("Create shared folder")} />
            <ModalBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                <Form onSubmit={e => e.preventDefault()}>
                    <FormGroup label={t("Name")} isRequired fieldId="sh-name">
                        <TextInput
                            id="sh-name"
                            value={name}
                            onChange={(_e, v) => setName(v)}
                            isDisabled={isEdit}
                            isRequired
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem>
                                    {isEdit
                                        ? t("Folder: {{path}}", { path: share.path })
                                        : t("Folder: {{path}}", { path: `${SHARES_DIR}/${trimmedName}` })}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                    <FormGroup label={t("Description")} fieldId="sh-comment">
                        <TextInput id="sh-comment" value={comment} onChange={(_e, v) => setComment(v)} />
                    </FormGroup>
                    <FormGroup fieldId="sh-browseable">
                        <Checkbox
                            id="sh-browseable"
                            label={t("Visible when browsing the server")}
                            description={t("When unchecked, the folder can still be opened by typing its path.")}
                            isChecked={browseable}
                            onChange={(_e, v) => setBrowseable(v)}
                        />
                    </FormGroup>
                    <FormGroup label={t("Access")} isRequired fieldId="sh-access">
                        <ShareAccessEditor access={access} onChange={setAccess} isDisabled={submitting} />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem>
                                    {t("Only the users and groups listed here can open the folder.")}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button key="save" variant="primary" isLoading={submitting} onClick={handleSubmit}>
                    {isEdit ? t("Save") : t("Create")}
                </Button>
                <Button key="cancel" variant="link" onClick={onClose}>{t("Cancel")}</Button>
            </ModalFooter>
        </Modal>
    );
}
