export interface UserRow {
    username: string;
    isProtected: boolean;
    detailsLoaded: false;
}

export interface User {
    username: string;
    fullName: string;
    givenName: string;
    surname: string;
    email: string;
    id: string;
    status: "Active" | "Disabled" | "Unknown";
    lastActivity: string;
    groups: string[];
    isAdmin: boolean;
    isProtected: boolean;
    isStatusLocked: boolean;
    homeDrive: string;
    homeDirectory: string;
    detailsLoaded: true;
}

export type AnyUser = UserRow | User;

export interface GroupRow {
    name: string;
    isProtected: boolean;
    detailsLoaded: false;
}

export interface Group {
    name: string;
    description: string;
    id: string;
    memberCount: number;
    members: string[];
    isCriticalSystemObject: boolean;
    isProtected: boolean;
    detailsLoaded: true;
}

export type AnyGroup = GroupRow | Group;

export interface ComputerRow {
    name: string;
    detailsLoaded: false;
}

export interface Computer {
    name: string;
    dn: string;
    id: string;
    os: string;
    lastLogon: string;
    detailsLoaded: true;
}

export type AnyComputer = ComputerRow | Computer;

export interface PasswordPolicy {
    complexityRequired: boolean;
    minLength: number;
    historyLength: number;
}

export type LdapFields = Record<string, string | string[]>;
