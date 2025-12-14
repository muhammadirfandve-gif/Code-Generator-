import React from 'react';
import { AppMode } from '../types';
import { Layout, Terminal } from 'lucide-react';

interface SettingsBarProps {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  hasImage: boolean;
}

export const SettingsBar: React.FC<SettingsBarProps> = ({ mode, setMode, hasImage }) => {
  
  const options = [
    {
      id: AppMode.FAST,
      label: 'Web App',
      icon: Layout,
      desc: 'Generate full web applications',
      disabled: false 
    },
    {
      id: AppMode.COMPILER,
      label: 'Compiler',
      icon: Terminal,
      desc: 'Execute logic & algorithms',
      disabled: false
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-2 p-2 mb-2">
      {options.map((opt) => {
        const isActive = mode === opt.id;
        const Icon = opt.icon;
        
        return (
          <button
            key={opt.id}
            onClick={() => setMode(opt.id)}
            title={opt.desc}
            className={`
              flex flex-col sm:flex-row items-center justify-center gap-2 px-3 py-3 rounded-lg transition-all duration-200 border
              ${isActive 
                ? 'bg-slate-800 border-brand-500/50 text-brand-400 shadow-[0_0_10px_rgba(14,165,233,0.1)]' 
                : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}
              cursor-pointer
            `}
          >
            <Icon size={18} className={isActive ? 'text-brand-400' : 'text-current'} />
            <span className="text-sm font-bold">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};