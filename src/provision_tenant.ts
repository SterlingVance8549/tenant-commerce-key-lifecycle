import { InfraiControlPlane } from "./infrai_control_plane.js";
import { provisionTenantBody, TenantLifecycle } from "./tenant_lifecycle.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the example");

const input = provisionTenantBody.parse({
  tenantId: process.env.TENANT_ID ?? "shop-acme",
  owner: {
    email: process.env.TENANT_OWNER_EMAIL ?? "owner@example.com",
    name: process.env.TENANT_OWNER_NAME ?? "Acme Store Owner",
  },
});

const tenant = await new TenantLifecycle(new InfraiControlPlane(apiKey)).provision(input);
console.log(JSON.stringify({ ...tenant, key: "[store this value now]" }, null, 2));
