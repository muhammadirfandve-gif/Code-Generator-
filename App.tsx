import React, { useState, useEffect } from 'react';
import { generateCode, editCode, editPartialCode, fixCode, fixPromptGrammar } from './services/geminiService';
import { AppMode, GeneratedFile, GenerationState } from './types';
import { SettingsBar } from './components/SettingsBar';
import { InputArea } from './components/InputArea';
import { FileViewer } from './components/FileViewer';
import { cleanResponseText } from './utils/parser';
import { Code, Bot, AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.FAST);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [explanation, setExplanation] = useState<string>('');
  const [groundingUrls, setGroundingUrls] = useState<string[]>([]);
  
  // History State
  const [history, setHistory] = useState<GeneratedFile[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const [genState, setGenState] = useState<GenerationState>({
    isGenerating: false,
    statusMessage: '',
    error: null
  });

  const apiKey = process.env.API_KEY || '';

  // Helper to push new state to history
  const pushToHistory = (newFiles: GeneratedFile[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newFiles);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setGeneratedFiles(newFiles);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setGeneratedFiles(history[newIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setGeneratedFiles(history[newIndex]);
    }
  };

  const handlePromptFix = async (currentPrompt: string): Promise<string> => {
     if (!apiKey || !currentPrompt.trim()) return currentPrompt;
     try {
       return await fixPromptGrammar(currentPrompt, apiKey);
     } catch (e) {
       console.error("Failed to fix prompt grammar", e);
       return currentPrompt;
     }
  };

  const handleGenerate = async (prompt: string, image: File | null) => {
    if (!apiKey) {
      setGenState({ isGenerating: false, statusMessage: '', error: 'API Key not found in environment.' });
      return;
    }

    setGenState({ isGenerating: true, statusMessage: 'Initializing AI...', error: null });
    setGeneratedFiles([]);
    setExplanation('');
    setGroundingUrls([]);

    try {
      // UX Status Updates
      if (mode === AppMode.THINKING && !image) {
        setGenState({ isGenerating: true, statusMessage: 'Thinking deeply about architecture...', error: null });
      } else if (mode === AppMode.RESEARCH && !image) {
        setGenState({ isGenerating: true, statusMessage: 'Searching documentation...', error: null });
      } else if (image) {
        setGenState({ isGenerating: true, statusMessage: 'Analyzing visual input...', error: null });
      } else {
        setGenState({ isGenerating: true, statusMessage: 'Generating code...', error: null });
      }

      const result = await generateCode(prompt, image, mode, apiKey);
      
      setGeneratedFiles(result.files);
      setExplanation(cleanResponseText(result.text));
      setGroundingUrls(result.groundingUrls);
      
      // Initialize History with the fresh generation
      setHistory([result.files]);
      setHistoryIndex(0);

      setGenState({ isGenerating: false, statusMessage: '', error: null });

    } catch (err: any) {
      setGenState({ 
        isGenerating: false, 
        statusMessage: '', 
        error: err.message || 'An unexpected error occurred.' 
      });
    }
  };

  const handleAiEdit = async (editPrompt: string, image: File | null) => {
     if (!apiKey) {
      setGenState({ isGenerating: false, statusMessage: '', error: 'API Key not found.' });
      return;
    }

    setGenState({ isGenerating: true, statusMessage: 'Refactoring code...', error: null });

    try {
      const result = await editCode(generatedFiles, editPrompt, apiKey, image);
      
      // Update files via history
      pushToHistory(result.files);
      
      // Optionally prepend the edit summary to the explanation
      const editSummary = cleanResponseText(result.text);
      if (editSummary) {
        setExplanation(prev => `**Update:** ${editSummary}\n\n---\n\n${prev}`);
      }

      setGenState({ isGenerating: false, statusMessage: '', error: null });

    } catch (err: any) {
      setGenState({ 
        isGenerating: false, 
        statusMessage: '', 
        error: err.message || 'Failed to edit code.' 
      });
    }
  };

  const handleAiFix = async () => {
    if (!apiKey) {
      setGenState({ isGenerating: false, statusMessage: '', error: 'API Key not found.' });
      return;
    }

    setGenState({ isGenerating: true, statusMessage: 'Debugging & Fixing...', error: null });

    try {
      const result = await fixCode(generatedFiles, apiKey);
      
      // Update files via history
      pushToHistory(result.files);

      // Optionally prepend the fix summary to the explanation
      const fixSummary = cleanResponseText(result.text);
      if (fixSummary) {
        setExplanation(prev => `**Auto-Fix Report:** ${fixSummary}\n\n---\n\n${prev}`);
      }

      setGenState({ isGenerating: false, statusMessage: '', error: null });
    } catch (err: any) {
      setGenState({
        isGenerating: false,
        statusMessage: '',
        error: err.message || 'Failed to fix code.'
      });
    }
  };

  const handleAiPartialEdit = async (
    fileIndex: number, 
    selectedText: string, 
    replacementPrompt: string, 
    startIndex: number, 
    endIndex: number,
    image: File | null
  ) => {
    if (!apiKey) {
      setGenState({ isGenerating: false, statusMessage: '', error: 'API Key not found.' });
      return;
    }

    setGenState({ isGenerating: true, statusMessage: 'Editing selection...', error: null });

    try {
      const activeFile = generatedFiles[fileIndex];
      const replacementCode = await editPartialCode(activeFile.content, selectedText, replacementPrompt, apiKey, image);

      // Construct new content by splicing string
      const before = activeFile.content.substring(0, startIndex);
      const after = activeFile.content.substring(endIndex);
      const newContent = before + replacementCode + after;

      // Update state via history
      const newFiles = [...generatedFiles];
      newFiles[fileIndex] = { ...activeFile, content: newContent };
      pushToHistory(newFiles);

      setGenState({ isGenerating: false, statusMessage: '', error: null });

    } catch (err: any) {
       setGenState({ 
        isGenerating: false, 
        statusMessage: '', 
        error: err.message || 'Failed to edit selection.' 
      });
    }
  };

  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode);
  };

  const handleImageChange = (hasImage: boolean) => {
    if (hasImage) {
      setMode(AppMode.VISION);
    } else {
      setMode(AppMode.FAST); // Default back to fast when image removed
    }
  };

  const handleUpdateFiles = (newFiles: GeneratedFile[]) => {
    pushToHistory(newFiles);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="w-full px-[10px] h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500 p-2 rounded-lg shadow-lg shadow-brand-500/20">
              <Code className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                CodeForge AI
              </h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Production Ready Generator</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-sm text-slate-400">
            <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 rounded-full border border-slate-700">
              <Bot size={14} className={mode === AppMode.THINKING ? 'text-purple-400' : 'text-slate-400'} />
              Current Model: <span className="text-slate-200 font-medium">{mode}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full p-[10px] grid lg:grid-cols-12 gap-4">
        
        {/* Left Column: Controls & Input (25%) */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="bg-slate-900/50 p-1 rounded-2xl border border-slate-800">
             <SettingsBar mode={mode} setMode={handleModeChange} hasImage={mode === AppMode.VISION} />
             <div className="px-4 pb-4">
               <InputArea 
                  onGenerate={handleGenerate} 
                  onPromptFix={handlePromptFix}
                  isGenerating={genState.isGenerating} 
                  onImageChange={handleImageChange}
                />
             </div>
          </div>

          {/* Error Banner */}
          {genState.error && (
            <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-xl flex items-start gap-3 text-red-200 animate-fade-in">
              <AlertCircle className="shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-sm">Generation Failed</h3>
                <p className="text-xs opacity-80 mt-1">{genState.error}</p>
              </div>
            </div>
          )}

          {/* Status Indicator */}
          {genState.isGenerating && (
            <div className="flex items-center justify-center gap-3 py-6 text-slate-400 animate-pulse">
               <Bot size={24} />
               <p className="text-sm font-medium">{genState.statusMessage}</p>
            </div>
          )}
          
        </div>

        {/* Right Column: Output (75%) */}
        <div className="lg:col-span-9 flex flex-col h-[calc(100vh-90px)]">
          {generatedFiles.length > 0 ? (
            <FileViewer 
              files={generatedFiles} 
              explanation={explanation} 
              groundingUrls={groundingUrls} 
              onUpdateFiles={handleUpdateFiles}
              onAiEdit={handleAiEdit}
              onAiFix={handleAiFix}
              onAiPartialEdit={handleAiPartialEdit}
              onPromptFix={handlePromptFix}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < history.length - 1}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 bg-slate-900/30 rounded-3xl border-2 border-dashed border-slate-800 p-8 h-full">
              <div className="w-24 h-24 rounded-full bg-slate-800/50 flex items-center justify-center mb-6">
                <Code size={40} className="opacity-50" />
              </div>
              <h2 className="text-xl font-bold text-slate-500 mb-2">Ready to Forge</h2>
              <p className="text-center max-w-md text-slate-600">
                Select a mode, describe your project, or upload a design to generate complete, production-ready source code.
              </p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
};

export default App;