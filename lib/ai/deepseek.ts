import OpenAI from "openai";

let client: OpenAI | undefined;

export function getDeepSeekClient() {
  if (client) return client;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

  client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
  return client;
}
