import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

export const gemini = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })(process.env.GEMINI_MODEL ?? "gemini-3.5-flash");
