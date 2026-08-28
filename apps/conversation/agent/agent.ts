import { createOpenAI } from "@ai-sdk/openai";
import { defineAgent } from "eve";

const specified = process.env.ZOEN_MODEL?.trim();
if (!specified) {
  throw new Error("ZOEN_MODEL environment variable is required");
}
const modelId = specified.includes("/")
  ? specified.slice(specified.indexOf("/") + 1)
  : specified;

export default defineAgent({
  model: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  }).chat(modelId),
  modelContextWindowTokens: 128_000,
  // Fly will use postgres world later.
});
