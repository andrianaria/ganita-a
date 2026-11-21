export type TenantContext = {
  organizationId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
};

export function assertTenantScope(context: TenantContext | undefined): asserts context is TenantContext {
  if (!context?.organizationId || !context.userId) {
    throw new Error("Tenant context is required");
  }
}
