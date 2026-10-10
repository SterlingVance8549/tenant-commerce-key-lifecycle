import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiControlPlane, InfraiError } from "./infrai_control_plane.js";
import { offboardTenantBody, provisionTenantBody, TenantLifecycle } from "./tenant_lifecycle.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const lifecycle = new TenantLifecycle(new InfraiControlPlane(apiKey));
const port = Number(process.env.PORT ?? 3000);

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function jsonBody(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/tenants/provision") {
      const input = provisionTenantBody.parse(await jsonBody(request));
      const tenant = await lifecycle.provision(input);
      send(response, 201, tenant);
      return;
    }
    if (request.method === "POST" && request.url === "/tenants/offboard") {
      const input = offboardTenantBody.parse(await jsonBody(request));
      send(response, 200, await lifecycle.offboard(input));
      return;
    }
    send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError) {
      send(response, 400, { error: "Invalid request body", issues: error.issues });
    } else if (error instanceof InfraiError) {
      send(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.code,
        message: error.message,
      });
    } else {
      send(response, 502, { error: "Tenant operation did not complete" });
    }
  }
}).listen(port, () => console.log(`Tenant key service listening on http://localhost:${port}`));
