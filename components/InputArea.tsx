import React, { useRef, useState, useEffect } from 'react';
import { Upload, X, Paperclip, Image as ImageIcon, Languages } from 'lucide-react';

interface InputAreaProps {
  onGenerate: (prompt: string, image: File | null) => void;
  onPromptFix: (prompt: string) => Promise<string>;
  isGenerating: boolean;
  onImageChange: (hasImage: boolean) => void;
}

export const InputArea: React.FC<InputAreaProps> = ({ onGenerate, onPromptFix, isGenerating, onImageChange }) => {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Prevent capturing paste if a modal is open
      if (document.querySelector('.modal-active')) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            setImage(file);
            onImageChange(true);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onImageChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type.startsWith('image/')) {
        setImage(file);
        onImageChange(true);
      }
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        setImage(file);
        onImageChange(true);
      }
    }
  };

  const removeImage = () => {
    setImage(null);
    onImageChange(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFixGrammar = async () => {
    if (!prompt.trim() || isFixing) return;
    setIsFixing(true);
    try {
      const fixedPrompt = await onPromptFix(prompt);
      setPrompt(fixedPrompt);
    } finally {
      setIsFixing(false);
    }
  };

  const handleSubmit = () => {
    if (!prompt.trim() && !image) return;
    onGenerate(prompt, image);
  };

  return (
    <div className="flex flex-col gap-4">
      <div 
        className={`relative flex flex-col p-6 rounded-xl border-2 transition-all duration-200 bg-slate-800/50
          ${dragActive ? 'border-brand-500 bg-brand-900/10' : 'border-slate-700'}
          ${isGenerating ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the software you want to build... (e.g., 'A React todo app with local storage', 'Analyze this UI mock'). You can also paste screenshots directly (Ctrl+V)."
          className="w-full h-64 bg-transparent text-slate-100 placeholder-slate-500 resize-none focus:outline-none text-base sm:text-lg font-medium font-sans pr-8 custom-scrollbar"
        />

        {/* Grammar Fix Button */}
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={handleFixGrammar}
            disabled={!prompt.trim() || isFixing}
            className={`
              p-2 rounded-lg transition-all duration-300
              ${!prompt.trim() ? 'opacity-0 pointer-events-none' : 'opacity-100'}
              ${isFixing ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-700/50 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300'}
            `}
            title="Translate to English & Fix Grammar"
          >
            <Languages size={16} className={isFixing ? 'animate-pulse' : ''} />
          </button>
        </div>

        {image && (
          <div className="mt-4 flex items-center gap-3 p-2 bg-slate-900/50 rounded-lg w-fit border border-slate-700">
            <div className="w-10 h-10 rounded overflow-hidden bg-slate-800">
              <img 
                src={URL.createObjectURL(image)} 
                alt="Upload preview" 
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-sm text-slate-300 truncate max-w-[200px]">{image.name}</span>
            <button 
              onClick={removeImage}
              className="p-1 hover:bg-slate-700 rounded-full text-slate-400 hover:text-red-400 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-slate-700 pt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-brand-400 hover:bg-slate-800 rounded-lg transition-colors"
              title="Attach Image or Paste from Clipboard"
            >
              <Paperclip size={18} />
              <span className="hidden sm:inline">Attach Image</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={(!prompt.trim() && !image) || isGenerating}
            className={`
              flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-all shadow-lg
              ${(!prompt.trim() && !image) || isGenerating
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                : 'bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white shadow-brand-500/20'}
            `}
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <ImageIcon size={0} className="hidden" /> {/* prefetch hack if needed, ignore */}
                <span>Generate Code</span>
                <Upload size={18} />
              </>
            )}
          </button>
        </div>
        
        {dragActive && (
          <div className="absolute inset-0 bg-brand-500/10 backdrop-blur-sm rounded-xl flex items-center justify-center border-2 border-brand-500 z-10 pointer-events-none">
            <div className="bg-slate-900 p-4 rounded-xl shadow-xl flex flex-col items-center gap-2">
              <Upload className="text-brand-400 w-10 h-10 animate-bounce" />
              <p className="text-brand-100 font-semibold">Drop image here or Paste (Ctrl+V)</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};