import Anthropic from "@anthropic-ai/sdk";
import { config, hasGenKey } from "../config.js";
import { HttpError } from "../http.js";

let client = null;

export function getClient() {
  if (!hasGenKey()) {
    throw new HttpError(400, "ANTHROPIC_API_KEY is not set", {
      hint: "Add it to apps/shingle/.env. Prospecting works without it; generation does not.",
    });
  }
  return (client ??= new Anthropic());
}

/**
 * One request, streamed.
 *
 * Streaming is not optional here: these calls run long enough to trip HTTP
 * timeouts, and the UI wants progress. Server-side fallbacks are requested by
 * default and dropped on the one error that means the API does not offer them.
 */
export async function send(params, onEvent = () => {}) {
  const anthropic = getClient();
  const withFallbacks = {
    ...params,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };

  let message;
  try {
    message = await streamOnce(anthropic, withFallbacks, onEvent);
  } catch (err) {
    if (err?.status === 400) {
      onEvent({ type: "note", message: "Server-side fallbacks unavailable; retrying without them." });
      message = await streamOnce(anthropic, params, onEvent);
    } else {
      throw err;
    }
  }

  if (message.stop_reason === "refusal") {
    throw new HttpError(422, "The model declined this request", {
      category: message.stop_details?.category ?? null,
      explanation: message.stop_details?.explanation ?? null,
    });
  }
  return message;
}

async function streamOnce(anthropic, params, onEvent) {
  const stream = params.betas ? anthropic.beta.messages.stream(params) : anthropic.messages.stream(params);

  let bytes = 0;
  stream.on("streamEvent", (event) => {
    if (event.type !== "content_block_delta") return;
    if (event.delta?.type === "thinking_delta" && event.delta.thinking) {
      onEvent({ type: "thinking", text: event.delta.thinking });
    } else if (event.delta?.type === "text_delta") {
      bytes += event.delta.text.length;
      onEvent({ type: "delta", bytes, text: event.delta.text });
    }
  });

  return stream.finalMessage();
}

export const textOf = (message) =>
  message.content.filter((b) => b.type === "text").map((b) => b.text).join("");

export const usageOf = (message) => ({
  input: message.usage?.input_tokens ?? 0,
  output: message.usage?.output_tokens ?? 0,
  cacheRead: message.usage?.cache_read_input_tokens ?? 0,
  cacheWrite: message.usage?.cache_creation_input_tokens ?? 0,
});

export const genConfig = () => config.gen;
