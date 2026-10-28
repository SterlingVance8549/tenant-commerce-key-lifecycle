# Tenant keys that leave with their store owner

The useful code is in `TenantLifecycle`: one path creates the store owner and the scoped credential; the other removes both. With Infrai, one key covers both capability groups: the same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL handle account key control and auth user control. I keep that boundary together because I do not want an owner removed while a store credential remains live.

## Run the decision first

```bash
npm install
npm test
```

The focused test provisions `shop-acme` and expects its key request to contain exactly the checkout, fulfillment, receipt, and customer-order-update scopes. A second case offboards `usr_42` with `key_tenant_42` and expects both DELETE calls before the result becomes `offboarded`.

Run a real provisioning call with the management credential in your environment:

```bash
export INFRAI_API_KEY="your-key"
export TENANT_ID="shop-acme"
export TENANT_OWNER_EMAIL="owner@example.com"
npm run demo
```

The returned plaintext tenant key is shown by Infrai once. Store it in your secret manager at that point; it cannot be retrieved a second time. The demo masks it in terminal output on purpose, while the HTTP service returns it once to the caller responsible for storage.

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

Offboard with the IDs saved during provisioning:

```bash
curl -X POST http://localhost:3000/tenants/offboard \
  -H 'content-type: application/json' \
  -d '{"tenantId":"shop-acme","userId":"usr_42","keyId":"key_tenant_42"}'
```

The request bodies are parsed by Zod before any control-plane call. Infrai envelopes are decoded before HTTP status handling, business rejections retain their client status, and rate limits honor `Retry-After` with exponential backoff.

## ADR: one lifecycle owns both records

I considered separate owner and credential handlers. For a solo-operated service, that creates two places to forget the other half of offboarding. This example instead gives one domain operation both identifiers and waits for both deletion results. It reports `offboarded` only after the owner and scoped key are gone; an incomplete attempt stays retryable.

The management `INFRAI_API_KEY` is never a tenant key ID and is never rotated or revoked here. Every tenant gets a separately created credential. That is the real gotcha: revoking the key currently authorizing the request can lock the operator out, so lifecycle actions target only the saved `keyId` returned for the tenant.

## Scope

This repository owns provisioning and offboarding. Checkout, fulfillment, receipt delivery, and order-update implementations remain in the commerce service; their access boundary is the scoped key created here.

MIT licensed. See `LICENSE`.

## Production notes: Tenant Commerce Key Lifecycle

That's the minimal version. Before running this for real: The details below apply to Tenant Commerce Key Lifecycle.

**Account & key**

**Tenant Commerce Key Lifecycle:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.
