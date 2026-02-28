/**
 * ANSI-to-HTML Converter with Native Text Selection
 * Provides AAAA premium Warp-style text selection
 */

interface AnsiStyle {
  color?: string;
  bgColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const ANSI_COLORS: Record<number, string> = {
  // Normal colors
  30: '#484f58',   // black
  31: '#ff7b72',   // red
  32: '#3fb950',   // green  
  33: '#d29922',   // yellow
  34: '#58a6ff',   // blue
  35: '#bc8cff',   // magenta
  36: '#39c5cf',   // cyan
  37: '#b1bac4',   // white
  
  // Bright colors
  90: '#6e7681',   // bright black
  91: '#ffa198',   // bright red
  92: '#56d364',   // bright green
  93: '#e3b341',   // bright yellow
  94: '#79c0ff',   // bright blue
  95: '#d2a8ff',   // bright magenta
  96: '#56d4dd',   // bright cyan
  97: '#ffffff',   // bright white
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#484f58',   // black bg
  41: '#ff7b72',   // red bg
  42: '#3fb950',   // green bg
  43: '#d29922',   // yellow bg
  44: '#58a6ff',   // blue bg
  45: '#bc8cff',   // magenta bg
  46: '#39c5cf',   // cyan bg
  47: '#b1bac4',   // white bg
  
  100: '#6e7681',  // bright black bg
  101: '#ffa198',  // bright red bg
  102: '#56d364',  // bright green bg
  103: '#e3b341',  // bright yellow bg
  104: '#79c0ff',  // bright blue bg
  105: '#d2a8ff',  // bright magenta bg
  106: '#56d4dd',  // bright cyan bg
  107: '#ffffff',  // bright white bg
};

/**
 * Parse ANSI escape codes and convert to HTML with inline styles
 */
export function ansiToHtml(text: string): string {
  const lines: string[] = [];
  const textLines = text.split('\n');
  
  for (const line of textLines) {
    const htmlLine = parseAnsiLine(line);
    lines.push(htmlLine);
  }
  
  return lines.join('\n');
}

function parseAnsiLine(line: string): string {
  // ANSI escape code regex: \x1b[...m
  const ansiRegex = /\x1b\[([0-9;]+)m/g;
  
  let result = '';
  let lastIndex = 0;
  let currentStyle: AnsiStyle = {};
  
  let match;
  while ((match = ansiRegex.exec(line)) !== null) {
    // Add text before this escape code
    const textBefore = line.substring(lastIndex, match.index);
    if (textBefore) {
      result += wrapWithStyle(escapeHtml(textBefore), currentStyle);
    }
    
    // Parse escape code
    const codes = match[1].split(';').map(Number);
    currentStyle = applyAnsiCodes(currentStyle, codes);
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  const remainingText = line.substring(lastIndex);
  if (remainingText) {
    result += wrapWithStyle(escapeHtml(remainingText), currentStyle);
  }
  
  return result || '<span></span>';
}

function applyAnsiCodes(style: AnsiStyle, codes: number[]): AnsiStyle {
  const newStyle = { ...style };
  
  for (const code of codes) {
    if (code === 0) {
      // Reset all
      return {};
    } else if (code === 1) {
      newStyle.bold = true;
    } else if (code === 3) {
      newStyle.italic = true;
    } else if (code === 4) {
      newStyle.underline = true;
    } else if (code === 22) {
      newStyle.bold = false;
    } else if (code === 23) {
      newStyle.italic = false;
    } else if (code === 24) {
      newStyle.underline = false;
    } else if (ANSI_COLORS[code]) {
      newStyle.color = ANSI_COLORS[code];
    } else if (ANSI_BG_COLORS[code]) {
      newStyle.bgColor = ANSI_BG_COLORS[code];
    } else if (code === 39) {
      newStyle.color = undefined; // Default foreground
    } else if (code === 49) {
      newStyle.bgColor = undefined; // Default background
    }
  }
  
  return newStyle;
}

function wrapWithStyle(text: string, style: AnsiStyle): string {
  if (Object.keys(style).length === 0) {
    return text;
  }
  
  const styles: string[] = [];
  
  if (style.color) {
    styles.push(`color: ${style.color}`);
  }
  if (style.bgColor) {
    styles.push(`background-color: ${style.bgColor}`);
  }
  if (style.bold) {
    styles.push('font-weight: bold');
  }
  if (style.italic) {
    styles.push('font-style: italic');
  }
  if (style.underline) {
    styles.push('text-decoration: underline');
  }
  
  if (styles.length === 0) {
    return text;
  }
  
  return `<span style="${styles.join('; ')}">${text}</span>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/ /g, '&nbsp;'); // Preserve spaces
}
