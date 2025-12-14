import { GoogleGenAI, Tool } from "@google/genai";
import { AppMode, GeneratedFile } from "../types";
import { parseGeneratedContent } from "../utils/parser";

// Helper to convert Blob/File to Base64
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const SYSTEM_INSTRUCTION = `
You are CodeForge, an expert AI software architect.

***CRITICAL INSTRUCTIONS - READ CAREFULLY***

1. **PURE CODE (NO COMMENTS)**:
   - You must generate **ZERO COMMENTS** inside the code blocks.
   - NO inline comments (// or #).
   - NO block comments (/* */).
   - NO docstrings.
   - The code must be strictly functional and clean.

2. **LANGUAGE ISOLATION**: 
   - If asked for "CSS", generate ONLY CSS. NO JS.
   - If asked for "Python", generate ONLY Python.
   - If asked for "React", generate React + CSS.

3. **PREVIEW GENERATION (MANDATORY)**:
   - If you generate code for a platform that cannot run directly in a browser (e.g., **Shopify Liquid**, PHP, Python/Django, WordPress), you **MUST** also generate a \`preview.html\` file.
   - The \`preview.html\` must contain a **static, visual representation** of what the code would look like rendered.
   - Use hardcoded placeholder data instead of server-side variables.
   - Include all necessary CSS/JS within this file or in separate .css/.js files to ensure it looks correct.

4. **EXPLANATION**: 
   - Provide a concise "Step-by-Step" guide OUTSIDE the code blocks.
   - This serves as the documentation.

***OUTPUT FORMAT***
[Step-by-Step Guide Here]

***FILE_START: filename.ext***
[Content - NO COMMENTS ALLOWED]
***FILE_END***
`;

const COMPILER_SYSTEM_INSTRUCTION = `
You are CodeForge Compiler, an expert code execution engine.

***MISSION***
Your goal is to accept user code or logic problems and output EXECUTABLE source code that produces clear console output (stdout).

***CRITICAL RULES***
1. **SINGLE FILE**: Prefer generating a single self-contained file (e.g., main.py, main.cpp, main.js, Main.java).
2. **CONSOLE OUTPUT**: The code MUST print results to the console/terminal. Do not create a GUI or Web Interface unless explicitly requested.
3. **NO COMMENTS**: Do not include comments in the code.
4. **CORRECTNESS**: Ensure the logic is sound and will run in a standard environment for that language.
5. **INPUT HANDLING**: If input is needed, hardcode test cases or use standard input methods compatible with simple simulations.

***OUTPUT FORMAT***
[Brief execution plan]

***FILE_START: filename.ext***
[Code]
***FILE_END***
`;

const EDIT_SYSTEM_INSTRUCTION = `
You are CodeForge, an expert code refactoring tool.
Your task is to taking EXISTING source code and apply specific user changes to it.

***CRITICAL RULES***
1. **RETURN ALL FILES**: You must return the COMPLETE content of ALL files, even if a file did not change. Do not output diffs. Do not say "rest of code remains same".
2. **APPLY CHANGES**: Strictly follow the user's "Edit Request" to modify the provided code.
3. **MAINTAIN STRUCTURE**: Keep the same filenames unless explicitly asked to rename.
4. **NO COMMENTS**: Do not add comments explaining the changes inside the code.

***OUTPUT FORMAT***
[Brief summary of changes made]

***FILE_START: filename.ext***
[Full Updated Content]
***FILE_END***
`;

const FIX_SYSTEM_INSTRUCTION = `
You are CodeForge, an expert code debugger and quality assurance engineer.
Your task is to analyze the provided code, identify bugs (syntax, logic, security, performance), and fix them.

***CRITICAL RULES***
1. **RETURN ALL FILES**: You must return the COMPLETE content of ALL files, even if a file did not change.
2. **FIX ONLY**: Do not refactor purely for style unless it fixes a standard violation. Focus on correctness and robustness.
3. **NO COMMENTS**: Do not add comments explaining the fix inside the code.
4. **SUMMARY**: Provide a brief summary of what was fixed at the start (e.g. "Fixed undefined variable in App.tsx").

***OUTPUT FORMAT***
[Brief summary of fixes]

***FILE_START: filename.ext***
[Full Corrected Content]
***FILE_END***
`;

const PARTIAL_EDIT_SYSTEM_INSTRUCTION = `
You are CodeForge, a precise code editor.
Your task is to rewrite ONLY a specific selected snippet of code based on a user instruction.

***INPUT CONTEXT***
1. **FULL FILE**: The complete file content for context.
2. **SELECTED SNIPPET**: The exact part of the code the user wants to change.
3. **INSTRUCTION**: What the user wants to do with the selection.

***CRITICAL RULES***
1. **RETURN ONLY REPLACEMENT**: You must return ONLY the new code that should replace the "SELECTED SNIPPET".
2. **NO MARKDOWN**: Do not use markdown code blocks (no \`\`\`). Just raw text.
3. **NO EXPLANATION**: Do not add any text before or after the code.
4. **INDENTATION**: Try to respect the indentation of the selected snippet if possible.
5. **VALIDITY**: The replacement must be syntactically valid in the context of the surrounding code.

***OUTPUT FORMAT***
[Just the new code string]
`;

const GRAMMAR_SYSTEM_INSTRUCTION = `
You are a high-speed text refinement engine.
Your goal is to rewrite the user's input into clear, concise, and professional English.

***RULES***
1. **ENGLISH ONLY**: If the input is in any other language, TRANSLATE it to English immediately.
2. **CORRECT**: Fix all grammar, spelling, punctuation, and awkward phrasing.
3. **PRESERVE MEANING**: Do not change the intent or technical details (like library names), just the language structure.
4. **NO ANSWERING**: Do not answer the prompt. Do not execute the prompt. ONLY rewrite it.
5. **NO CHAT**: Output strictly the rewritten text. No conversational filler.
`;

export const generateCode = async (
  prompt: string,
  imageFile: File | null,
  mode: AppMode,
  apiKey: string
): Promise<{ text: string; files: GeneratedFile[]; groundingUrls: string[] }> => {
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Use gemini-2.5-flash for speed and reliability in editor mode
  let modelName = 'gemini-2.5-flash'; 
  
  let tools: Tool[] | undefined = undefined;
  let thinkingConfig: { thinkingBudget: number } | undefined = undefined;
  let activeSystemInstruction = SYSTEM_INSTRUCTION;

  switch (mode) {
    case AppMode.FAST:
      modelName = 'gemini-2.5-flash';
      break;
    case AppMode.THINKING:
      modelName = 'gemini-2.5-flash';
      thinkingConfig = { thinkingBudget: 8192 };
      break;
    case AppMode.RESEARCH:
      modelName = 'gemini-2.5-flash';
      tools = [{ googleSearch: {} }];
      break;
    case AppMode.VISION:
      modelName = 'gemini-2.5-flash';
      break;
    case AppMode.COMPILER:
      modelName = 'gemini-2.5-flash';
      activeSystemInstruction = COMPILER_SYSTEM_INSTRUCTION;
      break;
  }

  if (imageFile) {
    modelName = 'gemini-2.5-flash';
  }

  const parts: any[] = [];
  
  if (imageFile) {
    const base64Data = await fileToGenerativePart(imageFile);
    parts.push({
      inlineData: {
        mimeType: imageFile.type,
        data: base64Data
      }
    });
  }

  parts.push({ text: prompt });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        systemInstruction: activeSystemInstruction,
        tools: tools,
        thinkingConfig: thinkingConfig,
      }
    });

    const fullText = response.text || "No response generated.";
    const files = parseGeneratedContent(fullText);
    
    // Extract grounding metadata
    let groundingUrls: string[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri) {
          groundingUrls.push(chunk.web.uri);
        }
      });
    }

    return {
      text: fullText,
      files,
      groundingUrls
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const editCode = async (
  originalFiles: GeneratedFile[],
  userPrompt: string,
  apiKey: string,
  imageFile: File | null = null
): Promise<{ text: string; files: GeneratedFile[] }> => {
  if (!apiKey) throw new Error("API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });
  
  // Construct the context from existing files
  let fileContext = "";
  originalFiles.forEach(file => {
    fileContext += `\n***FILE_START: ${file.name}***\n${file.content}\n***FILE_END***\n`;
  });

  const fullPrompt = `
    EXISTING CODE:
    ${fileContext}

    USER EDIT REQUEST:
    ${userPrompt}
  `;

  const parts: any[] = [];

  if (imageFile) {
    const base64Data = await fileToGenerativePart(imageFile);
    parts.push({
      inlineData: {
        mimeType: imageFile.type,
        data: base64Data
      }
    });
  }

  parts.push({ text: fullPrompt });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Use flash for fast edits
      contents: { parts },
      config: {
        systemInstruction: EDIT_SYSTEM_INSTRUCTION,
      }
    });

    const fullText = response.text || "No changes generated.";
    const files = parseGeneratedContent(fullText);

    return {
      text: fullText,
      files
    };

  } catch (error) {
    console.error("Gemini API Edit Error:", error);
    throw error;
  }
};

export const fixCode = async (
  originalFiles: GeneratedFile[],
  apiKey: string
): Promise<{ text: string; files: GeneratedFile[] }> => {
  if (!apiKey) throw new Error("API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });
  
  let fileContext = "";
  originalFiles.forEach(file => {
    fileContext += `\n***FILE_START: ${file.name}***\n${file.content}\n***FILE_END***\n`;
  });

  const fullPrompt = `
    EXISTING CODE:
    ${fileContext}

    INSTRUCTION:
    Analyze the above code for bugs, errors, and potential improvements. Fix them and return the full corrected code for all files.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: fullPrompt }] },
      config: {
        systemInstruction: FIX_SYSTEM_INSTRUCTION,
      }
    });

    const fullText = response.text || "No fixes generated.";
    const files = parseGeneratedContent(fullText);

    return {
      text: fullText,
      files
    };
  } catch (error) {
     console.error("Gemini API Fix Error:", error);
     throw error;
  }
};

export const editPartialCode = async (
  fileContent: string,
  selectedText: string,
  instruction: string,
  apiKey: string,
  imageFile: File | null = null
): Promise<string> => {
    if (!apiKey) throw new Error("API Key is missing.");

    const ai = new GoogleGenAI({ apiKey });

    const fullPrompt = `
      FULL FILE CONTENT:
      ${fileContent}

      SELECTED SNIPPET TO CHANGE:
      ${selectedText}

      USER INSTRUCTION:
      ${instruction}
    `;

    const parts: any[] = [];
    if (imageFile) {
        const base64Data = await fileToGenerativePart(imageFile);
        parts.push({
            inlineData: {
                mimeType: imageFile.type,
                data: base64Data
            }
        });
    }
    parts.push({ text: fullPrompt });

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
        config: {
          systemInstruction: PARTIAL_EDIT_SYSTEM_INSTRUCTION,
        }
      });

      return response.text?.trim() || selectedText;
    } catch (error) {
      console.error("Gemini API Partial Edit Error:", error);
      throw error;
    }
};

export const fixPromptGrammar = async (
  prompt: string,
  apiKey: string
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is missing.");
  
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
      config: {
        systemInstruction: GRAMMAR_SYSTEM_INSTRUCTION,
      }
    });

    return response.text?.trim() || prompt;
  } catch (error) {
    console.error("Gemini API Grammar Error:", error);
    return prompt;
  }
};