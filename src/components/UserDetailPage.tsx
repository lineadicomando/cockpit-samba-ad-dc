import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
    Breadcrumb, BreadcrumbItem,
    PageBreadcrumb, PageSection,
    Title, Spinner, Alert,
    Card, CardTitle, CardBody,
    Form, FormGroup, FormHelperText, HelperText, HelperTextItem,
    TextInput, Checkbox,
    FormSelect, FormSelectOption,
    ActionGroup, Button,
    Divider,
} from "@patternfly/react-core";
import cockpit from "cockpit";
import { getUserDetails, refreshUser, modifyUser, setUserPassword, getPasswordPolicy, addGroupMembers, removeGroupMembers, setPrimaryGroup as savePrimaryGroup, provisionHomeDir } from "../lib/samba.ts";
import type { User } from "../lib/types.ts";
import { usePasswordPolicy, usePasswordGenerator } from "../lib/hooks.ts";
import { checkPasswordAgainstPolicy } from "../lib/passwordUtils.ts";
import { validateUsername, usernameViolationMessage } from "../lib/validators.ts";
import { PasswordField, PasswordPolicyInfo, PasswordPolicyUnavailable } from "./PasswordField.tsx";
import { GroupMultiSelect } from "./GroupMultiSelect.tsx";

interface Props {
    username: string;
}

export function UserDetailPage({ username }: Props) {
    const { t } = useTranslation();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        getUserDetails(username)
            .then(u => { if (cancelled) return; setUser(u); setLoading(false); })
            .catch(e => { if (cancelled) return; setLoadError(e instanceof Error ? e.message : String(e)); setLoading(false); });
        return () => { cancelled = true; };
    }, [username]);

    function goBack() { cockpit.location.go("/"); }

    return (
        <>
            <PageBreadcrumb hasBodyWrapper={false}>
                <Breadcrumb>
                    <BreadcrumbItem onClick={goBack} style={{ cursor: "pointer" }}>{t("Users")}</BreadcrumbItem>
                    <BreadcrumbItem isActive>{username}</BreadcrumbItem>
                </Breadcrumb>
            </PageBreadcrumb>

            <PageSection hasBodyWrapper={false}>
                <Title headingLevel="h1">{user?.fullName || username}</Title>
            </PageSection>

            {loading && (
                <PageSection hasBodyWrapper={false}>
                    <Spinner aria-label={t("Loading user")} />
                </PageSection>
            )}

            {loadError && (
                <PageSection hasBodyWrapper={false}>
                    <Alert variant="danger" isInline title={t("Failed to load user")}>{loadError}</Alert>
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
    const { t } = useTranslation();
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
        const violation = validateUsername(newUsername.trim());
        if (violation) { setError(usernameViolationMessage(t, violation)); return; }
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
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card isPlain>
            <CardTitle><Title headingLevel="h2" size="xl">{t("Identity")}</Title></CardTitle>
            <CardBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                {success && <Alert variant="success" isInline title={t("Changes saved.")} style={{ marginBottom: "1rem" }} />}
                <Form isHorizontal>
                    <FormGroup label={t("Username")} fieldId="ud-username" isRequired>
                        <TextInput id="ud-username" value={newUsername}
                            onChange={(_e, v) => { setNewUsername(v); setSuccess(false); }}
                            isDisabled={user.isProtected} />
                        {user.isProtected && (
                            <FormHelperText>
                                <HelperText>
                                    <HelperTextItem>{t("System accounts cannot be renamed.")}</HelperTextItem>
                                </HelperText>
                            </FormHelperText>
                        )}
                    </FormGroup>
                    <FormGroup label={t("Given name")} fieldId="ud-given-name">
                        <TextInput id="ud-given-name" value={givenName}
                            onChange={(_e, v) => { setGivenName(v); setSuccess(false); }} />
                    </FormGroup>
                    <FormGroup label={t("Surname")} fieldId="ud-surname">
                        <TextInput id="ud-surname" value={surname}
                            onChange={(_e, v) => { setSurname(v); setSuccess(false); }} />
                    </FormGroup>
                    <FormGroup label={t("Email")} fieldId="ud-email">
                        <TextInput id="ud-email" type="email" value={email}
                            onChange={(_e, v) => { setEmail(v); setSuccess(false); }} />
                    </FormGroup>
                    <ActionGroup>
                        <Button variant="primary" isLoading={saving}
                            isDisabled={unchanged || saving} onClick={handleSave}>
                            {t("Save changes")}
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
    const { t } = useTranslation();
    const [selected, setSelected] = useState<string[]>(user.groups);
    const [primaryGroup, setPrimaryGroupState] = useState(user.primaryGroup);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const membershipUnchanged = selected.length === user.groups.length &&
        selected.every(g => user.groups.includes(g));
    const unchanged = membershipUnchanged && primaryGroup === user.primaryGroup;

    function handleMembershipChange(v: string[]) {
        // Prevent removing the current primary group without changing it first
        if (primaryGroup && !v.includes(primaryGroup)) {
            setError(t("cannot_remove_primary_group", { name: primaryGroup }));
            return;
        }
        setError(null);
        setSelected(v);
        setSuccess(false);
    }

    async function handleSave() {
        if (unchanged) return;
        setSaving(true);
        setError(null);
        setSuccess(false);
        try {
            const toAdd = selected.filter(g => !user.groups.includes(g));
            const toRemove = user.groups.filter(g => !selected.includes(g));

            // 1. Add new group members first (required before setting a new group as primary)
            if (toAdd.length > 0) {
                await Promise.all(toAdd.map(g => addGroupMembers(g, [user.username])));
            }
            // 2. Change primary group if needed (user is now a member of the new group)
            if (primaryGroup !== user.primaryGroup) {
                await savePrimaryGroup(user.username, primaryGroup);
            }
            // 3. Remove old group members (safe now that primary has been updated)
            if (toRemove.length > 0) {
                await Promise.all(toRemove.map(g => removeGroupMembers(g, [user.username])));
            }

            const updated = await refreshUser(user.username);
            onUpdate(updated);
            setSelected(updated.groups);
            setPrimaryGroupState(updated.primaryGroup);
            setSuccess(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card isPlain>
            <CardTitle><Title headingLevel="h2" size="xl">{t("Groups")}</Title></CardTitle>
            <CardBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                {success && <Alert variant="success" isInline title={t("Group membership updated.")} style={{ marginBottom: "1rem" }} />}
                <Form isHorizontal>
                    <FormGroup label={t("Member of")} fieldId="ud-groups">
                        <GroupMultiSelect
                            selected={selected}
                            onChange={handleMembershipChange}
                            isDisabled={saving}
                        />
                    </FormGroup>
                    <FormGroup label={t("Primary group")} fieldId="ud-primary-group">
                        <FormSelect
                            id="ud-primary-group"
                            value={primaryGroup}
                            onChange={(_e, v) => { setPrimaryGroupState(v); setError(null); setSuccess(false); }}
                            isDisabled={saving || selected.length === 0}
                        >
                            {selected.map(g => (
                                <FormSelectOption key={g} value={g} label={g} />
                            ))}
                        </FormSelect>
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem>
                                    {t("Only groups the user is a member of can be set as primary.")}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                    <ActionGroup>
                        <Button variant="primary" isLoading={saving}
                            isDisabled={unchanged || saving} onClick={handleSave}>
                            {t("Save changes")}
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
    const { t } = useTranslation();
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
            <CardTitle><Title headingLevel="h2" size="xl">{t("Home Directory")}</Title></CardTitle>
            <CardBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                {success && <Alert variant="success" isInline title={t("Home directory provisioned.")} style={{ marginBottom: "1rem" }} />}
                <Form isHorizontal>
                    <FormGroup label={t("Drive")} fieldId="ud-home-drive">
                        <TextInput id="ud-home-drive" value={user.homeDrive || "—"} isDisabled />
                    </FormGroup>
                    <FormGroup label={t("Path")} fieldId="ud-home-path">
                        <TextInput id="ud-home-path" value={user.homeDirectory || "—"} isDisabled />
                    </FormGroup>
                    {!isProvisioned && !user.isProtected && (
                        <ActionGroup>
                            <Button variant="primary" isLoading={provisioning}
                                isDisabled={provisioning} onClick={handleProvision}>
                                {t("Provision home directory")}
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
    const { t } = useTranslation();
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [mustChange, setMustChange] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const { policy, policyError } = usePasswordPolicy();
    const { generate, copyState, revealCount } = usePasswordGenerator(policy);

    function handleGenerate() {
        const pwd = generate();
        if (pwd === null) return;
        setPassword(pwd);
        setPasswordConfirm(pwd);
        setSuccess(false);
    }

    async function handleSave() {
        if (!password) { setError(t("New password is required.")); return; }
        if (password !== passwordConfirm) { setError(t("Passwords do not match.")); return; }
        setSaving(true);
        setError(null);
        setSuccess(false);
        try {
            // Fall back to a fresh fetch so validation never gets skipped
            const pol = policy ?? await getPasswordPolicy();
            const violation = checkPasswordAgainstPolicy(pol, password);
            if (violation === "minLength") {
                setError(t("Password must be at least {{min}} characters.", { min: pol.minLength }));
                return;
            }
            if (violation === "complexity") {
                setError(t("Password does not meet the complexity requirements."));
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
            <CardTitle><Title headingLevel="h2" size="xl">{t("Authentication")}</Title></CardTitle>
            <CardBody>
                {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: "1rem" }} />}
                {success && <Alert variant="success" isInline title={t("Password updated.")} style={{ marginBottom: "1rem" }} />}
                <Form isHorizontal>
                    <FormGroup label={t("New password")} fieldId="ud-password">
                        <PasswordField
                            id="ud-password"
                            value={password}
                            onChange={v => { setPassword(v); setSuccess(false); }}
                            isDisabled={saving}
                            forceReveal={revealCount}
                            onGenerate={policy ? handleGenerate : undefined}
                            copyState={copyState}
                        />
                        {policy ? <PasswordPolicyInfo policy={policy} /> : policyError && <PasswordPolicyUnavailable />}
                    </FormGroup>
                    <FormGroup label={t("Confirm password")} fieldId="ud-password-confirm">
                        <PasswordField
                            id="ud-password-confirm"
                            value={passwordConfirm}
                            onChange={v => { setPasswordConfirm(v); setSuccess(false); }}
                            isDisabled={saving}
                            forceReveal={revealCount}
                        />
                    </FormGroup>
                    <FormGroup fieldId="ud-must-change">
                        <Checkbox id="ud-must-change"
                            label={t("Require password change at next login")}
                            isChecked={mustChange}
                            onChange={(_e, checked) => setMustChange(checked)} />
                    </FormGroup>
                    <ActionGroup>
                        <Button variant="primary" isLoading={saving}
                            isDisabled={saving || (!password && !passwordConfirm)} onClick={handleSave}>
                            {t("Set password")}
                        </Button>
                    </ActionGroup>
                </Form>
            </CardBody>
        </Card>
    );
}
