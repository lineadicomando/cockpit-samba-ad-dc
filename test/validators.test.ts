import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateUsername } from "../src/lib/validators.ts";

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
