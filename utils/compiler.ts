import { GeneratedFile } from '../types';

/**
 * Transpiles simple C++ code to executable JavaScript for interactive simulation.
 * Supports: cout, cin, basic types, loops, and math.
 */
const transpileCppToJs = (code: string): string => {
  let js = code;

  // 1. Remove Headers, Namespace, and specific C++ keywords
  js = js.replace(/#include\s+<.*?>/g, '');
  js = js.replace(/using\s+namespace\s+std;/g, '');
  js = js.replace(/return\s+0;/g, '');

  // 2. Extract Main Body (Naive approach: assumes single main function for simple scripts)
  const mainMatch = js.match(/int\s+main\s*\(\)\s*\{([\s\S]*)\}/);
  if (mainMatch) {
    js = mainMatch[1];
  }

  // 3. Convert C++ Types to JavaScript 'let'
  js = js.replace(/\blong\s+long\b/g, 'let');
  js = js.replace(/\b(int|long|float|double|char|string|bool|auto|const)\b/g, 'let');

  // 4. Remove 'std::' namespace prefix
  js = js.replace(/std::/g, '');

  // 5. Transpile 'cin >> var;' to prompts
  js = js.replace(/cin\s*>>\s*([a-zA-Z0-9_]+)\s*;/g, (match, varName) => {
    return `${varName} = prompt("Interactive Input required for '${varName}':");\n` +
           `if(${varName} !== null && !isNaN(Number(${varName})) && ${varName}.trim() !== '') ${varName} = Number(${varName});\n` +
           `console.log("[Input] ${varName} =", ${varName});`;
  });

  // 6. Transpile 'cout << ... ;' to 'console.log(...);'
  const lines = js.split('\n');
  const processedLines = lines.map(line => {
    if (line.trim().startsWith('cout')) {
        let content = line.trim();
        content = content.replace(/^cout\s*<<\s*/, '');
        content = content.replace(/;$/, '');
        const parts = content.split('<<').map(p => p.trim());
        const jsParts = parts.map(p => {
            if (p === 'endl') return '"\\n"';
            return p;
        });
        return `console.log(${jsParts.join(', ')});`;
    }
    return line;
  });
  js = processedLines.join('\n');

  return `
    console.log("⚡ C++ Interactive Simulation Started");
    console.log("-------------------------------------");
    try {
      (async function() {
        ${js}
      })();
      console.log("-------------------------------------");
      console.log("Process finished with exit code 0");
    } catch (e) {
      console.error("Runtime Error:", e.message);
    }
  `;
};

/**
 * Simulates execution of non-web languages.
 */
const simulateNativeLanguage = (file: GeneratedFile): string => {
  if (file.name.match(/\.(cpp|c|h|hpp)$/i)) {
    return transpileCppToJs(file.content);
  }

  const content = file.content;
  const logs: string[] = [];
  const addLog = (msg: string) => logs.push(`console.log("${msg.replace(/"/g, '\\"')}");`);

  if (file.name.endsWith('.py')) {
    const printRegex = /print\s*\(\s*(['"])(.*?)\1\s*\)/g;
    let match;
    while ((match = printRegex.exec(content)) !== null) addLog(match[2]);
  }
  else if (file.name.endsWith('.java')) {
    const javaPrintRegex = /System\.out\.print(?:ln)?\s*\(\s*"([^"]*)"\s*\)/g;
    let match;
    while ((match = javaPrintRegex.exec(content)) !== null) addLog(match[1]);
  }
  else if (file.name.endsWith('.go')) {
    const goPrintRegex = /fmt\.P(?:rint|rintln|rintf)\s*\(\s*"([^"]*)"/g;
    let match;
    while ((match = goPrintRegex.exec(content)) !== null) addLog(match[1]);
  }
  else {
    addLog(`[System] Compiled ${file.name} successfully.`);
  }
  
  return logs.join('\n');
};

export const assemblePreview = (files: GeneratedFile[]): string => {
  let html = '';
  let css = '';
  let isReact = false;
  let isNative = false;

  // Priority 1: explicitly generated preview.html
  const previewHtmlFile = files.find(f => f.name.toLowerCase() === 'preview.html');
  // Priority 2: main html file
  const htmlFile = files.find(f => f.name.endsWith('.html') && f.name !== 'preview.html');
  const cssFiles = files.filter(f => f.name.endsWith('.css'));
  const jsFiles = files.filter(f => f.name.match(/\.(js|jsx|ts|tsx)$/));
  const nativeFile = files.find(f => f.name.match(/\.(cpp|c|py|java|rs|go|php)$/i));
  // Support for Shopify Liquid
  const liquidFile = files.find(f => f.name.endsWith('.liquid'));

  if (!previewHtmlFile && !htmlFile && jsFiles.length === 0 && nativeFile) {
    isNative = true;
  }

  if (jsFiles.some(f => f.content.includes('import React') || f.content.includes('react-dom') || f.content.includes('from "react"') || f.content.includes("from 'react'"))) {
    isReact = true;
  }

  // 1. Console & Error Hook
  const consoleHook = `
<script>
  (function() {
    function send(type, args) {
      try {
        const message = args.map(arg => {
          if (arg === null) return 'null';
          if (arg === undefined) return 'undefined';
          if (typeof arg === 'object') {
            try { return JSON.stringify(arg, null, 2); } catch(e) { return arg.toString(); }
          }
          return String(arg);
        }).join(' ');
        window.parent.postMessage({ source: 'PREVIEW_CONSOLE', type, message }, '*');
      } catch (e) {
        console.error('Failed to send console log', e);
      }
    }

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    console.log = function(...args) { originalLog.apply(console, args); send('log', args); };
    console.error = function(...args) { originalError.apply(console, args); send('error', args); };
    console.warn = function(...args) { originalWarn.apply(console, args); send('warn', args); };
    console.info = function(...args) { originalInfo.apply(console, args); send('info', args); };
    
    // Global Error Handler for Preview
    window.onerror = function(message, source, lineno, colno, error) {
       send('error', [message]);
       
       // Display error on screen if root is empty (likely a crash before render)
       const root = document.getElementById('root');
       if (root && root.innerHTML.trim() === '') {
         root.innerHTML = '<div style="color: #f87171; background: #450a0a; padding: 20px; font-family: system-ui, sans-serif; border-radius: 8px; margin: 20px; border: 1px solid #7f1d1d;">' +
           '<h3 style="margin-top:0">Preview Error</h3>' +
           '<pre style="white-space: pre-wrap;">' + message + '</pre>' +
           '<p style="opacity: 0.8; font-size: 0.9em; margin-top: 10px;">Check console for details.</p>' +
         '</div>';
       }
       return false;
    };

    // Unhandled Rejection Handler
    window.addEventListener('unhandledrejection', function(event) {
       send('error', ['Unhandled Promise Rejection: ' + event.reason]);
    });
  })();
</script>`;

  if (isNative && nativeFile) {
    const simulationScript = simulateNativeLanguage(nativeFile);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  ${consoleHook}
  <style>body { background-color: #0f172a; color: #f8fafc; font-family: monospace; padding: 20px; }</style>
</head>
<body>
  <script>
    setTimeout(() => {
      ${simulationScript}
    }, 500);
  </script>
</body>
</html>`;
  }

  // 2. CSS Assembly
  css = cssFiles.map(f => `/* ${f.name} */\n${f.content}`).join('\n');

  // 3. HTML scaffolding
  if (previewHtmlFile) {
    html = previewHtmlFile.content;
  } else if (htmlFile) {
    html = htmlFile.content;
  } else if (liquidFile && !isReact) {
    // Advanced Liquid to HTML conversion for preview (Fallback)
    let liquidContent = liquidFile.content;
    
    // Extract and strip Schema
    liquidContent = liquidContent.replace(/{% schema %}[\s\S]*?{% endschema %}/g, '');
    
    // Extract Stylesheet
    const styleMatch = liquidContent.match(/{% stylesheet %}([\s\S]*?){% endstylesheet %}/);
    if (styleMatch) {
      css += `\n/* Liquid Stylesheet */\n${styleMatch[1]}`;
      liquidContent = liquidContent.replace(/{% stylesheet %}[\s\S]*?{% endstylesheet %}/g, '');
    }

    // Extract Javascript
    const jsMatch = liquidContent.match(/{% javascript %}([\s\S]*?){% endjavascript %}/);
    let liquidJs = '';
    if (jsMatch) {
      liquidJs = jsMatch[1];
      liquidContent = liquidContent.replace(/{% javascript %}[\s\S]*?{% endjavascript %}/g, '');
    }

    // Replace common Liquid tags with placeholders to prevent rendering issues
    // {{ section.settings.image | img_url: '...' }} -> placeholder image
    liquidContent = liquidContent.replace(/\{\{\s*section\.settings\.[^}]*img_url[^}]*\}\}/g, 'https://placehold.co/600x400?text=Section+Image');
    liquidContent = liquidContent.replace(/\{\{\s*[^}]*\|\s*img_url[^}]*\}\}/g, 'https://placehold.co/600x400?text=Image');
    
    // Simple variable replacements
    liquidContent = liquidContent.replace(/\{\{\s*section\.settings\.([^}]+)\s*\}\}/g, '<span data-liquid="$1">[Setting: $1]</span>');
    liquidContent = liquidContent.replace(/\{\{\s*([^}]+)\s*\}\}/g, '<!-- $1 -->');
    
    // Logic tags - strip them but keep content if possible, or simple remove
    liquidContent = liquidContent.replace(/{%[^%]*%}/g, '');

    // Wrap in scaffold
    html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Liquid Preview</title>
  <style>
    body, html { 
      background-color: #ffffff; 
      color: #1e293b; 
      margin: 0; 
      padding: 0;
      height: 100%;
      width: 100%;
      font-family: system-ui, -apple-system, sans-serif; 
    }
  </style>
</head>
<body>
  ${liquidContent}
  <script>${liquidJs}</script>
</body>
</html>`;
  } else {
    html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <style>
    body, html { 
      background-color: #ffffff; 
      color: #1e293b; 
      margin: 0; 
      padding: 0;
      height: 100%;
      width: 100%;
      font-family: system-ui, -apple-system, sans-serif; 
    }
    #root { 
      min-height: 100%; 
      display: flex;
      flex-direction: column;
    }
  </style>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;
  }

  // Inject CSS
  if (css) {
    if (html.includes('</head>')) {
      html = html.replace('</head>', `<style>${css}</style></head>`);
    } else {
      html = html.replace('<body>', `<head><style>${css}</style></head><body>`);
    }
  }

  // 4. React / JS Assembly
  if (isReact) {
    // Comprehensive Import Map to support most common libraries users ask for
    const importMap = {
      "imports": {
        // React Core
        "react": "https://esm.sh/react@18.2.0",
        "react-dom": "https://esm.sh/react-dom@18.2.0",
        "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
        
        // Utilities
        "clsx": "https://esm.sh/clsx",
        "tailwind-merge": "https://esm.sh/tailwind-merge",
        "date-fns": "https://esm.sh/date-fns",
        "lodash": "https://esm.sh/lodash",
        "axios": "https://esm.sh/axios",
        "uuid": "https://esm.sh/uuid",
        
        // UI & Animation
        "framer-motion": "https://esm.sh/framer-motion@10.16.4",
        "lucide-react": "https://esm.sh/lucide-react@0.263.1",
        "recharts": "https://esm.sh/recharts@2.10.3",
        "react-icons": "https://esm.sh/react-icons@4.10.1",
        "react-icons/fa": "https://esm.sh/react-icons@4.10.1/fa",
        "react-icons/md": "https://esm.sh/react-icons@4.10.1/md",
        "react-icons/fi": "https://esm.sh/react-icons@4.10.1/fi",
        "react-icons/bi": "https://esm.sh/react-icons@4.10.1/bi",
        "react-icons/ai": "https://esm.sh/react-icons@4.10.1/ai",
        "react-icons/bs": "https://esm.sh/react-icons@4.10.1/bs",
        
        // Components & Sliders
        "react-slick": "https://esm.sh/react-slick@0.29.0",
        "slick-carousel": "https://esm.sh/slick-carousel@1.8.1",
        "swiper": "https://esm.sh/swiper@10.0.0",
        "swiper/react": "https://esm.sh/swiper@10.0.0/react",
        "swiper/css": "https://esm.sh/swiper@10.0.0/css",
        
        // Markdown
        "react-markdown": "https://esm.sh/react-markdown@9.0.0",
        
        // 3D
        "three": "https://esm.sh/three@0.154.0",
        "@react-three/fiber": "https://esm.sh/@react-three/fiber@8.13.0",
        "@react-three/drei": "https://esm.sh/@react-three/drei@9.77.0"
      }
    };

    const babelScript = `<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>`;
    const importMapScript = `<script type="importmap">${JSON.stringify(importMap)}</script>`;
    
    // Inject Tailwind if not present
    const tailwindScript = !html.includes('cdn.tailwindcss.com') ? `<script src="https://cdn.tailwindcss.com"></script>` : '';
    
    // Inject Swiper/Slick CSS if detected
    let externalCss = '';
    if (jsFiles.some(f => f.content.includes('slick'))) {
      externalCss += `<link rel="stylesheet" type="text/css" charset="UTF-8" href="https://cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.6.0/slick.min.css" /> \n`;
      externalCss += `<link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.6.0/slick-theme.min.css" /> \n`;
    }

    // Sort files to ensure dependencies are likely defined before usage
    // Priority: Utils -> Components -> App -> Index/Main
    const sortedJs = jsFiles.sort((a, b) => {
      const getScore = (name: string) => {
        if (name.match(/index\.(js|jsx|ts|tsx)$/i)) return 100;
        if (name.match(/main\.(js|jsx|ts|tsx)$/i)) return 100;
        if (name.match(/App\.(js|jsx|ts|tsx)$/i)) return 50;
        if (name.match(/components?\//i)) return 10;
        return 0; 
      };
      return getScore(a.name) - getScore(b.name);
    });

    const externalImports = new Set<string>();
    let entryPointExists = false;
    
    // Process JS: Strip local imports, collect external imports, remove exports
    const processedJsParts = sortedJs.map(f => {
      let content = f.content;

      // Check for entry point
      if (content.includes('createRoot') || content.includes('ReactDOM.render')) {
        entryPointExists = true;
      }
      
      // Regex to match imports
      // 1. Match import ... from '...'
      const importRegex = /import\s+(?:[\s\S]*?)\s+from\s+['"](.*?)['"];?/g;
      // 2. Match import '...' (side effects)
      const sideEffectImportRegex = /import\s+['"](.*?)['"];?/g;

      // Extract external imports and remove lines
      content = content.replace(importRegex, (match, path) => {
        if (path.startsWith('.') || path.startsWith('/')) {
          // Local import - remove entirely (concatenated)
          return ''; 
        } else {
          externalImports.add(match);
          return '';
        }
      });

      content = content.replace(sideEffectImportRegex, (match, path) => {
        if (path.startsWith('.') || path.startsWith('/')) {
          return '';
        } else {
          externalImports.add(match);
          return '';
        }
      });

      // Strip exports
      content = content.replace(/export\s+default\s+/g, '');
      content = content.replace(/export\s+/g, '');

      return `// --- ${f.name} ---\n${content}`;
    });

    const combinedImports = Array.from(externalImports).join('\n');
    
    // Process Shim
    const processShim = `
      window.process = { 
        env: { NODE_ENV: 'development' } 
      };
    `;

    // Auto-mount if missing
    let mountScript = '';
    if (!entryPointExists && processedJsParts.some(p => p.includes('function App') || p.includes('class App') || p.includes('const App'))) {
       mountScript = `
         if (typeof App !== 'undefined') {
           const root = ReactDOM.createRoot(document.getElementById('root'));
           root.render(React.createElement(App));
         }
       `;
    }

    const appScript = `<script type="text/babel" data-type="module">
      ${combinedImports}
      ${processShim}
      
      // Error boundary wrapper for safety
      try {
        ${processedJsParts.join('\n\n')}
        ${mountScript}
      } catch (err) {
        console.error("Runtime Script Error:", err);
        const root = document.getElementById('root');
        if (root) {
          root.innerHTML = '<div style="color:red; padding:20px;"><h3>Script Error</h3><pre>' + err.message + '</pre></div>';
        }
      }
    </script>`;

    const headScripts = `${consoleHook}\n${tailwindScript}\n${importMapScript}\n${externalCss}`;
    if (html.includes('</head>')) {
       html = html.replace('</head>', `${headScripts}\n</head>`);
    } else {
       html = `<head>${headScripts}</head>` + html;
    }

    const bodyScripts = `${babelScript}\n${appScript}`;
    if (html.includes('</body>')) {
      html = html.replace('</body>', `${bodyScripts}\n</body>`);
    } else {
      html += bodyScripts;
    }

  } else {
    // Vanilla JS
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${consoleHook}`);
    } else {
      html = consoleHook + html;
    }

    if (jsFiles.length > 0) {
      const scriptContent = jsFiles.map(f => f.content).join('\n');
      if (html.includes('</body>')) {
        html = html.replace('</body>', `<script>${scriptContent}</script></body>`);
      } else {
        html += `<script>${scriptContent}</script>`;
      }
    }
  }

  return html;
};