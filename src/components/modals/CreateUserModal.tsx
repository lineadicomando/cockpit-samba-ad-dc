import React, { useState } from "react";
import {
    Modal, ModalVariant,
    ModalHeader, ModalBody, ModalFooter,
    Form, FormGroup, TextInput,
    Button, Alert,
} from "@patternfly/react-core";
import { createUser, getPasswordPolicy, addGroupMembers } from "../../lib/samba.ts";
import { GroupMultiSelect } from "../GroupMultiSelect.tsx";

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

export function CreateUserModal({ onClose, onSuccess }: Props) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [givenName, setGivenName] = useState("");
    const [surname, setSurname] = useState("");
    const [groups, setGroups] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit() {
        if (!username.trim()) { setError("Username is required."); return; }
        if (!password) { setError("Password is required."); return; }
        if (password !== passwordConfirm) { setError("Passwords do not match."); return; }
        setSubmitting(true);
        setError(null);
        try {
            const policy = await getPasswordPolicy();
            if (password.length < policy.minLength) {
                setError(`Password must be at least ${policy.minLength} characters.`);
                setSubmitting(false);
                return;
            }
            const trimmed = username.trim();
            await createUser(trimmed, password, givenName.trim() || undefined, surname.trim() || undefined);
            if (groups.length > 0) {
                await Promise.all(groups.map(g => addGroupMembers(g, [trimmed])));
            }
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
            <ModalHeader title="Create user" />
            <ModalBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                <Form>
                    <FormGroup label="Username" isRequired fieldId="cu-username">
                        <TextInput id="cu-username" value={username} onChange={(_e, v) => setUsername(v)} isRequired />
                    </FormGroup>
                    <FormGroup label="Password" isRequired fieldId="cu-password">
                        <TextInput id="cu-password" type="password" value={password} onChange={(_e, v) => setPassword(v)} isRequired />
                    </FormGroup>
                    <FormGroup label="Confirm password" isRequired fieldId="cu-password-confirm">
                        <TextInput id="cu-password-confirm" type="password" value={passwordConfirm} onChange={(_e, v) => setPasswordConfirm(v)} isRequired />
                    </FormGroup>
                    <FormGroup label="Given name" fieldId="cu-given-name">
                        <TextInput id="cu-given-name" value={givenName} onChange={(_e, v) => setGivenName(v)} placeholder="Optional" />
                    </FormGroup>
                    <FormGroup label="Surname" fieldId="cu-surname">
                        <TextInput id="cu-surname" value={surname} onChange={(_e, v) => setSurname(v)} placeholder="Optional" />
                    </FormGroup>
                    <FormGroup label="Groups" fieldId="cu-groups">
                        <GroupMultiSelect selected={groups} onChange={setGroups} isDisabled={submitting} />
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
