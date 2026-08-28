import { createOpenAI } from "@ai-sdk/openai";
import { defineAgent } from "eve";

const specified = process.env.ZOEN_MODEL?.trim() ?? "";
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
