import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCache } from "../src/lib/cache.ts";

describe("createCache", () => {
    it("returns null for missing key", () => {
        const cache = createCache();
        assert.equal(cache.get("key", 5000), null);
    });

    it("returns cached value within TTL", () => {
        const cache = createCache();
        cache.set("key", "value");
        assert.equal(cache.get("key", 5000), "value");
    });

    it("returns null after TTL expires", async () => {
        const cache = createCache();
        cache.set("key", "value");
        await new Promise(r => setTimeout(r, 50));
        assert.equal(cache.get("key", 10), null);
    });

    it("invalidate removes matching keys", () => {
        const cache = createCache();
        cache.set("user list", "data1");
        cache.set("group list", "data2");
        cache.invalidate(k => k.includes("user"));
        assert.equal(cache.get("user list", 5000), null);
        assert.equal(cache.get("group list", 5000), "data2");
    });

    it("clear removes all keys", () => {
        const cache = createCache();
        cache.set("a", "1");
        cache.set("b", "2");
        cache.clear();
        assert.equal(cache.get("a", 5000), null);
        assert.equal(cache.get("b", 5000), null);
    });
});
