import React, { useState } from "react";
import {
    Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter,
    Form, FormGroup, TextInput,
    Button, Alert,
} from "@patternfly/react-core";
import { createGroup } from "../../lib/samba.ts";

interface Props { onClose: () => void; onSuccess: () => void; }

export function CreateGroupModal({ onClose, onSuccess }: Props) {
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit() {
        if (!name.trim()) { setError("Group name is required."); return; }
        setSubmitting(true);
        setError(null);
        try {
            await createGroup(name.trim());
            onSuccess();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSubmitting(false);
        }
    }

    return (
        <Modal variant={ModalVariant.small} isOpen onClose={onClose}>
            <ModalHeader title="Create group" />
            <ModalBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                <Form>
                    <FormGroup label="Group name" isRequired fieldId="cg-name">
                        <TextInput id="cg-name" value={name} onChange={(_e, v) => setName(v)} isRequired />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button key="create" variant="primary" isLoading={submitting} onClick={handleSubmit}>Create</Button>
                <Button key="cancel" variant="link" onClick={onClose}>Cancel</Button>
            </ModalFooter>
        </Modal>
    );
}
