import React, { useState, useEffect } from "react";
import {
    Breadcrumb, BreadcrumbItem,
    PageBreadcrumb, PageSection,
    Title, Spinner, Alert,
    Card, CardTitle, CardBody,
    Form, FormGroup, FormHelperText, HelperText, HelperTextItem,
    TextInput, Checkbox,
    ActionGroup, Button,
    Divider,
} from "@patternfly/react-core";
import cockpit from "cockpit";
import { getUserDetails, refreshUser, modifyUser, setUserPassword, getPasswordPolicy, addGroupMembers, removeGroupMembers, provisionHomeDir } from "../lib/samba.ts";
import type { User } from "../lib/types.ts";
import { GroupMultiSelect } from "./GroupMultiSelect.tsx";

interface Props {
    username: string;
}

export function UserDetailPage({ username }: Props) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setLoadError(null);
        getUserDetails(username)
            .then(u => { setUser(u); setLoading(false); })
            .catch(e => { setLoadError(e instanceof Error ? e.message : String(e)); setLoading(false); });
    }, [username]);

    function goBack() { cockpit.location.go("/"); }

    return (
        <>
            <PageBreadcrumb hasBodyWrapper={false}>
                <Breadcrumb>
                    <BreadcrumbItem onClick={goBack} style={{ cursor: "pointer" }}>Users</BreadcrumbItem>
                    <BreadcrumbItem isActive>{username}</BreadcrumbItem>
                </Breadcrumb>
            </PageBreadcrumb>

            <PageSection hasBodyWrapper={false}>
                <Title headingLevel="h1">{user?.fullName || username}</Title>
            </PageSection>

            {loading && (
                <PageSection hasBodyWrapper={false}>
                    <Spinner aria-label="Loading user" />
                </PageSection>
            )}

            {loadError && (
                <PageSection hasBodyWrapper={false}>
                    <Alert variant="danger" isInline title="Failed to load user">{loadError}</Alert>
                </PageSection>
            )}

            {!loading && !loadError && user && (
                <>
                    <PageSection hasBodyWrapper={false}>
                        <IdentitySection user={user} onUpdate={setUser} />
                    </PageSection>
                    <Divider />
                    <PageSection hasBodyWrapper={false}>
                        <GroupsSection user={user} onUpdate={setUser} />
                    </PageSection>
                    <Divider />
                    <PageSection hasBodyWrapper={false}>
                        <AuthenticationSection username={user.username} />
                    </PageSection>
                    <Divider />
                    <PageSection hasBodyWrapper={false}>
                        <HomeDirSection user={user} onUpdate={setUser} />
                    </PageSection>
                </>
            )}
        </>
    );
}

// ---------------------------------------------------------------------------
// Identity section
// ---------------------------------------------------------------------------
function IdentitySection({ user, onUpdate }: { user: User; onUpdate: (u: User) => void }) {
    const [newUsername, setNewUsername] = useState(user.username);
    const [givenName, setGivenName] = useState(user.givenName);
    const [surname, setSurname] = useState(user.surname);
    const [email, setEmail] = useState(user.email);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const unchanged =
        newUsername === user.username &&
        givenName === user.givenName &&
        surname === user.surname &&
        email === user.email;

    async function handleSave() {
        if (!newUsername.trim()) { setError("Username cannot be empty."); return; }
        if (unchanged) return;
        setSaving(true);
        setError(null);
        setSuccess(false);
        try {
            await modifyUser(user.username, { givenName, surname, email, newUsername: newUsername.trim() });
            if (newUsername.trim() !== user.username) {
                cockpit.location.go(newUsername.trim());
            } else {
                const updated = await refreshUser(user.username);
                onUpdate(updated);
                setSuccess(true);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSaving(false);
        }
    }

    return (
        <Card isPlain>
            <CardTitle><Title headingLevel="h2" size="xl">Identity</Title></CardTitle>
            <CardBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                {success && <Alert variant="success" isInline title="Changes saved." style={{ marginBottom: "1rem" }} />}
                <Form isHorizontal>
                    <FormGroup label="Username" fieldId="ud-username" isRequired>
                        <TextInput id="ud-username" value={newUsername}
                            onChange={(_e, v) => { setNewUsername(v); setSuccess(false); }}
                            isDisabled={user.isProtected} />
                        {user.isProtected && (
                            <FormHelperText>
                                <HelperText>
                                    <HelperTextItem>System accounts cannot be renamed.</HelperTextItem>
                                </HelperText>
                            </FormHelperText>
                        )}
                    </FormGroup>
                    <FormGroup label="Given name" fieldId="ud-given-name">
                        <TextInput id="ud-given-name" value={givenName}
                            onChange={(_e, v) => { setGivenName(v); setSuccess(false); }} />
                    </FormGroup>
                    <FormGroup label="Surname" fieldId="ud-surname">
                        <TextInput id="ud-surname" value={surname}
                            onChange={(_e, v) => { setSurname(v); setSuccess(false); }} />
                    </FormGroup>
                    <FormGroup label="Email" fieldId="ud-email">
                        <TextInput id="ud-email" type="email" value={email}
                            onChange={(_e, v) => { setEmail(v); setSuccess(false); }} />
                    </FormGroup>
                    <ActionGroup>
                        <Button variant="primary" isLoading={saving}
                            isDisabled={unchanged || saving} onClick={handleSave}>
                            Save changes
                        </Button>
                    </ActionGroup>
                </Form>
            </CardBody>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Groups section
// ---------------------------------------------------------------------------
function GroupsSection({ user, onUpdate }: { user: User; onUpdate: (u: User) => void }) {
    const [selected, setSelected] = useState<string[]>(user.groups);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const unchanged = selected.length === user.groups.length &&
        selected.every(g => user.groups.includes(g));

    async function handleSave() {
        if (unchanged) return;
        setSaving(true);
        setError(null);
        setSuccess(false);
        try {
            const toAdd = selected.filter(g => !user.groups.includes(g));
            const toRemove = user.groups.filter(g => !selected.includes(g));
            await Promise.all([
                ...toAdd.map(g => addGroupMembers(g, [user.username])),
                ...toRemove.map(g => removeGroupMembers(g, [user.username])),
            ]);
            const updated = await refreshUser(user.username);
            onUpdate(updated);
            setSelected(updated.groups);
            setSuccess(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card isPlain>
            <CardTitle><Title headingLevel="h2" size="xl">Groups</Title></CardTitle>
            <CardBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                {success && <Alert variant="success" isInline title="Group membership updated." style={{ marginBottom: "1rem" }} />}
                <Form isHorizontal>
                    <FormGroup label="Member of" fieldId="ud-groups">
                        <GroupMultiSelect
                            selected={selected}
                            onChange={v => { setSelected(v); setSuccess(false); }}
                            isDisabled={saving}
                        />
                    </FormGroup>
                    <ActionGroup>
                        <Button variant="primary" isLoading={saving}
                            isDisabled={unchanged || saving} onClick={handleSave}>
                            Save changes
                        </Button>
                    </ActionGroup>
                </Form>
            </CardBody>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Home directory section
// ---------------------------------------------------------------------------
function HomeDirSection({ user, onUpdate }: { user: User; onUpdate: (u: User) => void }) {
    const [provisioning, setProvisioning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const isProvisioned = !!user.homeDirectory;

    async function handleProvision() {
        setProvisioning(true);
        setError(null);
        setSuccess(false);
        try {
            await provisionHomeDir(user.username);
            const updated = await refreshUser(user.username);
            onUpdate(updated);
            setSuccess(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setProvisioning(false);
        }
    }

    return (
        <Card isPlain>
            <CardTitle><Title headingLevel="h2" size="xl">Home Directory</Title></CardTitle>
            <CardBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                {success && <Alert variant="success" isInline title="Home directory provisioned." style={{ marginBottom: "1rem" }} />}
                <Form isHorizontal>
                    <FormGroup label="Drive" fieldId="ud-home-drive">
                        <TextInput id="ud-home-drive" value={user.homeDrive || "—"} isDisabled />
                    </FormGroup>
                    <FormGroup label="Path" fieldId="ud-home-path">
                        <TextInput id="ud-home-path" value={user.homeDirectory || "—"} isDisabled />
                    </FormGroup>
                    {!isProvisioned && !user.isProtected && (
                        <ActionGroup>
                            <Button variant="primary" isLoading={provisioning}
                                isDisabled={provisioning} onClick={handleProvision}>
                                Provision home directory
                            </Button>
                        </ActionGroup>
                    )}
                </Form>
            </CardBody>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Authentication section
// ---------------------------------------------------------------------------
function AuthenticationSection({ username }: { username: string }) {
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [mustChange, setMustChange] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    async function handleSave() {
        if (!password) { setError("New password is required."); return; }
        if (password !== passwordConfirm) { setError("Passwords do not match."); return; }
        setSaving(true);
        setError(null);
        setSuccess(false);
        try {
            const policy = await getPasswordPolicy();
            if (password.length < policy.minLength) {
                setError(`Password must be at least ${policy.minLength} characters.`);
                setSaving(false);
                return;
            }
            await setUserPassword(username, password, mustChange);
            setPassword("");
            setPasswordConfirm("");
            setMustChange(true);
            setSuccess(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card isPlain>
            <CardTitle><Title headingLevel="h2" size="xl">Authentication</Title></CardTitle>
            <CardBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                {success && <Alert variant="success" isInline title="Password updated." style={{ marginBottom: "1rem" }} />}
                <Form isHorizontal>
                    <FormGroup label="New password" fieldId="ud-password">
                        <TextInput id="ud-password" type="password" value={password}
                            onChange={(_e, v) => { setPassword(v); setSuccess(false); }} />
                    </FormGroup>
                    <FormGroup label="Confirm password" fieldId="ud-password-confirm">
                        <TextInput id="ud-password-confirm" type="password" value={passwordConfirm}
                            onChange={(_e, v) => { setPasswordConfirm(v); setSuccess(false); }} />
                    </FormGroup>
                    <FormGroup fieldId="ud-must-change">
                        <Checkbox id="ud-must-change"
                            label="Require password change at next login"
                            isChecked={mustChange}
                            onChange={(_e, checked) => setMustChange(checked)} />
                    </FormGroup>
                    <ActionGroup>
                        <Button variant="primary" isLoading={saving}
                            isDisabled={saving || (!password && !passwordConfirm)} onClick={handleSave}>
                            Set password
                        </Button>
                    </ActionGroup>
                </Form>
            </CardBody>
        </Card>
    );
}
