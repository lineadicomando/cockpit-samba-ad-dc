import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLdapShow, parseLdapMulti, parseList, deriveUserStatus, deriveLastActivity, ridFromSid, dnToName, parseGroupType } from "../src/lib/parsers.ts";

describe("parseList", () => {
    it("splits output in names", () => {
        const raw = "alice\nbob\nAdministrator\n";
        assert.deepEqual(parseList(raw), ["alice", "bob", "Administrator"]);
    });

    it("ignores empty lines", () => {
        assert.deepEqual(parseList("\n\n"), []);
    });
});

describe("parseLdapShow", () => {
    it("parses simple key: value", () => {
        const raw = "cn: alice\ndn: CN=alice,DC=acme,DC=internal\n";
        const result = parseLdapShow(raw);
        assert.equal(result["cn"], "alice");
        assert.equal(result["dn"], "CN=alice,DC=acme,DC=internal");
    });

    it("collects repeated keys into array", () => {
        const raw = "memberOf: CN=Users,DC=acme\nmemberOf: CN=Admins,DC=acme\n";
        const result = parseLdapShow(raw);
        assert.deepEqual(result["memberOf"], ["CN=Users,DC=acme", "CN=Admins,DC=acme"]);
    });

    it("ignores lines without ': ' separator", () => {
        const raw = "invalid line\ncn: valid\n";
        const result = parseLdapShow(raw);
        assert.equal(Object.keys(result).length, 1);
    });

    it("handles base64-encoded values with :: separator", () => {
        const raw = "objectSid:: AQUAAAA=\ncn: alice\n";
        const result = parseLdapShow(raw);
        assert.equal(result["objectSid"], "AQUAAAA=");
        assert.equal(result["cn"], "alice");
    });
});

describe("parseLdapMulti", () => {
    it("returns empty array for empty input", () => {
        assert.deepEqual(parseLdapMulti(""), []);
    });

    it("parses a single object block", () => {
        const raw = "dn: CN=alice,DC=acme\nsAMAccountName: alice\n";
        const result = parseLdapMulti(raw);
        assert.equal(result.length, 1);
        assert.equal(result[0]["sAMAccountName"], "alice");
    });

    it("parses multiple object blocks separated by blank lines", () => {
        const raw = "sAMAccountName: alice\ncn: Alice\n\nsAMAccountName: bob\ncn: Bob\n";
        const result = parseLdapMulti(raw);
        assert.equal(result.length, 2);
        assert.equal(result[0]["sAMAccountName"], "alice");
        assert.equal(result[1]["sAMAccountName"], "bob");
    });

    it("strips comment lines starting with # within blocks", () => {
        const raw = "# record 1\ndn: CN=alice,DC=acme\nsAMAccountName: alice\n";
        const result = parseLdapMulti(raw);
        assert.equal(result.length, 1);
        assert.equal(result[0]["sAMAccountName"], "alice");
        assert.equal(result[0]["#"], undefined);
    });

    it("filters out comment-only blocks like trailing count lines", () => {
        const raw = "sAMAccountName: alice\n\n# returned 1 records\n# 1 entries\n";
        const result = parseLdapMulti(raw);
        assert.equal(result.length, 1);
        assert.equal(result[0]["sAMAccountName"], "alice");
    });

    it("handles ldbsearch format with # record N headers", () => {
        const raw = [
            "# record 1",
            "dn: CN=alice,DC=acme",
            "sAMAccountName: alice",
            "",
            "# record 2",
            "dn: CN=bob,DC=acme",
            "sAMAccountName: bob",
            "",
            "# Returned 2 entries",
        ].join("\n");
        const result = parseLdapMulti(raw);
        assert.equal(result.length, 2);
        assert.equal(result[0]["sAMAccountName"], "alice");
        assert.equal(result[1]["sAMAccountName"], "bob");
    });
});

describe("deriveUserStatus", () => {
    it("returns Active when UAC bit 2 is 0", () => {
        assert.equal(deriveUserStatus("512"), "Active");
    });
    it("returns Disabled when UAC bit 2 is set", () => {
        assert.equal(deriveUserStatus("514"), "Disabled");
    });
    it("returns Unknown for invalid UAC", () => {
        assert.equal(deriveUserStatus("abc"), "Unknown");
    });
});

describe("deriveLastActivity", () => {
    it("returns Never for zero ticks", () => {
        assert.equal(deriveLastActivity("0"), "Never");
    });
    it("returns Never for negative ticks", () => {
        assert.equal(deriveLastActivity("-1"), "Never");
    });
    it("returns a date string for valid Windows ticks", () => {
        const unixMs = new Date("2024-01-01").getTime();
        const windowsTicks = String((unixMs + 11644473600000) * 10000);
        const result = deriveLastActivity(windowsTicks);
        assert.match(result, /2024/);
    });
});

describe("ridFromSid", () => {
    it("extracts last RID from SID", () => {
        assert.equal(ridFromSid("S-1-5-21-111-222-333-1104"), "1104");
    });
    it("returns - for empty string", () => {
        assert.equal(ridFromSid(""), "-");
    });
});

describe("parseGroupType", () => {
    it("returns Security for negative groupType (Security+Global)", () => {
        assert.equal(parseGroupType("-2147483646"), "Security");
    });
    it("returns Security for negative groupType (Security+DomainLocal)", () => {
        assert.equal(parseGroupType("-2147483644"), "Security");
    });
    it("returns Distribution for positive groupType (Distribution+Global)", () => {
        assert.equal(parseGroupType("2"), "Distribution");
    });
    it("returns Distribution for positive groupType (Distribution+Universal)", () => {
        assert.equal(parseGroupType("8"), "Distribution");
    });
    it("defaults to Security for empty string", () => {
        assert.equal(parseGroupType(""), "Security");
    });
});

describe("dnToName", () => {
    it("extracts CN from DN", () => {
        assert.equal(dnToName("CN=Domain Users,DC=acme,DC=internal"), "Domain Users");
    });
    it("is case-insensitive on cn=", () => {
        assert.equal(dnToName("cn=alice,DC=acme"), "alice");
    });
});
