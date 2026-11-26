import { describe, expect, it } from "vitest";
import { canPersistRemoteUserNotification } from "./notificationGuard";

describe("remote notification recipient guard", () => {
  it("allows a real Supabase user in online mode", () => {
    expect(canPersistRemoteUserNotification("986ac85a-b4af-4b75-9052-1fad6403cfe3", false)).toBe(true);
  });

  it("blocks the synthetic offline identity", () => {
    expect(canPersistRemoteUserNotification("offline-careflow-user", true)).toBe(false);
  });

  it("blocks synthetic or malformed identities even if mode detection is stale", () => {
    expect(canPersistRemoteUserNotification("offline-careflow-user", false)).toBe(false);
    expect(canPersistRemoteUserNotification("not-a-uuid", false)).toBe(false);
  });

  it("blocks missing recipients and all offline writes", () => {
    expect(canPersistRemoteUserNotification(null, false)).toBe(false);
    expect(canPersistRemoteUserNotification(undefined, false)).toBe(false);
    expect(canPersistRemoteUserNotification("986ac85a-b4af-4b75-9052-1fad6403cfe3", true)).toBe(false);
  });
});
