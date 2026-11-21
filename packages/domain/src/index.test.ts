import { expect, it } from "vitest";
import { assertTenantScope, type TenantContext } from "./index";
it.each([undefined, { organizationId: "", userId: "u", role: "OWNER" }, { organizationId: "o", userId: "", role: "OWNER" }])("requires an organization and user: %j", input => {
  expect(() => assertTenantScope(input as TenantContext | undefined)).toThrow("Tenant context is required");
});
it("accepts a tenant-scoped user", () => {
  expect(() => assertTenantScope({ organizationId: "o", userId: "u", role: "VIEWER" })).not.toThrow();
});
