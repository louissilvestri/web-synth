import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistJson, useStorageStatus } from "./storageStatus";

beforeEach(() => {
  useStorageStatus.setState({ failed: false, reason: "" });
  vi.unstubAllGlobals();
});

function stubStorage(setItem: (k: string, v: string) => void) {
  vi.stubGlobal("window", { localStorage: { setItem } });
}

describe("storage status", () => {
  it("reports a quota failure with a specific reason", () => {
    stubStorage(() => {
      throw new Error("QuotaExceededError: quota exceeded");
    });
    persistJson("k", { a: 1 });
    const s = useStorageStatus.getState();
    expect(s.failed).toBe(true);
    expect(s.reason).toMatch(/full/i);
  });

  it("reports a generic failure when storage is blocked", () => {
    stubStorage(() => {
      throw new Error("SecurityError: access denied");
    });
    persistJson("k", { a: 1 });
    expect(useStorageStatus.getState().failed).toBe(true);
    expect(useStorageStatus.getState().reason).toMatch(/unavailable/i);
  });

  it("a successful write clears a previous failure", () => {
    stubStorage(() => {
      throw new Error("nope");
    });
    persistJson("k", {});
    expect(useStorageStatus.getState().failed).toBe(true);

    const written: string[] = [];
    stubStorage((_k, v) => void written.push(v));
    persistJson("k", { ok: true });
    expect(useStorageStatus.getState().failed).toBe(false);
    expect(written[0]).toBe('{"ok":true}');
  });

  it("does not throw when storage fails — the live session keeps working", () => {
    stubStorage(() => {
      throw new Error("nope");
    });
    expect(() => persistJson("k", {})).not.toThrow();
  });
});
