import React, { useState } from "react";
import {
    Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter,
    Form, FormGroup, TextInput,
    Button, Alert,
} from "@patternfly/react-core";
import { deleteComputer } from "../../lib/samba.ts";
interface Props { computer: { name: string }; onClose: () => void; onSuccess: () => void; }

export function DeleteComputerModal({ computer, onClose, onSuccess }: Props) {
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleDelete() {
        if (confirm !== computer.name) {
            setError(`Type exactly "${computer.name}" to confirm.`);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await deleteComputer(computer.name);
            onSuccess();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSubmitting(false);
        }
    }

    return (
        <Modal variant={ModalVariant.small} isOpen onClose={onClose}>
            <ModalHeader title={`Delete computer: ${computer.name}`} />
            <ModalBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                <Form>
                    <FormGroup label={`Type "${computer.name}" to confirm`} isRequired fieldId="dc-confirm">
                        <TextInput id="dc-confirm" value={confirm} onChange={(_e, v) => setConfirm(v)} />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button key="delete" variant="danger" isLoading={submitting} isDisabled={confirm !== computer.name} onClick={handleDelete}>Delete</Button>
                <Button key="cancel" variant="link" onClick={onClose}>Cancel</Button>
            </ModalFooter>
        </Modal>
    );
}
