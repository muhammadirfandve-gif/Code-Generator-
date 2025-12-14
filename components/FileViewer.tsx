import React, { useState, useEffect, useRef } from 'react';
import { GeneratedFile } from '../types';
import { Copy, Check, FileCode, Terminal, BookOpen, X, Play, Eraser, ChevronDown, ChevronUp, Layout, Maximize2, Monitor, Pencil, Save, Sparkles, Send, ScanText, Undo, Redo, Wrench, Languages, Globe, Code2, Eye, Download, Image as ImageIcon } from 'lucide-react';
import { assemblePreview } from '../utils/compiler';
import JSZip from 'jszip';

interface FileViewerProps {
  files: GeneratedFile[];
  explanation: string;
  groundingUrls: string[];
  onUpdateFiles: (files: GeneratedFile[]) => void;
  onAiEdit: (prompt: string, image: File | null) => void;
  onAiFix: () => void;
  onAiPartialEdit: (fileIndex: number, selectedText: string, prompt: string, start: number, end: number, image: File | null) => void;
  onPromptFix: (prompt: string) => Promise<string>;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface ConsoleLog {
  type: 'log' | 'error' | 'warn' | 'info';
  message: string;
  timestamp: string;
}

type MainViewMode = 'code' | 'preview';

interface SelectionState {
  text: string;
  start: number;
  end: number;
  top: number;
  left: number;
}

export const FileViewer: React.FC<FileViewerProps> = ({ 
  files, 
  explanation, 
  groundingUrls, 
  onUpdateFiles, 
  onAiEdit, 
  onAiFix,
  onAiPartialEdit,
  onPromptFix,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}) => {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  
  // Main Toggle State
  const [mainView, setMainView] = useState<MainViewMode>('preview');
  
  // Manual Edit State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editContent, setEditContent] = useState('');

  // AI Edit State
  const [showAiEditModal, setShowAiEditModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiEditImage, setAiEditImage] = useState<File | null>(null);
  const [isFixingAiPrompt, setIsFixingAiPrompt] = useState(false);

  // Inline/Partial Edit State
  const [inlineEditMode, setInlineEditMode] = useState(false);
  const [selectionData, setSelectionData] = useState<SelectionState | null>(null);
  const [partialPrompt, setPartialPrompt] = useState('');
  const [partialEditImage, setPartialEditImage] = useState<File | null>(null);
  const [isFixingPartialPrompt, setIsFixingPartialPrompt] = useState(false);
  const codeContainerRef = useRef<HTMLDivElement>(null);
  
  const [previewHtml, setPreviewHtml] = useState('');
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Initialize preview on new files
  useEffect(() => {
    setActiveFileIndex(0);
    setShowExplanation(false);
    setInlineEditMode(false);
    setSelectionData(null);
    setLogs([]);
    
    // Auto-assemble preview
    if (files && files.length > 0) {
      const html = assemblePreview(files);
      setPreviewHtml(html);
      
      // Determine default view
      const isWebProject = files.some(f => 
        f.name.endsWith('.html') || 
        f.name.match(/\.(js|jsx|ts|tsx|css|liquid)$/)
      );
      
      const isNativeProject = files.some(f => 
        f.name.match(/\.(cpp|c|py|java|rs|go|php)$/i)
      );

      // Default to preview/console if it's web OR if it's a native script (console output)
      if (isWebProject || isNativeProject) {
        setMainView('preview');
      } else {
        setMainView('code');
      }
    }
  }, [files]);

  useEffect(() => {
    if (logsEndRef.current && mainView === 'preview') {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, mainView]);

  // Handle Paste for Modals
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // If AI Edit Modal is Open
      if (showAiEditModal) {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
           if (items[i].type.indexOf('image') !== -1) {
             const file = items[i].getAsFile();
             if (file) {
               e.preventDefault();
               e.stopPropagation();
               setAiEditImage(file);
             }
           }
        }
      }
      // If Inline Edit Popover is Open
      else if (selectionData) {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
           if (items[i].type.indexOf('image') !== -1) {
             const file = items[i].getAsFile();
             if (file) {
               e.preventDefault();
               e.stopPropagation();
               setPartialEditImage(file);
             }
           }
        }
      }
    };

    if (showAiEditModal || selectionData) {
      window.addEventListener('paste', handlePaste);
    }
    return () => window.removeEventListener('paste', handlePaste);
  }, [showAiEditModal, selectionData]);

  // Listen for logs from the preview iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.source === 'PREVIEW_CONSOLE') {
        const { type, message } = event.data;
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, { type, message, timestamp }]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const handleMouseUp = () => {
      if (!inlineEditMode) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        return;
      }

      // Check if selection is within our code container
      if (codeContainerRef.current && codeContainerRef.current.contains(selection.anchorNode)) {
        const text = selection.toString();
        if (!text.trim()) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const containerRect = codeContainerRef.current.getBoundingClientRect();

        const start = selection.anchorOffset < selection.focusOffset ? selection.anchorOffset : selection.focusOffset;
        const end = selection.anchorOffset < selection.focusOffset ? selection.focusOffset : selection.anchorOffset;

        setSelectionData({
          text,
          start,
          end,
          top: rect.bottom - containerRect.top,
          left: rect.left - containerRect.left
        });
        
        // Reset prompt and image
        setPartialPrompt('');
        setPartialEditImage(null);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [inlineEditMode]);

  if (!files || files.length === 0) {
    if (explanation) {
      return (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 animate-fade-in">
           <div className="prose prose-invert max-w-none whitespace-pre-wrap font-sans text-slate-300 leading-relaxed">
            {explanation}
          </div>
        </div>
      )
    }
    return null;
  }

  const activeFile = files[activeFileIndex];

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRun = () => {
    setLogs([]); 
    const html = assemblePreview(files);
    setPreviewHtml(html);
    setMainView('preview');
  };

  const handleDownload = async () => {
    const zip = new JSZip();
    files.forEach(file => {
      zip.file(file.name, file.content);
    });
    const blob = await zip.generateAsync({type: "blob"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "codeforge_project.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Manual Edit Handlers
  const handleOpenEdit = () => {
    setEditContent(activeFile.content);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    const newFiles = [...files];
    newFiles[activeFileIndex] = {
      ...activeFile,
      content: editContent
    };
    onUpdateFiles(newFiles);
    setShowEditModal(false);
  };

  // AI Edit Handlers
  const handleFixAiPrompt = async () => {
    if (!aiPrompt.trim() || isFixingAiPrompt) return;
    setIsFixingAiPrompt(true);
    try {
      const fixed = await onPromptFix(aiPrompt);
      setAiPrompt(fixed);
    } finally {
      setIsFixingAiPrompt(false);
    }
  };

  const handleSubmitAiEdit = () => {
    if (!aiPrompt.trim() && !aiEditImage) return;
    onAiEdit(aiPrompt, aiEditImage);
    setAiPrompt('');
    setAiEditImage(null);
    setShowAiEditModal(false);
  };

  // Inline Edit Handlers
  const handleFixPartialPrompt = async () => {
    if (!partialPrompt.trim() || isFixingPartialPrompt) return;
    setIsFixingPartialPrompt(true);
    try {
      const fixed = await onPromptFix(partialPrompt);
      setPartialPrompt(fixed);
    } finally {
      setIsFixingPartialPrompt(false);
    }
  };

  const handleSubmitPartialEdit = () => {
    if (!selectionData || (!partialPrompt.trim() && !partialEditImage)) return;
    onAiPartialEdit(activeFileIndex, selectionData.text, partialPrompt, selectionData.start, selectionData.end, partialEditImage);
    setSelectionData(null);
    setPartialPrompt('');
    setPartialEditImage(null);
    window.getSelection()?.removeAllRanges();
  };

  const cleanExplanation = explanation.replace(/\*\*\*FILE_START[\s\S]*?\*\*\*FILE_END\*\*\*/g, '').trim();

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-2xl relative">
      
      {/* Header Toolbar */}
      <div className="flex items-center justify-between bg-slate-950 border-b border-slate-800 px-4 py-3 shrink-0 gap-4">
        
        {/* Main View Toggle */}
        <div className="flex p-1 bg-slate-900 rounded-lg border border-slate-800 shrink-0">
          <button
            onClick={() => setMainView('code')}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all
              ${mainView === 'code' 
                ? 'bg-slate-800 text-brand-400 shadow-sm' 
                : 'text-slate-500 hover:text-slate-300'}
            `}
          >
            <Code2 size={14} />
            Code View
          </button>
          <button
            onClick={() => setMainView('preview')}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all
              ${mainView === 'preview' 
                ? 'bg-slate-800 text-brand-400 shadow-sm' 
                : 'text-slate-500 hover:text-slate-300'}
            `}
          >
            <Terminal size={14} /> {/* Changed Icon to Terminal for better compiler feel */}
            {files.some(f => f.name.match(/\.(cpp|c|py|java|rs|go|php)$/i)) ? 'Console Output' : 'Live Preview'}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {/* Inline Edit */}
            {mainView === 'code' && (
              <>
                <button
                  onClick={() => {
                    setInlineEditMode(!inlineEditMode);
                    setSelectionData(null);
                  }}
                  className={`
                    p-2 rounded-lg transition-all duration-300 border
                    ${inlineEditMode 
                      ? 'bg-blue-900/40 text-blue-300 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' 
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white'}
                  `}
                  title={inlineEditMode ? "Disable Inline Edit" : "Enable Inline Edit"}
                >
                  <ScanText size={18} />
                </button>
                <div className="h-5 w-px bg-slate-800 mx-1" />
              </>
            )}

            {/* Undo/Redo */}
            <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 p-0.5 shrink-0">
               <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className={`p-1.5 rounded-md transition-colors ${canUndo ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-slate-700 cursor-not-allowed'}`}
                  title="Undo"
               >
                 <Undo size={18} />
               </button>
               <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  className={`p-1.5 rounded-md transition-colors ${canRedo ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-slate-700 cursor-not-allowed'}`}
                  title="Redo"
               >
                 <Redo size={18} />
               </button>
            </div>

            <div className="h-5 w-px bg-slate-800 mx-1" />

            {/* AI Fix - New Button */}
            <button
              onClick={onAiFix}
              className="p-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white hover:border-amber-500 hover:shadow-[0_0_15px_rgba(245,158,11,0.4)] transition-all duration-300"
              title="Auto-Fix & Debug"
            >
              <Wrench size={18} />
            </button>

            {/* AI Edit */}
            <button
              onClick={() => setShowAiEditModal(true)}
              className="p-2 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500 hover:text-white hover:border-purple-500 hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all duration-300"
              title="AI Edit (Ctrl+V supported)"
            >
              <Sparkles size={18} />
            </button>

            {mainView === 'code' && (
              <button
                onClick={handleOpenEdit}
                className="p-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-all duration-300"
                title="Manual Edit"
              >
                <Pencil size={18} />
              </button>
            )}

            {mainView === 'preview' && (
               <button 
                 onClick={() => setLogs([])}
                 className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors px-3 py-2 bg-slate-800 rounded-lg border border-slate-700"
                 title="Clear Console Logs"
               >
                 <Eraser size={14} />
                 <span className="hidden sm:inline">Clear Log</span>
               </button>
            )}

            {/* Compile/Run (Visible in both, forces preview refresh) */}
            <button
              onClick={handleRun}
              className="p-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all duration-300"
              title="Run Code"
            >
              <Play size={18} className="fill-current" />
            </button>
            
            {/* Download Button */}
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white hover:border-blue-500 hover:shadow-[0_0_15px_rgba(59,130,246,0.4)] transition-all duration-300"
              title="Download All Files (ZIP)"
            >
              <Download size={18} />
            </button>

            <div className="h-5 w-px bg-slate-800 mx-1" />

            {/* Guide */}
            <button
              onClick={() => setShowExplanation(!showExplanation)}
              className={`
                p-2 rounded-lg border transition-all
                ${showExplanation 
                  ? 'bg-sky-900/40 text-sky-400 border-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.2)]' 
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white'}
              `}
              title={showExplanation ? "Hide Guide" : "Show Guide"}
            >
              <BookOpen size={18} />
            </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Explanation Sidebar */}
        {showExplanation && (
          <div className="w-80 sm:w-96 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 animate-slide-in-left z-20 absolute inset-y-0 left-0 shadow-2xl lg:static lg:shadow-none">
             <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
               <span className="text-xs font-bold text-brand-400 uppercase tracking-wider">Step-by-Step Guide</span>
               <button onClick={() => setShowExplanation(false)} className="lg:hidden text-slate-500 hover:text-white">
                 <X size={14} />
               </button>
             </div>
             <div className="overflow-y-auto p-4 custom-scrollbar flex-1">
                {groundingUrls.length > 0 && (
                  <div className="mb-4 p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Sources</p>
                    <ul className="space-y-1">
                      {groundingUrls.map((url, i) => (
                        <li key={i}>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-400 hover:underline truncate block">
                            {new URL(url).hostname}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="prose prose-invert prose-sm text-slate-300 font-sans leading-relaxed">
                  {cleanExplanation || "No explanation provided."}
                </div>
             </div>
          </div>
        )}

        {/* CODE VIEW MODE */}
        {mainView === 'code' && (
          <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117]">
            {/* File Tabs */}
            <div className="flex bg-slate-950 overflow-x-auto border-b border-slate-800 scrollbar-hide shrink-0">
              {files.map((file, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveFileIndex(idx)}
                  className={`
                    flex items-center gap-2 px-4 py-3 text-xs font-medium border-r border-slate-800 min-w-[100px] transition-colors
                    ${idx === activeFileIndex 
                      ? 'bg-[#0d1117] text-brand-400 border-t-2 border-t-brand-500' 
                      : 'bg-slate-950 text-slate-500 hover:text-slate-300 hover:bg-slate-900'}
                  `}
                >
                  <FileCode size={14} />
                  <span className="truncate max-w-[140px]">{file.name}</span>
                </button>
              ))}
            </div>

            <div className="relative flex-1 overflow-hidden group">
              <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs font-medium border border-slate-700 transition-all shadow-lg"
                >
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              
              {/* Inline Edit Popover */}
              {selectionData && (
                <div 
                  className="absolute z-20 w-80 bg-slate-900 border border-blue-500/50 rounded-xl shadow-2xl animate-fade-in flex flex-col overflow-hidden modal-content"
                  style={{ top: Math.min(selectionData.top + 10, 400), left: Math.min(selectionData.left, 500) }} // Simple boundary check hack
                >
                  <div className="bg-slate-950 px-3 py-2 border-b border-slate-800 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-blue-400 uppercase flex items-center gap-1">
                      <Sparkles size={10} /> Edit Selection
                    </span>
                    <div className="flex items-center gap-1">
                       <button
                        onClick={handleFixPartialPrompt}
                        disabled={!partialPrompt.trim() || isFixingPartialPrompt}
                        className={`p-1 rounded hover:bg-slate-800 transition-colors ${isFixingPartialPrompt ? 'text-indigo-400 animate-pulse' : 'text-slate-500 hover:text-indigo-400'}`}
                        title="Fast English Fix & Translate"
                       >
                         <Languages size={12} />
                       </button>
                      <button onClick={() => { setSelectionData(null); window.getSelection()?.removeAllRanges(); }} className="text-slate-500 hover:text-white p-1">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="p-2">
                    <textarea
                      value={partialPrompt}
                      onChange={(e) => setPartialPrompt(e.target.value)}
                      placeholder="Describe change or paste image (Ctrl+V)..."
                      className="w-full h-20 bg-slate-800 rounded-lg p-2 text-xs text-white resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 mb-2 placeholder-slate-500"
                      autoFocus
                    />
                    
                    {partialEditImage && (
                      <div className="flex items-center gap-2 p-1.5 bg-slate-950 rounded mb-2 border border-slate-800">
                        <div className="w-8 h-8 rounded bg-slate-800 overflow-hidden shrink-0">
                           <img src={URL.createObjectURL(partialEditImage)} className="w-full h-full object-cover" />
                        </div>
                        <span className="text-[10px] text-slate-400 truncate flex-1">{partialEditImage.name}</span>
                        <button onClick={() => setPartialEditImage(null)} className="text-slate-500 hover:text-red-400"><X size={12} /></button>
                      </div>
                    )}

                    <button
                      onClick={handleSubmitPartialEdit}
                      className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-colors"
                    >
                      Apply Change
                    </button>
                  </div>
                </div>
              )}

              <div 
                ref={codeContainerRef}
                className={`h-full overflow-auto p-4 custom-scrollbar ${inlineEditMode ? 'cursor-text select-text' : ''}`}
              >
                <pre className="font-mono text-sm leading-6 tab-4">
                  <code className="block text-slate-200">
                    {activeFile.content}
                  </code>
                </pre>
              </div>
            </div>
            
            <div className="bg-slate-950 border-t border-slate-800 px-4 py-1.5 flex justify-between items-center text-[10px] text-slate-500 shrink-0 font-mono">
              <span>{activeFile.language.toUpperCase()}</span>
              <span>{activeFile.content.split('\n').length} LINES</span>
            </div>
          </div>
        )}

        {/* PREVIEW VIEW MODE */}
        {mainView === 'preview' && (
          <div className="flex-1 flex flex-col min-h-0 relative bg-[#0f172a]">
             {/* Iframe */}
             <iframe 
              srcDoc={previewHtml}
              className="w-full h-full bg-white border-none"
              title="Preview"
              sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
            />
            
            {/* Terminal Area (Overlay or Bottom) - Bottom for now */}
            <div className="h-48 flex flex-col bg-[#0a0f18] border-t border-slate-800">
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-950 border-b border-slate-800 text-xs font-medium text-slate-500">
                <Terminal size={12} />
                <span>Console Output</span>
              </div>
              <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-2 custom-scrollbar">
                {logs.length === 0 && (
                  <div className="text-slate-600 italic opacity-50 select-none">Waiting for output...</div>
                )}
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-3 group animate-fade-in">
                    <span className="text-slate-700 shrink-0 select-none">{log.timestamp}</span>
                    <div className={`break-words whitespace-pre-wrap ${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'warn' ? 'text-yellow-400' :
                      'text-emerald-400'
                    }`}>
                       {log.type === 'error' && <span className="font-bold mr-1">Error:</span>}
                       {log.type === 'warn' && <span className="font-bold mr-1">Warning:</span>}
                       {log.message}
                    </div>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Edit Modal */}
      {showEditModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in modal-active">
          <div className="bg-slate-900 w-full max-w-4xl h-[80vh] rounded-xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden modal-content">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
              <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Pencil size={14} className="text-brand-400" />
                Editing: {activeFile.name}
              </span>
              <button onClick={() => setShowEditModal(false)} className="text-slate-500 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 relative">
               <textarea 
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full bg-[#0d1117] text-slate-200 font-mono text-sm p-4 focus:outline-none resize-none tab-4 custom-scrollbar"
                  spellCheck={false}
               />
            </div>
            <div className="flex justify-end gap-3 px-4 py-3 bg-slate-950 border-t border-slate-800">
              <button 
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveEdit}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-brand-600 hover:bg-brand-500 text-white transition-colors shadow-lg shadow-brand-500/20"
              >
                <Save size={16} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Edit Modal */}
      {showAiEditModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in modal-active">
           <div className="bg-slate-900 w-full max-w-lg rounded-xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden ring-1 ring-purple-500/30 modal-content">
              <div className="flex items-center justify-between px-5 py-4 bg-slate-950 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="bg-purple-900/30 p-1.5 rounded-lg">
                    <Sparkles size={16} className="text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">AI Refactor</h3>
                    <p className="text-[10px] text-slate-500 font-medium">Describe changes or paste screenshot (Ctrl+V)</p>
                  </div>
                </div>
                <button onClick={() => setShowAiEditModal(false)} className="text-slate-500 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-5 flex-1 relative flex flex-col gap-3">
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g., 'Change the button color to red', 'Fix the loop logic'. You can paste screenshots here."
                  className="w-full h-32 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 placeholder-slate-600 resize-none font-sans"
                  autoFocus
                />
                
                {aiEditImage && (
                  <div className="flex items-center gap-3 p-2 bg-slate-950 rounded-lg border border-slate-800 animate-fade-in">
                    <div className="w-12 h-12 rounded bg-slate-800 overflow-hidden shrink-0 relative group">
                       <img src={URL.createObjectURL(aiEditImage)} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                       <p className="text-xs text-slate-300 font-medium truncate">{aiEditImage.name}</p>
                       <p className="text-[10px] text-slate-500">Image attached</p>
                    </div>
                    <button onClick={() => setAiEditImage(null)} className="p-1 hover:bg-slate-800 rounded-full text-slate-500 hover:text-red-400 transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                )}
                
                {/* Grammar Fix Button inside Modal */}
                <div className="absolute top-[8rem] right-6">
                   <button
                    onClick={handleFixAiPrompt}
                    disabled={!aiPrompt.trim() || isFixingAiPrompt}
                    className={`
                      p-1.5 rounded-lg transition-all duration-300
                      ${!aiPrompt.trim() ? 'opacity-0 pointer-events-none' : 'opacity-100'}
                      ${isFixingAiPrompt ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300 border border-slate-700'}
                    `}
                    title="Fast English Fix & Translate"
                   >
                     <Languages size={14} className={isFixingAiPrompt ? 'animate-pulse' : ''} />
                   </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 px-5 py-4 bg-slate-950 border-t border-slate-800">
                <button 
                  onClick={() => setShowAiEditModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSubmitAiEdit}
                  disabled={!aiPrompt.trim() && !aiEditImage}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg
                    ${!aiPrompt.trim() && !aiEditImage
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-500/20'}
                  `}
                >
                  <Send size={14} />
                  Generate Changes
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};