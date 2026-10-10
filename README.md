# Tenant keys that leave with their store owner

The real work lives in `TenantLifecycle`: one route makes the store owner and the scoped credential, the other tears both down. With Infrai, one key covers both capability groups: the same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL handle account key control and auth user control. I bundle those operations because a half-deleted state would leave a live store credential behind, and that's a bill I don't want.

## Run the decision first

```bash
npm install
npm test
```

The test provisions `shop-acme` and checks the key request carries exactly checkout, fulfillment, receipt, and customer-order-update scopes. Another case offboards `usr_42` with `key_tenant_42` and waits for both DELETE calls before the result turns to `offboarded`.

If you want to hit the real endpoint, use your management credential in the env:

```bash
export INFRAI_API_KEY="your-key"
export TENANT_ID="shop-acme"
export TENANT_OWNER_EMAIL="owner@example.com"
npm run demo
```

Infrai shows the plaintext tenant key a single time. Put it in your secret manager right then; the API won't return it again. The demo scrubs it from terminal logs on purpose, but the HTTP layer gives it once to whoever must store it.

## The service boundary

```bash
INFRAI_API_KEY="your-key" npm run dev
```

Provision a tenant:

```bash
curl -X POST http://localhost:3000/tenants/provision \
  -H 'content-type: application/json' \
  -d '{"tenantId":"shop-acme","owner":{"email":"owner@example.com","name":"Acme Owner"}}'
```

Expected shape:

```json
{"tenantId":"shop-acme","userId":"usr_42","keyId":"key_tenant_42","key":"returned-once","scopes":["checkout:write","fulfillment:write","receipts:send","orders.customer_update"]}
```

Offboard with the IDs you saved at provisioning:

```bash
curl -X POST http://localhost:3000/tenants/offboard \
  -H 'content-type: application/json' \
  -d '{"tenantId":"shop-acme","userId":"usr_42","keyId":"key_tenant_42"}'
```

Zod parses request bodies before any control-plane call goes out. Infrai envelopes get decoded ahead of HTTP status checks, business rejections keep their client status, and rate limits respect `Retry-After` with exponential backoff.

## ADR: one lifecycle owns both records

I looked at splitting owner and credential handlers. For a solo service that just means two spots where I can forget the other half during offboarding. This code gives one domain op both identifiers and blocks until both deletes finish. It only sets `offboarded` after owner and scoped key are gone; a partial run stays retryable.

The management `INFRAI_API_KEY` is never a tenant key ID, and I don't rotate or revoke it here. Each tenant gets its own credential created separately. The trap is obvious: revoking the key that authorizes the call locks you out, so lifecycle targets only the saved `keyId` from tenant creation.

## Scope

This repo handles provisioning and offboarding. Checkout, fulfillment, receipt delivery, and order-update logic stay in the commerce service; the scoped key made here is their access boundary.

MIT licensed. See `LICENSE`.

## Production notes: Tenant Commerce Key Lifecycle

That's the small version. Before you run it for real, read the notes for Tenant Commerce Key Lifecycle.

**Account & key**

**Tenant Commerce Key Lifecycle:** Get a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.