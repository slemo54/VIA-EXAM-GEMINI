import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const analyzeExamSheet = async (
  imageBase64: string, 
  numQuestions: number = 100,
  onProgress?: (msg: string) => void
) => {
  if (onProgress) onProgress("Initializing AI model...");
  
  const request = {
    model: "gemini-3.1-pro-preview",
    contents: [
      {
        parts: [
          {
            text: `You are an expert at grading multiple-choice exam answer sheets.
            
            TASK:
            1. Find the "Candidate Number" (e.g., "14567ANSE") written in the top box. If it's not present on this page, return null for it.
            2. Find the "Candidate ID" written in the top right corner, usually circled in red (e.g., "VR 26-06"). If it's not present, return null for it.
            3. Scan ALL the numbered questions visible on the page. 
               - Page 1 usually contains questions 1 to 45.
               - Page 2 usually contains questions 46 to 100.
               - You MUST scan every single column from top to bottom.
               - CRITICAL: DO NOT SKIP ANY QUESTIONS. If a question has a marked answer, you MUST include it in the output.
               - Do not stop scanning until you reach the bottom of the last column on the page.
            4. For each question, look at the 5 options (A, B, C, D, E).
            5. If an option is scribbled, blackened, or marked with an 'X', it is the selected answer. Even if the mark is faint, it counts as an answer.
            6. If all options for a question are empty (just thin outlines), SKIP that question. Do not include it.
            7. CRITICAL FOR AMBIGUOUS MARKS: If a mark is placed IN BETWEEN two bubbles, is just a stray smudge, or crosses multiple options, you MUST set \`is_unsure\` to true. DO NOT TRY TO GUESS the intended answer. If you are not 100% sure which specific bubble the candidate intended to select, mark it as unsure.
            8. Double-check your work before returning the result. Did you miss any questions in the middle of a column? Did you miss the last column?
            
            OUTPUT:
            Return a JSON object containing the candidate number, candidate ID (both or null), and a list of ALL detected answers.`
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64.split(",")[1] || imageBase64
            }
          }
        ]
      }
    ],
    config: {
      systemInstruction: "You are a precise OCR engine for exam sheets. You output ONLY valid, compact JSON. You never add extra spaces, explanations, or conversational filler. You distinguish between empty circles and filled bubbles with high accuracy. You are extremely strict about ambiguous marks: if a mark is between bubbles, crosses multiple options, or is a stray smudge, you MUST flag it as unsure.",
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          candidate_number: { type: Type.STRING, nullable: true },
          candidate_id: { type: Type.STRING, nullable: true },
          detected_answers: {
            type: Type.ARRAY,
            description: "List of questions that have a filled bubble.",
            items: {
              type: Type.OBJECT,
              properties: {
                question_number: { type: Type.NUMBER },
                selected_option: { type: Type.STRING },
                is_unsure: { type: Type.BOOLEAN, description: "MUST be true if the mark is faint, ambiguous, between two bubbles, crosses multiple options, or is a stray smudge. DO NOT GUESS." }
              },
              required: ["question_number", "selected_option"]
            }
          },
          confidence: { type: Type.NUMBER }
        },
        required: ["candidate_number", "detected_answers", "confidence"]
      }
    }
  };

  if (onProgress) onProgress("Sending image to AI...");
  const responseStream = await ai.models.generateContentStream(request);

  let text = "";
  for await (const chunk of responseStream) {
    if (chunk.text) {
      text += chunk.text;
    }
    if (onProgress) {
      if (!text.includes("candidate_number")) {
        onProgress("Detecting candidate number...");
      } else if (text.includes("detected_answers")) {
        const matches = text.match(/"question_number"/g);
        const count = matches ? matches.length : 0;
        onProgress(`Extracting answers... (${count} found so far)`);
      }
    }
  }
  
  if (onProgress) onProgress("Finalizing analysis...");
  
  // Robust JSON extraction and cleaning
  try {
    text = text.trim();
    // If the model returned a massive string of spaces, this will help
    if (text.length > 50000) {
      text = text.replace(/\s{2,}/g, ' '); 
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw e;
    }
  } catch (e) {
    console.error(`Gemini JSON Parse Error (Length: ${text.length}). Raw text snippet:`, text.substring(0, 200));
    throw new Error("L'intelligenza artificiale ha restituito un formato non valido. Riprova.");
  }
};
