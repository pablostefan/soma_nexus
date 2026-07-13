import { AppError } from "./errors.js";

type TextContent = {
  type: "text";
  text: string;
};

export type SuccessResponse = {
  content: [TextContent];
};

export type ErrorResponse = {
  content: [TextContent];
  isError: true;
};

export type ToolResponse = SuccessResponse | ErrorResponse;

export type ResponseMode = "standard" | "compact";

type ResponseDebugOptions = {
  payload?: unknown;
  extra?: Record<string, unknown>;
};

type ResponseOptions = {
  mode?: ResponseMode;
  debug?: ResponseDebugOptions;
};

function stringifyEnvelope(value: unknown, mode: ResponseMode): string {
  return mode === "compact" ? JSON.stringify(value) : JSON.stringify(value, null, 2);
}

export function ok(data: unknown, options?: ResponseOptions): SuccessResponse {
  const mode = options?.mode ?? "standard";

  const envelope: Record<string, unknown> = {
    ok: true,
    data
  };

  if (options?.debug) {
    const payloadSizeBytes =
      options.debug.payload === undefined
        ? undefined
        : Buffer.byteLength(JSON.stringify(options.debug.payload), "utf8");

    envelope.meta = {
      ...(options.debug.extra ?? {}),
      ...(payloadSizeBytes === undefined ? {} : { payloadSizeBytes })
    };
  }

  let text = stringifyEnvelope(envelope, mode);

  if (options?.debug) {
    envelope.meta = {
      ...((envelope.meta as Record<string, unknown> | undefined) ?? {}),
      responseSizeBytes: Buffer.byteLength(text, "utf8")
    };
    text = stringifyEnvelope(envelope, mode);
  }

  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}

export function fail(error: unknown, mode: ResponseMode = "standard"): ErrorResponse {
  if (error instanceof AppError) {
    return {
      content: [
        {
          type: "text",
          text: stringifyEnvelope(
            {
              ok: false,
              error: {
                code: error.code,
                message: error.message,
                details: error.details ?? null
              }
            },
            mode
          )
        }
      ],
      isError: true
    };
  }

  return {
    content: [
      {
        type: "text",
        text: stringifyEnvelope(
          {
            ok: false,
            error: {
              code: "INTERNAL_ERROR",
              message: error instanceof Error ? error.message : "Unknown error"
            }
          },
          mode
        )
      }
    ],
    isError: true
  };
}

export async function runTool(
  handler: () => Promise<SuccessResponse>,
  options?: { mode?: ResponseMode }
): Promise<ToolResponse> {
  try {
    return await handler();
  } catch (error) {
    return fail(error, options?.mode ?? "standard");
  }
}
