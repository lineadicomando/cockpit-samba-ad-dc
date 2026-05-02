import React, { useState } from "react";
import {
    Modal, ModalVariant,
    ModalHeader, ModalBody, ModalFooter,
    Form, FormGroup, TextInput,
    Button, Alert,
} from "@patternfly/react-core";
import { deleteUser } from "../../lib/samba.ts";
interface Props {
    user: { username: string };
    onClose: () => void;
    onSuccess: () => void;
}

export function DeleteUserModal({ user, onClose, onSuccess }: Props) {
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleDelete() {
        if (confirm !== user.username) {
            setError(`Type exactly "${user.username}" to confirm.`);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await deleteUser(user.username);
            onSuccess();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSubmitting(false);
        }
    }

    return (
        <Modal
            variant={ModalVariant.small}
            isOpen
            onClose={onClose}
        >
            <ModalHeader title={`Delete user: ${user.username}`} />
            <ModalBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                <Form>
                    <FormGroup label={`Type "${user.username}" to confirm`} isRequired fieldId="du-confirm">
                        <TextInput id="du-confirm" value={confirm} onChange={(_e, v) => setConfirm(v)} />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button key="delete" variant="danger" isLoading={submitting}
                    isDisabled={confirm !== user.username} onClick={handleDelete}>Delete</Button>
                <Button key="cancel" variant="link" onClick={onClose}>Cancel</Button>
            </ModalFooter>
        </Modal>
    );
}
