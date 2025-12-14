import { GeneratedFile } from '../types';

/**
 * Parses the raw text output from the LLM into structured files.
 * Expects format:
 * ***FILE_START: filename.ext***
 * content
 * ***FILE_END***
 * 
 * Or fallback to finding code blocks.
 */
export const parseGeneratedContent = (text: string): GeneratedFile[] => {
  const files: GeneratedFile[] = [];
  
  // Specific delimiter pattern
  const delimiterRegex = /\*\*\*FILE_START:\s*(.*?)\s*\*\*\*([\s\S]*?)\*\*\*FILE_END\*\*\*/g;
  let match;
  
  while ((match = delimiterRegex.exec(text)) !== null) {
    const filename = match[1].trim();
    let content = match[2].trim();
    
    // Determine language from extension
    const ext = filename.split('.').pop()?.toLowerCase() || 'text';
    
    // Remove markdown code fences if they were included inside the block
    content = content.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');

    files.push({
      name: filename,
      language: ext,
      content: content
    });
  }

  // Fallback: If no delimiters found, look for standard markdown code blocks with filenames mentioned before them
  if (files.length === 0) {
    // Basic heuristics for markdown blocks
    const codeBlockRegex = /(`{3,})([a-zA-Z0-9_-]*)\n([\s\S]*?)\1/g;
    let cbMatch;
    let fileCounter = 1;
    
    while ((cbMatch = codeBlockRegex.exec(text)) !== null) {
      const lang = cbMatch[2] || 'text';
      const content = cbMatch[3].trim();
      
      // Try to find a filename in the preceding lines
      const precedingText = text.substring(0, cbMatch.index).trim().split('\n');
      const lastLine = precedingText[precedingText.length - 1];
      
      let filename = `file_${fileCounter}.${lang === 'typescript' || lang === 'ts' ? 'ts' : lang === 'javascript' || lang === 'js' ? 'js' : 'txt'}`;
      
      // Look for patterns like "File: app.ts" or "filename.ts:"
      const nameMatch = lastLine?.match(/(?:file|filename):\s*([a-zA-Z0-9_./-]+)/i) || lastLine?.match(/^([a-zA-Z0-9_./-]+):$/);
      if (nameMatch) {
        filename = nameMatch[1];
      }

      files.push({
        name: filename,
        language: lang,
        content
      });
      fileCounter++;
    }
  }

  return files;
};

export const cleanResponseText = (text: string): string => {
  // Remove the file blocks from the text to show only the explanation
  return text.replace(/\*\*\*FILE_START[\s\S]*?\*\*\*FILE_END\*\*\*/g, '').trim();
};