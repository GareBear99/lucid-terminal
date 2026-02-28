# Known Issues

## 🚨 CRITICAL ISSUES

### Issue #1: LLM Integration Architecture Mismatch

**Status**: 🔴 BLOCKING - Application non-functional for AI features  
**Severity**: Critical  
**Affects**: v1.0.0  
**GitHub**: https://github.com/GareBear99/lucid-terminal/issues/1

**Problem**: Lucid Terminal attempts to connect to Ollama API, but should use llamafile binaries like LuciferAI_Local.

**Symptoms**:
- Terminal hangs with "⏳ Connecting to LuciferAI plugin..."
- No LLM functionality works
- 0% offline capability (should be 72%)
- Cannot process AI commands

**Root Cause**: 
The entire LLM integration layer was built assuming Ollama, but LuciferAI_Local uses llamafile binaries assembled from split parts. This requires:
- Binary assembly from `bin/llamafile.part.*`
- Token generation checking
- Subprocess management
- Local-only operation

**Workaround**: None - AI features completely broken

**Fix ETA**: 8-12 hours of development

**Files Affected**:
- `electron/core/llm/ollamaClient.ts` (needs deletion)
- `electron/core/lucidCore.ts` (needs rewrite)
- `electron/core/routing/bypassRouter.ts` (needs update)

---

## ⚠️ NON-CRITICAL ISSUES

### TypeScript Type Warnings

**Status**: 🟡 NON-BLOCKING  
**Severity**: Low  
**Affects**: v1.0.0

**Problem**: Some TypeScript compilation warnings about missing IPC interface properties.

**Symptoms**:
- `npm run typecheck` shows type errors
- Application compiles and runs despite warnings
- Properties like `daemonLogs`, `fixnetSync`, `getStorageInfo` not in IPC interface

**Impact**: None - purely cosmetic type warnings

**Workaround**: Ignore warnings - doesn't affect functionality

**Fix ETA**: 30 minutes

---

## 📋 Planned Enhancements

These are not bugs, but planned features from the roadmap:

### Phase 3: FixNet Search UI
- Show quality grades in search results
- Display consensus scores
- Rank candidates by quality

### Phase 4: Execution Steps UI
- Real-time step progress component
- Collapsible step details
- Error states with retry indicators

### Phase 5: Streaming Token Display
- Token-by-token streaming for Tier 2+
- Progress indicators during generation
- Stall detection

### Phase 6: Quality Metrics Dashboard
- Fix quality distribution charts
- Success rate analytics
- Improvement recommendations

---

## 🐛 Reporting Issues

Found a bug? Please report it:

1. **Check existing issues**: https://github.com/GareBear99/lucid-terminal/issues
2. **Create new issue** with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - System info (OS, Node.js version)

**Security issues**: Please report privately via GitHub Security Advisories

---

**Last Updated**: 2026-02-28  
**Document Version**: 1.0.0
