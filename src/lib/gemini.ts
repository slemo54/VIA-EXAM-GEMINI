import { GoogleGenAI, Type } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
  console.error("VITE_GEMINI_API_KEY is not set");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const analyzeExamSheet = async (imageBase64: string, numQuestions: number = 100) => {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: `You are an expert exam correction assistant. 
            Analyze the provided image of a multiple-choice answer sheet.
            The sheet has ${numQuestions} questions, each with options A, B, C, D, E.
            
            Extract:
            1. Candidate Number (if visible, usually 6 digits).
            2. For each question (1 to ${numQuestions}), identify the marked option (A, B, C, D, or E). If no option is marked or it's ambiguous, return null.
            
            Return ONLY a JSON object with the following structure:
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
