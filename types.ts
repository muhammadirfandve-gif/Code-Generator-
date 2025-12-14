export interface GeneratedFile {
  name: string;
  language: string;
  content: string;
}

export enum AppMode {
  FAST = 'FAST',         // gemini-2.5-flash
  THINKING = 'THINKING', // gemini-2.5-flash with thinking config
  RESEARCH = 'RESEARCH', // gemini-2.5-flash with search
  VISION = 'VISION',      // gemini-2.5-flash (multimodal)
  COMPILER = 'COMPILER'  // gemini-2.5-flash (code execution focus)
}

export interface GenerationState {
  isGenerating: boolean;
  statusMessage: string;
  error: string | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  image?: string; // base64
  files?: GeneratedFile[];
  groundingUrls?: string[];
}