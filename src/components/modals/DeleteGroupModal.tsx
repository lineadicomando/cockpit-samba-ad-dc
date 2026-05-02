import React, { useState } from "react";
import {
    Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter,
    Form, FormGroup, TextInput,
    Button, Alert,
} from "@patternfly/react-core";
import { deleteGroup } from "../../lib/samba.ts";
interface Props { group: { name: string }; onClose: () => void; onSuccess: () => void; }

export function DeleteGroupModal({ group, onClose, onSuccess }: Props) {
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleDelete() {
        if (confirm !== group.name) { setError(`Type exactly "${group.name}" to confirm.`); return; }
        setSubmitting(true);
        setError(null);
        try { await deleteGroup(group.name); onSuccess(); }
        catch (e) { setError(e instanceof Error ? e.message : String(e)); setSubmitting(false); }
    }

    return (
        <Modal variant={ModalVariant.small} isOpen onClose={onClose}>
            <ModalHeader title={`Delete group: ${group.name}`} />
            <ModalBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                <Form>
                    <FormGroup label={`Type "${group.name}" to confirm`} isRequired fieldId="dg-confirm">
                        <TextInput id="dg-confirm" value={confirm} onChange={(_e, v) => setConfirm(v)} />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button key="delete" variant="danger" isLoading={submitting} isDisabled={confirm !== group.name} onClick={handleDelete}>Delete</Button>
                <Button key="cancel" variant="link" onClick={onClose}>Cancel</Button>
            </ModalFooter>
        </Modal>
    );
}
