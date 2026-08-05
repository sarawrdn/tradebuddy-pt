import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parses a fetch Response as JSON, but turns a non-JSON body (e.g. an empty
 * response from a serverless function timeout, or an HTML error page) into
 * a readable error instead of a cryptic "Unexpected end of JSON input".
 */
export async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) {
    throw new Error(
      res.ok
        ? "Server returned an empty response"
        : `Request failed (${res.status}) with an empty response — it may have timed out`
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned an unexpected response (${res.status})`);
  }
}
