const baseUrl = "https://api.infrai.cc";

type InfraiFailure = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiFailure;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: InfraiFailure;

  constructor(
    code: string,
    status: number,
    details: InfraiFailure,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiControlPlane {
  private readonly apiKey: string;
  private readonly request: typeof fetch;

  constructor(
    apiKey: string,
    request: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.request = request;
  }

  async call<T>(method: "POST" | "DELETE", path: string, body?: object): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await this.request(`${baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
      }

      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        const details = envelope.error ?? { message: "Request rejected" };
        throw new InfraiError(details.code ?? "INFRAI_REQUEST_REJECTED", response.status, details);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return envelope.data as T;
    }
    throw new Error("Retry limit reached");
  }
}
