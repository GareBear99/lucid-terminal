/**
 * ProcessingGlow Component
 * 
 * Animated rainbow glow effect for command input bubble while processing.
 * Similar to Siri's iPhone screen edge animation.
 * 
 * Customizable via settings with color wheel slider.
 */

import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

interface ProcessingGlowProps {
  isProcessing: boolean;
  customColor?: string; // Optional override from settings
}

export function ProcessingGlow({ isProcessing, customColor }: ProcessingGlowProps) {
  const [rotation, setRotation] = useState(0);
  const { settings } = useSettingsStore();
  
  // Get glow color from settings or use default rainbow
  const glowColor = customColor || settings?.processingGlowColor || 'rainbow';
  const glowIntensity = settings?.processingGlowIntensity || 0.8;
  const glowSpeed = settings?.processingGlowSpeed || 3; // seconds per rotation
  
  useEffect(() => {
    if (!isProcessing) {
      setRotation(0);
      return;
    }
    
    // Animate rotation
    const interval = setInterval(() => {
      setRotation(prev => (prev + 1) % 360);
    }, glowSpeed * 1000 / 360); // Smooth rotation
    
    return () => clearInterval(interval);
  }, [isProcessing, glowSpeed]);
  
  if (!isProcessing) return null;
  
  // Generate gradient based on color mode
  const getGradient = () => {
    if (glowColor === 'rainbow') {
      // Classic Siri rainbow gradient
      return `conic-gradient(
        from ${rotation}deg,
        #ff0080 0deg,
        #ff8c00 60deg,
        #40e0d0 120deg,
        #00ff00 180deg,
        #4b0082 240deg,
        #8a2be2 300deg,
        #ff0080 360deg
      )`;
    } else if (glowColor === 'custom' && settings?.processingGlowCustomColor) {
      // Single color pulse
      const color = settings.processingGlowCustomColor;
      return `radial-gradient(circle, ${color} 0%, transparent 70%)`;
    } else {
      // Preset color schemes
      const presets: Record<string, string> = {
        blue: `conic-gradient(from ${rotation}deg, #00d4ff, #0099ff, #00d4ff)`,
        purple: `conic-gradient(from ${rotation}deg, #a855f7, #6366f1, #a855f7)`,
        green: `conic-gradient(from ${rotation}deg, #10b981, #14b8a6, #10b981)`,
        red: `conic-gradient(from ${rotation}deg, #ef4444, #f97316, #ef4444)`,
        gold: `conic-gradient(from ${rotation}deg, #fbbf24, #f59e0b, #fbbf24)`,
      };
      return presets[glowColor] || presets.blue;
    }
  };
  
  return (
    <>
      {/* Main glow border */}
      <div
        className="processing-glow-border"
        style={{
          position: 'absolute',
          inset: '-2px',
          borderRadius: 'inherit',
          padding: '2px',
          background: getGradient(),
          opacity: glowIntensity,
          pointerEvents: 'none',
          zIndex: -1,
          transition: 'opacity 0.3s ease',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 'inherit',
            background: 'var(--bg-primary)',
          }}
        />
      </div>
      
      {/* Pulsing glow effect */}
      <div
        className="processing-glow-pulse"
        style={{
          position: 'absolute',
          inset: '-4px',
          borderRadius: 'inherit',
          background: getGradient(),
          opacity: glowIntensity * 0.3,
          filter: 'blur(8px)',
          pointerEvents: 'none',
          zIndex: -2,
          animation: 'pulse-glow 2s ease-in-out infinite',
        }}
      />
      
      {/* CSS Animation for pulse */}
      <style>
        {`
          @keyframes pulse-glow {
            0%, 100% {
              transform: scale(1);
              opacity: ${glowIntensity * 0.3};
            }
            50% {
              transform: scale(1.05);
              opacity: ${glowIntensity * 0.5};
            }
          }
        `}
      </style>
    </>
  );
}

/**
 * ProcessingGlowSettings Component
 * 
 * UI for customizing the processing glow effect.
 * Includes:
 * - Color mode selector (rainbow, preset, custom)
 * - Color wheel for custom colors
 * - Intensity slider
 * - Speed slider
 */

interface ProcessingGlowSettingsProps {
  onSave?: () => void;
}

export function ProcessingGlowSettings({ onSave }: ProcessingGlowSettingsProps) {
  const { settings, updateSettings } = useSettingsStore();
  const [colorMode, setColorMode] = useState(settings?.processingGlowColor || 'rainbow');
  const [customColor, setCustomColor] = useState(settings?.processingGlowCustomColor || '#0099ff');
  const [intensity, setIntensity] = useState(settings?.processingGlowIntensity || 0.8);
  const [speed, setSpeed] = useState(settings?.processingGlowSpeed || 3);
  
  const handleSave = () => {
    updateSettings({
      processingGlowColor: colorMode,
      processingGlowCustomColor: customColor,
      processingGlowIntensity: intensity,
      processingGlowSpeed: speed,
    });
    onSave?.();
  };
  
  const presetColors = [
    { id: 'rainbow', name: 'Rainbow (Siri)', preview: 'linear-gradient(90deg, #ff0080, #ff8c00, #40e0d0, #00ff00)' },
    { id: 'blue', name: 'Blue', preview: 'linear-gradient(90deg, #00d4ff, #0099ff)' },
    { id: 'purple', name: 'Purple', preview: 'linear-gradient(90deg, #a855f7, #6366f1)' },
    { id: 'green', name: 'Green', preview: 'linear-gradient(90deg, #10b981, #14b8a6)' },
    { id: 'red', name: 'Red', preview: 'linear-gradient(90deg, #ef4444, #f97316)' },
    { id: 'gold', name: 'Gold', preview: 'linear-gradient(90deg, #fbbf24, #f59e0b)' },
  ];
  
  return (
    <div className="processing-glow-settings space-y-4 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
        Command Processing Glow
      </h3>
      
      {/* Color Mode Selector */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)]">Color Mode</label>
        <div className="grid grid-cols-3 gap-2">
          {presetColors.map(preset => (
            <button
              key={preset.id}
              onClick={() => setColorMode(preset.id)}
              className={`
                p-3 rounded-lg border transition-all
                ${colorMode === preset.id 
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10' 
                  : 'border-[var(--border)] hover:border-[var(--accent)]/50'
                }
              `}
            >
              <div
                className="h-3 rounded mb-1"
                style={{ background: preset.preview }}
              />
              <span className="text-xs text-[var(--text-secondary)]">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Custom Color Picker */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)]">Custom Color</label>
        <div className="flex gap-2">
          <input
            type="color"
            value={customColor}
            onChange={(e) => {
              setCustomColor(e.target.value);
              setColorMode('custom');
            }}
            className="w-16 h-10 rounded cursor-pointer"
          />
          <input
            type="text"
            value={customColor}
            onChange={(e) => {
              setCustomColor(e.target.value);
              setColorMode('custom');
            }}
            className="flex-1 px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm font-mono"
            placeholder="#0099ff"
          />
        </div>
      </div>
      
      {/* Intensity Slider */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-xs text-[var(--text-secondary)]">Intensity</label>
          <span className="text-xs text-[var(--text-muted)]">{Math.round(intensity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={intensity}
          onChange={(e) => setIntensity(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
      
      {/* Speed Slider */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-xs text-[var(--text-secondary)]">Animation Speed</label>
          <span className="text-xs text-[var(--text-muted)]">{speed}s</span>
        </div>
        <input
          type="range"
          min="1"
          max="10"
          step="0.5"
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
      
      {/* Preview */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)]">Preview</label>
        <div className="relative p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)]">
          <div className="relative px-4 py-2 rounded bg-[var(--bg-secondary)]">
            <ProcessingGlow 
              isProcessing={true} 
              customColor={colorMode === 'custom' ? customColor : colorMode}
            />
            <span className="text-sm text-[var(--text-primary)]">$ processing command...</span>
          </div>
        </div>
      </div>
      
      {/* Save Button */}
      <button
        onClick={handleSave}
        className="w-full px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium transition-colors"
      >
        Save Settings
      </button>
    </div>
  );
}
