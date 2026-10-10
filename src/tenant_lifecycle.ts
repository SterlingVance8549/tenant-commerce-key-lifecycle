import { z } from "zod";

type ControlPlane = {
  call<T>(method: "POST" | "DELETE", path: string, body?: object): Promise<T>;
};

export const commerceScopes = [
  "checkout:write",
  "fulfillment:write",
  "receipts:send",
  "orders.customer_update",
] as const;

export const provisionTenantBody = z.object({
  tenantId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  owner: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(120),
  }),
});

export const offboardTenantBody = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  keyId: z.string().min(1),
});

export type ProvisionTenant = z.infer<typeof provisionTenantBody>;
export type OffboardTenant = z.infer<typeof offboardTenantBody>;

type CreatedUser = { user_id: string };
type CreatedKey = { key_id: string; key_secret: string };

export type ProvisionedTenant = {
  tenantId: string;
  userId: string;
  keyId: string;
  key: string;
  scopes: readonly string[];
};

export class TenantLifecycle {
  private readonly infrai: ControlPlane;

  constructor(infrai: ControlPlane) {
    this.infrai = infrai;
  }

  async provision(input: ProvisionTenant): Promise<ProvisionedTenant> {
    const user = await this.infrai.call<CreatedUser>("POST", "/v1/auth/user/create", {
      email: input.owner.email,
      name: input.owner.name,
      metadata: { tenant_id: input.tenantId },
      mode: "tenant",
      idempotency_key: `tenant:${input.tenantId}:user:v1`,
    });

    const credential = await this.infrai.call<CreatedKey>("POST", "/v1/account/keys/create", {
      project_id: input.tenantId,
      name: `${input.tenantId}-commerce`,
      scopes: [...commerceScopes],
      idempotency_key: `tenant:${input.tenantId}:key:v1`,
    });

    return {
      tenantId: input.tenantId,
      userId: user.user_id,
      keyId: credential.key_id,
      key: credential.key_secret,
      scopes: commerceScopes,
    };
  }

  async offboard(input: OffboardTenant): Promise<{ tenantId: string; status: "offboarded" }> {
    const results = await Promise.allSettled([
      this.infrai.call("DELETE", `/v1/auth/user/delete/${encodeURIComponent(input.userId)}`),
      this.infrai.call("DELETE", `/v1/account/keys/revoke/${encodeURIComponent(input.keyId)}`),
    ]);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length > 0) {
      throw new AggregateError(failures.map((failure) => failure.reason), "Tenant offboarding is incomplete");
    }
    return { tenantId: input.tenantId, status: "offboarded" };
  }
}
