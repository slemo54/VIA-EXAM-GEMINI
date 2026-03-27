import { GoogleGenAI, Type } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
  console.error("VITE_GEMINI_API_KEY is not set");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const analyzeExamSheet = async (imageBase64: string, numQuestions: number = 100) => {
  const model = ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      {
        parts: [
          {
            text: `You are an expert exam correction assistant. 
            Analyze the provided image of a multiple-choice answer sheet.
            The sheet has ${numQuestions} questions, each with options A, B, C, D, E.
            
            Extract carefully:
            - Scan the image thoroughly to find the bubbling area.
            - The bubbles are usually marked with a dark fill (pencil or pen).
            - Empty circles should NOT be considered as answers.
            - Ensure you map the row number correctly to the question number.

            Extract:
            1. Candidate Number (if visible, usually 6 digits).
            2. For each question (1 to ${numQuestions}), identify the marked option (A, B, C, D, or E). If no option is marked or it's ambiguous, return null.
            
            CRITICAL INSTRUCTIONS FOR READING BUBBLES:
            - A bubble is considered "marked" if it is filled in with dark ink/pencil.
            - A bubble with just an outline and white inside is NOT marked.
            - If multiple bubbles are filled for a single question, return "INVALID".
            - If no bubble is filled, return null or empty string.
            - You MUST return an answer for every single question from 1 to ${numQuestions}. Look closely at the whole page.

            Return ONLY a JSON object with the exact following structure:
            {
              "candidate_number": "string or null",
              "answers": {
                "1": "A",
                "2": "C",
                ...
              },
              "confidence": 0.95
            }`
          },
          {
            inlineData: {
              mimeType: "image/png",
              data: imageBase64.split(",")[1] || imageBase64
            }
          }
        ]
      }
    ],
    config: {
      // @ts-ignore - The types in @google/genai might not have mediaResolution yet
      mediaResolution: "media_resolution_high",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          candidate_number: { type: Type.STRING },
          answers: {
            type: Type.OBJECT,
            additionalProperties: { type: Type.STRING }
          },
          confidence: { type: Type.NUMBER }
        },
        required: ["candidate_number", "answers", "confidence"]
      }
    }
  });

  const response = await model;
  return JSON.parse(response.text);
};
