import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateUsername, validateGroupName, validateMemberName } from "../src/lib/validators.ts";

describe("validateUsername", () => {
    it("accepts typical usernames", () => {
        assert.equal(validateUsername("mario.rossi"), null);
        assert.equal(validateUsername("Studente01"), null);
        assert.equal(validateUsername("a"), null);
        assert.equal(validateUsername("user_name-x"), null);
        assert.equal(validateUsername("nome cognome"), null);
    });

    it("rejects the empty string", () => {
        assert.equal(validateUsername(""), "empty");
    });

    it("rejects names longer than 20 characters", () => {
        assert.equal(validateUsername("a".repeat(20)), null);
        assert.equal(validateUsername("a".repeat(21)), "tooLong");
    });

    it("rejects AD-invalid characters", () => {
        for (const c of '"/\\[]:;|=,+*?<>') {
            assert.equal(validateUsername(`user${c}x`), "invalidChars", `expected '${c}' to be rejected`);
        }
    });

    it("rejects control characters", () => {
        assert.equal(validateUsername("user\u0000x"), "invalidChars");
        assert.equal(validateUsername("user\tx"), "invalidChars");
        assert.equal(validateUsername("user\nx"), "invalidChars");
    });

    it("rejects a leading dash (would be parsed as a CLI option)", () => {
        assert.equal(validateUsername("-admin"), "leadingDash");
        assert.equal(validateUsername("--random-password"), "leadingDash");
        assert.equal(validateUsername("ad-min"), null);
    });

    it("rejects a trailing period", () => {
        assert.equal(validateUsername("user."), "trailingPeriod");
        assert.equal(validateUsername("user.name"), null);
    });
});

describe("validateGroupName", () => {
    it("accepts typical group names, including ones longer than 20 characters", () => {
        assert.equal(validateGroupName("2C"), null);
        assert.equal(validateGroupName("Docenti scuola primaria plesso nord"), null);
    });

    it("rejects the empty string and names longer than 256 characters", () => {
        assert.equal(validateGroupName(""), "empty");
        assert.equal(validateGroupName("g".repeat(256)), null);
        assert.equal(validateGroupName("g".repeat(257)), "tooLong");
    });

    it("rejects a leading dash (would be parsed as a samba-tool option)", () => {
        assert.equal(validateGroupName("-H"), "leadingDash");
        assert.equal(validateGroupName("--help"), "leadingDash");
    });

    it("rejects AD-invalid characters and a trailing period", () => {
        assert.equal(validateGroupName("a,b"), "invalidChars");
        assert.equal(validateGroupName("grp."), "trailingPeriod");
    });
});

describe("validateMemberName", () => {
    it("accepts users, computer accounts and nested groups", () => {
        assert.equal(validateMemberName("student-alice"), null);
        assert.equal(validateMemberName("PC00$"), null);
        assert.equal(validateMemberName("Docenti scuola primaria plesso nord"), null);
    });

    it("rejects option-like names", () => {
        assert.equal(validateMemberName("-x"), "leadingDash");
    });
});
