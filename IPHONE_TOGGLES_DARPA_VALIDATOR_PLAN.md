# iPhone Toggles + Animated Glows + DARPA Validator Implementation Plan

## Overview
Transform Lucid Terminal with iOS-style UI, live-animated processing glows, and production-grade intent validation system inspired by RiftAscent's DARPA-level debugging.

---

## Phase 1: iPhone-Style Toggles (✅ Component Created)

### Status
- ✅ Created `/src/components/UI/iPhoneToggle.tsx`
- ⏳ Need to add CSS to global styles
- ⏳ Replace existing toggles in SettingsPanel

### Implementation Steps

#### 1.1 Add Toggle Styles to Global CSS
**File**: `src/index.css` or `src/App.css`

```css
/* Paste the iPhoneToggleStyles export from iPhoneToggle.tsx */
```

#### 1.2 Update Settings Panel to Use iPhone Toggles
**File**: `src/components/Settings/SettingsPanel.tsx`

Replace all checkbox inputs with:
```tsx
import { iPhoneToggle } from '../UI/iPhoneToggle';

// Example:
<iPhoneToggle
  checked={settings.someFeature}
  onChange={(checked) => updateSetting('someFeature', checked)}
  label="Enable Feature"
  sublabel="Description of what this does"
  accentColor={settings.toggleAccentColor || '#9c5fff'}
/>
```

### Toggles to Convert
1. Processing glow settings (show/hide, auto-collapse)
2. Validation display settings
3. Token display settings
4. Daemon settings (enable/disable, auto-fix)
5. Skip shop toggle (already exists)
6. **NEW**: Debugger toggle (show DARPA validator)

---

## Phase 2: Color Customization Settings

### 2.1 Add Color Settings to Types
**File**: `src/types/index.ts`

```typescript
export interface Settings {
  // ... existing settings ...
  
  // New color settings
  toggleAccentColor?: string;           // iPhone toggle accent (default: #9c5fff)
  processingGlowColor?: string;         // Siri-style glow color
  requestBarGlowColor?: string;         // Input bar sweep glow
  validatorStripColor?: {               // Validator strip colors
    ok: string;                         // Green (default: #00ff78)
    warn: string;                       // Yellow (default: #ffd246)
    error: string;                      // Red (default: #ff4646)
  };
}
```

### 2.2 Add Color Customization Tab to Settings
**File**: `src/components/Settings/SettingsPanel.tsx`

Add new tab "Colors" with:
- Toggle Accent Color picker
- Processing Glow Color picker
- Request Bar Glow Color picker
- Validator Colors (OK/Warn/Error) pickers

```tsx
<div className="color-picker-row">
  <label>Toggle Accent Color</label>
  <input
    type="color"
    value={settings.toggleAccentColor || '#9c5fff'}
    onChange={(e) => updateSetting('toggleAccentColor', e.target.value)}
  />
  <button onClick={() => updateSetting('toggleAccentColor', '#9c5fff')}>
    Reset to Default
  </button>
</div>
```

---

## Phase 3: Animated Request Bar Glow

### 3.1 Create Animated Glow Component
**File**: `src/components/Terminal/AnimatedRequestGlow.tsx`

```tsx
import { useEffect, useState } from 'react';

type GlowPhase = 'idle' | 'sweeping' | 'processing' | 'completing' | 'passoff';

interface AnimatedRequestGlowProps {
  phase: GlowPhase;
  glowColor?: string;
}

export function AnimatedRequestGlow({ phase, glowColor = '#9c5fff' }: AnimatedRequestGlowProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (phase === 'sweeping') {
      // Left-to-right sweep animation
      const duration = 800; // ms
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        setProgress(progress);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      animate();
    } else if (phase === 'processing') {
      // Bubble glow (pulsing)
      // Use existing ProcessingGlow component
    } else if (phase === 'completing') {
      // Right-to-left pass-off
      const duration = 600;
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        setProgress(1 - progress);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      animate();
    } else {
      setProgress(0);
    }
  }, [phase]);

  if (phase === 'idle') return null;

  return (
    <div className="request-glow-wrapper">
      {phase === 'sweeping' && (
        <div
          className="request-glow-sweep"
          style={{
            transform: `translateX(${progress * 100}%)`,
            background: `linear-gradient(90deg, transparent, ${glowColor}cc, transparent)`,
            boxShadow: `0 0 20px ${glowColor}`
          }}
        />
      )}
      {phase === 'processing' && (
        <div
          className="request-glow-bubble"
          style={{
            background: `radial-gradient(circle, ${glowColor}cc, transparent)`,
            boxShadow: `0 0 30px ${glowColor}`
          }}
        />
      )}
      {phase === 'completing' && (
        <div
          className="request-glow-passoff"
          style={{
            transform: `translateX(${progress * 100}%)`,
            background: `linear-gradient(90deg, transparent, ${glowColor}dd, ${glowColor}aa, transparent)`,
            boxShadow: `0 0 25px ${glowColor}`
          }}
        />
      )}
    </div>
  );
}
```

### 3.2 CSS Animations
**File**: `src/index.css`

```css
.request-glow-wrapper {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  border-radius: inherit;
}

.request-glow-sweep,
.request-glow-passoff {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  transition: none;
}

.request-glow-bubble {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200%;
  height: 200%;
  transform: translate(-50%, -50%);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(0.95); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
}
```

### 3.3 Integrate into InputArea
**File**: `src/components/Terminal/InputArea.tsx`

```tsx
import { AnimatedRequestGlow } from './AnimatedRequestGlow';

// Add state
const [glowPhase, setGlowPhase] = useState<GlowPhase>('idle');

// On command submit:
const handleSubmit = () => {
  setGlowPhase('sweeping');
  setTimeout(() => setGlowPhase('processing'), 800);
  
  // ... existing submit logic ...
};

// When command completes:
useEffect(() => {
  if (!isProcessing && glowPhase === 'processing') {
    setGlowPhase('completing');
    setTimeout(() => setGlowPhase('idle'), 600);
  }
}, [isProcessing]);

// In JSX:
<div className="input-area-wrapper">
  <AnimatedRequestGlow
    phase={glowPhase}
    glowColor={settings.requestBarGlowColor || '#9c5fff'}
  />
  {/* ... rest of input area ... */}
</div>
```

---

## Phase 4: DARPA-Grade Validator System

### 4.1 Create Intent Tracking System
**File**: `src/utils/intentValidator.ts`

```typescript
// Global intent authority (inspired by RiftAscent's __RIFT)
interface IntentEntry {
  id: number;
  at: number;
  src: string;
  action: string;
  status: 'pending' | 'success' | 'failed' | 'timeout';
  detail: string;
  stack?: string;
}

interface Violation {
  at: number;
  type: string;
  target: string;
  label: string;
  stack?: string;
}

interface AutoWrap {
  at: number;
  type: string;
  target: string;
  label: string;
  origin: 'validator' | 'app';
  where: string;
  stack: string;
}

class IntentValidator {
  private seq = 0;
  private lastIntent: IntentEntry | null = null;
  private history: IntentEntry[] = [];
  private violations: Violation[] = [];
  private autowraps: AutoWrap[] = [];
  private autoWrapped = 0;
  private wrapMap = new WeakMap<Function, Function>();
  private listenerRegs: Array<{
    at: number;
    type: string;
    target: string;
    label: string;
    wrapped: boolean;
    bindWhere: string;
  }> = [];
  
  private strictMode = false;
  
  constructor() {
    this.installGlobalHandlers();
    this.wrapEventTargets();
  }
  
  // Wrap a function with intent tracking
  wrap(label: string, fn: Function): Function {
    if (typeof fn !== 'function') return fn;
    if (this.wrapMap.has(fn)) return this.wrapMap.get(fn)!;
    
    const wrapped = (...args: any[]) => {
      try {
        this.log(label, 'reached', 'success', '');
        return fn(...args);
      } catch (err) {
        this.log(label, 'threw', 'failed', String(err));
        throw err;
      }
    };
    
    this.wrapMap.set(fn, wrapped);
    return wrapped;
  }
  
  // Auto-wrap any unwrapped event listeners
  private autoWrap(target: EventTarget, type: string, listener: Function): Function {
    if (this.wrapMap.has(listener)) return this.wrapMap.get(listener)!;
    
    const targetName = this.describeTarget(target);
    const label = `${targetName}.${type}`;
    
    // Capture stack trace to find bind site
    let stack = '';
    try {
      throw new Error('AUTOWRAP_BIND_SITE');
    } catch (err: any) {
      stack = err.stack || '';
    }
    
    const where = this.extractBindSite(stack);
    const origin = stack.includes('intentValidator') ? 'validator' : 'app';
    
    this.autoWrapped++;
    this.autowraps.push({
      at: Date.now(),
      type,
      target: targetName,
      label,
      origin,
      where,
      stack: stack.split('\n').slice(0, 10).join('\n')
    });
    
    if (this.autowraps.length > 160) this.autowraps.shift();
    
    // In strict mode, app-origin autowraps are violations
    if (this.strictMode && origin === 'app') {
      this.violations.push({
        at: Date.now(),
        type: 'unwrapped_listener',
        target: targetName,
        label: `${label} @ ${where}`
      });
    }
    
    return this.wrap(label, listener);
  }
  
  private describeTarget(t: any): string {
    if (!t) return '(null)';
    if (t === window) return 'window';
    if (t === document) return 'document';
    if (t.id) return `#${t.id}`;
    if (t.className && String(t.className).trim()) {
      return `.${String(t.className).trim().split(/\s+/)[0]}`;
    }
    return t.tagName ? t.tagName.toLowerCase() : Object.prototype.toString.call(t);
  }
  
  private extractBindSite(stack: string): string {
    const lines = stack.split('\n').map(s => s.trim()).filter(Boolean);
    const skipRe = /(AUTOWRAP_BIND_SITE|IntentValidator|EventTarget\.prototype|intentValidator)/;
    
    for (const line of lines) {
      const clean = line.replace(/^at\s+/, '');
      if (skipRe.test(clean)) continue;
      if (/\.(ts|tsx|js|jsx):\d+(:\d+)?/.test(clean) || /file:\/\//.test(clean)) {
        return clean;
      }
    }
    
    return lines[3] || lines[2] || '';
  }
  
  private installGlobalHandlers() {
    // Capture global errors
    window.addEventListener('error', this.wrap('window.error', (ev: ErrorEvent) => {
      this.violations.push({
        at: Date.now(),
        type: 'window_error',
        target: 'window',
        label: ev.message || '(error)',
        stack: ev.error?.stack
      });
    }) as any);
    
    window.addEventListener('unhandledrejection', this.wrap('window.unhandledrejection', (ev: PromiseRejectionEvent) => {
      this.violations.push({
        at: Date.now(),
        type: 'unhandledrejection',
        target: 'window',
        label: String(ev.reason),
        stack: ev.reason?.stack
      });
    }) as any);
  }
  
  private wrapEventTargets() {
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    
    EventTarget.prototype.addEventListener = function(type: string, listener: any, options?: any) {
      let use = listener;
      let wrapped = false;
      
      if (typeof listener === 'function' && !intentValidator.wrapMap.has(listener)) {
        use = intentValidator.autoWrap(this, type, listener);
        wrapped = true;
      }
      
      // Record binding
      let bindWhere = '';
      try {
        const stack = new Error('IV_BIND_SITE').stack || '';
        bindWhere = intentValidator.extractBindSite(stack);
      } catch (e) {
        bindWhere = '';
      }
      
      intentValidator.listenerRegs.push({
        at: Date.now(),
        type: String(type),
        target: intentValidator.describeTarget(this),
        label: use.__ivLabel || '',
        wrapped,
        bindWhere
      });
      
      if (intentValidator.listenerRegs.length > 400) {
        intentValidator.listenerRegs.splice(0, intentValidator.listenerRegs.length - 400);
      }
      
      return originalAdd.call(this, type, use, options);
    };
    
    EventTarget.prototype.removeEventListener = function(type: string, listener: any, options?: any) {
      let use = listener;
      if (typeof listener === 'function') {
        const mapped = intentValidator.wrapMap.get(listener);
        if (mapped) use = mapped;
      }
      return originalRemove.call(this, type, use, options);
    };
  }
  
  log(src: string, action: string, status: IntentEntry['status'], detail: string) {
    this.seq++;
    this.lastIntent = {
      id: this.seq,
      at: Date.now(),
      src,
      action,
      status,
      detail
    };
    this.history.push(this.lastIntent);
    if (this.history.length > 30) this.history.shift();
    
    console.log(`[INTENT ${this.lastIntent.id}] ${src} → ${action} :: ${status}${detail ? ' :: ' + detail : ''}`);
  }
  
  getStats() {
    return {
      violations: this.violations.length,
      autowraps: this.autoWrapped,
      lastIntent: this.lastIntent,
      history: this.history,
      strictMode: this.strictMode
    };
  }
  
  setStrictMode(enabled: boolean) {
    this.strictMode = enabled;
  }
  
  downloadLog() {
    const payload = {
      createdAt: new Date().toISOString(),
      violations: this.violations,
      autowraps: this.autowraps,
      autoWrapped: this.autoWrapped,
      lastIntent: this.lastIntent,
      intentHistory: this.history,
      listenerRegs: this.listenerRegs.slice(-80),
      strictMode: this.strictMode
    };
    
    const txt = JSON.stringify(payload, null, 2);
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lucid_terminal_intent_log_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Global singleton
export const intentValidator = new IntentValidator();
```

### 4.2 Create Validator Compliance Strip
**File**: `src/components/Debug/ValidatorStrip.tsx`

```tsx
import { useEffect, useState } from 'react';
import { intentValidator } from '../../utils/intentValidator';

export function ValidatorStrip() {
  const [stats, setStats] = useState(intentValidator.getStats());
  const [visible, setVisible] = useState(false);
  
  useEffect(() => {
    // Update stats every 250ms
    const interval = setInterval(() => {
      setStats(intentValidator.getStats());
    }, 250);
    
    return () => clearInterval(interval);
  }, []);
  
  const getStripColor = () => {
    if (stats.violations > 0) return '#ff4646'; // Red
    if (stats.autowraps > 0) return '#ffd246'; // Yellow
    return '#00ff78'; // Green
  };
  
  const getStatusText = () => {
    if (stats.violations > 0) {
      return `VIOLATIONS(${stats.violations})${stats.autowraps > 0 ? ` AUTOWRAP(${stats.autowraps})` : ''}`;
    }
    if (stats.autowraps > 0) {
      return `AUTOWRAP(${stats.autowraps})`;
    }
    return 'OK';
  };
  
  if (!visible) return null;
  
  return (
    <div
      className="validator-strip"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '20px',
        zIndex: 2147483647,
        background: getStripColor(),
        boxShadow: `0 0 18px ${getStripColor()}`,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '10px',
        fontWeight: 800,
        fontSize: '12px',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: '#000',
        userSelect: 'none'
      }}
    >
      VALIDATOR: {getStatusText()} {stats.strictMode && '[STRICT]'}
    </div>
  );
}
```

### 4.3 Create Intent Panel
**File**: `src/components/Debug/IntentPanel.tsx`

```tsx
import { useEffect, useState } from 'react';
import { intentValidator } from '../../utils/intentValidator';

export function IntentPanel() {
  const [stats, setStats] = useState(intentValidator.getStats());
  const [visible, setVisible] = useState(false);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(intentValidator.getStats());
    }, 250);
    
    return () => clearInterval(interval);
  }, []);
  
  if (!visible) return null;
  
  return (
    <div className="intent-panel" style={{
      position: 'fixed',
      left: '12px',
      bottom: '12px',
      zIndex: 2147483646,
      minWidth: '440px',
      maxWidth: '820px',
      fontFamily: 'monospace',
      fontSize: '12px',
      lineHeight: '1.35',
      color: '#fff',
      background: 'rgba(0,0,0,0.65)',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: '10px',
      padding: '10px 12px',
      backdropFilter: 'blur(6px)'
    }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 800, letterSpacing: '0.5px' }}>INPUT VALIDATOR</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => setVisible(false)}>Hide</button>
          <button onClick={() => intentValidator.downloadLog()}>Download</button>
        </div>
      </div>
      
      <div style={{ marginTop: '8px', whiteSpace: 'pre-wrap', maxHeight: '180px', overflow: 'auto' }}>
        {stats.lastIntent && (
          <div>
            #{stats.lastIntent.id} {stats.lastIntent.src} → {stats.lastIntent.action} [{stats.lastIntent.status}]
            {stats.lastIntent.detail && <div>detail: {stats.lastIntent.detail}</div>}
          </div>
        )}
        
        {stats.history.length > 0 && (
          <div style={{ marginTop: '8px', opacity: 0.85 }}>
            history: {stats.history.map(x => `#${x.id}:${x.status}`).join('  ')}
          </div>
        )}
      </div>
      
      <div style={{ marginTop: '6px', opacity: 0.75 }}>
        violations:{stats.violations} | autowrap:{stats.autowraps} | strict:{stats.strictMode ? 'ON' : 'OFF'}
      </div>
    </div>
  );
}
```

### 4.4 Add Debugger Toggle to Settings
**File**: `src/components/Settings/SettingsPanel.tsx`

Add new section in Advanced/Developer tab:

```tsx
<div className="settings-section">
  <h3>DARPA Validator (Debug Mode)</h3>
  
  <iPhoneToggle
    checked={settings.showValidator || false}
    onChange={(checked) => {
      updateSetting('showValidator', checked);
      // Show/hide ValidatorStrip and IntentPanel
    }}
    label="Show Validator Strip"
    sublabel="Display intent tracking and violation monitoring"
  />
  
  <iPhoneToggle
    checked={settings.validatorStrictMode || false}
    onChange={(checked) => {
      updateSetting('validatorStrictMode', checked);
      intentValidator.setStrictMode(checked);
    }}
    label="Strict Mode"
    sublabel="Treat all autowraps as violations (DARPA-level enforcement)"
  />
</div>
```

---

## Phase 5: Integration & Wire-up

### 5.1 Wrap All Terminal Commands
**File**: `src/components/Terminal/Terminal.tsx`

```tsx
import { intentValidator } from '../../utils/intentValidator';

// Wrap command submission
const handleSubmit = intentValidator.wrap('terminal.submit', async (command: string) => {
  intentValidator.log('terminal', 'submit', 'pending', command);
  
  try {
    // ... existing submit logic ...
    intentValidator.log('terminal', 'submit', 'success', '');
  } catch (err) {
    intentValidator.log('terminal', 'submit', 'failed', String(err));
    throw err;
  }
}) as any;
```

### 5.2 Wrap All IPC Calls
**File**: Everywhere IPC is used

```tsx
const result = await intentValidator.wrap('ipc.lucid.command', async () => {
  return await window.lucidAPI.lucid.command(userInput);
})();
```

### 5.3 Add Validator Components to App.tsx
**File**: `src/App.tsx`

```tsx
import { ValidatorStrip } from './components/Debug/ValidatorStrip';
import { IntentPanel } from './components/Debug/IntentPanel';

// In JSX:
{settings.showValidator && (
  <>
    <ValidatorStrip />
    <IntentPanel />
  </>
)}
```

---

## Testing Checklist

### iPhone Toggles
- [ ] All toggles use iPhone-style component
- [ ] Custom accent color applies correctly
- [ ] Animations are smooth (25ms cubic-bezier)
- [ ] Disabled state works
- [ ] Focus state shows outline

### Animated Glows
- [ ] Left-to-right sweep on command start
- [ ] Bubble glow during processing
- [ ] Pass-off animation on completion
- [ ] Custom colors apply correctly
- [ ] No performance issues (60fps)

### DARPA Validator
- [ ] All event listeners are wrapped
- [ ] Autowraps are logged
- [ ] Violations are detected
- [ ] Strict mode flags unwrapped listeners
- [ ] Compliance strip changes color correctly
- [ ] Intent panel shows history
- [ ] Download log works
- [ ] No false positives

---

## Performance Considerations

1. **Validator Overhead**: Auto-wrapping adds ~0.1ms per event. With 100+ listeners, this is negligible.
2. **Animation Performance**: Use CSS transforms (hardware accelerated) not left/top.
3. **Intent Log Size**: Cap at 30 entries to prevent memory bloat.
4. **Render Updates**: Limit validator UI updates to 250ms intervals.

---

## Future Enhancements

1. **Export Validator Reports**: One-click export to JSON/HTML
2. **Violation Alerts**: Toast notifications for critical violations
3. **Intent Replay**: Replay recorded intents for debugging
4. **Performance Profiling**: Track frame times and long-running handlers
5. **Network Monitoring**: Track IPC call latencies

---

**Next Steps**: 
1. Add iPhone toggle styles to global CSS
2. Replace existing toggles in settings
3. Implement animated request bar glow
4. Create intentValidator.ts
5. Add ValidatorStrip and IntentPanel
6. Wire up all critical paths with intent tracking
