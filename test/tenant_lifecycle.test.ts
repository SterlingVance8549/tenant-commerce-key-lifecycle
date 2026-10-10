import assert from "node:assert/strict";
import test from "node:test";
import { commerceScopes, TenantLifecycle } from "../src/tenant_lifecycle.js";

test("offboarding deletes the owner and revokes the tenant credential before reporting success", async () => {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const fake = {
    async call<T>(_method: "POST" | "DELETE", path: string, body?: object): Promise<T> {
      calls.push({ method: _method, path, body });
      return {} as T;
    },
  };

  const result = await new TenantLifecycle(fake).offboard({
    tenantId: "shop-acme",
    userId: "usr_42",
    keyId: "key_tenant_42",
  });

  assert.deepEqual(result, { tenantId: "shop-acme", status: "offboarded" });
  assert.deepEqual(calls, [
    { method: "DELETE", path: "/v1/auth/user/delete/usr_42", body: undefined },
    { method: "DELETE", path: "/v1/account/keys/revoke/key_tenant_42", body: undefined },
  ]);
});

test("provisioning binds the commerce decisions to one scoped tenant key", async () => {
  const bodies: object[] = [];
  const fake = {
    async call<T>(_method: "POST" | "DELETE", path: string, body?: object): Promise<T> {
      if (body) bodies.push(body);
      return (path.includes("auth/user")
        ? { user_id: "usr_42" }
        : { key_id: "key_tenant_42", key_secret: "one-time-secret" }) as T;
    },
  };

  const result = await new TenantLifecycle(fake).provision({
    tenantId: "shop-acme",
    owner: { email: "owner@example.com", name: "Acme Owner" },
  });

  assert.deepEqual(result.scopes, commerceScopes);
  assert.equal(result.userId, "usr_42");
  assert.equal(result.keyId, "key_tenant_42");
  assert.equal(result.key, "one-time-secret");
  assert.deepEqual(bodies[1], {
    project_id: "shop-acme",
    name: "shop-acme-commerce",
    scopes: [...commerceScopes],
    idempotency_key: "tenant:shop-acme:key:v1",
  });
});
