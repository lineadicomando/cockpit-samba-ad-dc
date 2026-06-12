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
    primaryGroup: string;
    isAdmin: boolean;
    isProtected: boolean;
    isStatusLocked: boolean;
    homeDrive: string;
    homeDirectory: string;
}

export interface Group {
    name: string;
    description: string;
    id: string;
    memberCount: number;
    members: string[];
    isCriticalSystemObject: boolean;
    isProtected: boolean;
    groupType: "Security" | "Distribution";
}

export interface Computer {
    name: string;
    dn: string;
    id: string;
    os: string;
    lastLogon: string;
}

export interface PasswordPolicy {
    complexityRequired: boolean;
    minLength: number;
    historyLength: number;
}

export type LdapFields = Record<string, string | string[]>;
