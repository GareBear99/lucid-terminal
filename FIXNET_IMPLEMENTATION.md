# FixNet + LLM Management Implementation for Lucid Terminal

## ✅ Completed: FixNet Core System (Phase 1)

### Components Built
1. **fixDictionary.ts** (415 lines) - Storage layer
   - Local fix storage with keyword indexing
   - Script tracking (every script that receives a fix)
   - Context branching for variants
   - Fast keyword search (<20ms)
   - No LLM required for storage/retrieval

2. **consensusEngine.ts** (313 lines) - Validation layer
   - Multi-factor scoring: success (50%), network (20%), context (15%), recency (15%)
   - Trust levels: Highly Trusted (75%+), Trusted (51-74%), Experimental (30-50%), Quarantined (<30%)
   - Cached consensus calculation (<50ms)
   - Safe-to-use validation

3. **offlineMatcher.ts** (305 lines) - Template matching
   - Standard library templates (fs, path, os, json, etc.)
   - Regex pattern matching
   - Dictionary keyword search
   - 72% offline functionality (no LLM)
   - <100ms total execution time

4. **fixnetRouter.ts** (343 lines) - Main orchestrator
   - Tier-based routing (Tier 0-4)
   - Complete fix workflow
   - Statistics and reporting
   - Consensus integration

## 🚀 Phase 2: LLM Management System

### Required: Model Registry Integration

From LuciferAI's `_handle_llm_list()` (line 8049-8183), we need:

```typescript
// electron/core/llm/llmManager.ts

export interface LLMStatus {
  name: string;
  canonical_name: string;
  tier: number;
  installed: boolean;
  enabled: boolean;
  corrupted: boolean;
  file_path?: string;
  size_mb?: number;
  expected_size_mb?: number;
  status_icon: string; // "✓ Installed" | "✗ Not installed"
  enabled_icon: string; // "✓ Enabled" | "✗ Disabled"
}

export interface LLMCategory {
  core_bundled: LLMStatus[];
  other_installed: LLMStatus[];
  custom_models: LLMStatus[];
}

export class LLMManager {
  private llmState: Map<string, boolean>; // model -> enabled
  private availableModels: string[];
  private modelTiers: ModelTierRegistry; // from modelTiers.ts
  
  /**
   * List all LLMs with installation and enable status
   */
  listAllLLMs(): LLMCategory {
    // Check each model:
    // 1. Is it installed? (file exists)
    // 2. Is it enabled? (llmState[model] === true)
    // 3. Is it corrupted? (size mismatch > 5%)
  }
  
  /**
   * Enable an LLM (makes it available for bypass routing)
   */
  enableLLM(modelName: string): {success: boolean, message: string} {
    // 1. Check if installed
    // 2. Set llmState[canonicalName] = true
    // 3. Persist to ~/.lucid/llm_state.json
    // 4. Update active model via _selectBestEnabledModel()
  }
  
  /**
   * Disable an LLM (removes from bypass routing)
   */
  disableLLM(modelName: string): {success: boolean, message: string} {
    // 1. Set llmState[canonicalName] = false
    // 2. Persist to ~/.lucid/llm_state.json
    // 3. Update active model
  }
  
  /**
   * Get bypass routing path for current request
   */
  getBypassRoute(complexity: string): {
    bypassed: string[]; // Lower-tier models skipped
    selected: string;   // Model being used
    tier: number;       // Tier of selected model
    reason: string;     // Why this tier was chosen
  }
}
```

### Required: Main Menu Display

From LuciferAI's `_handle_main_menu()` (line 4108-4517):

```typescript
// electron/core/menu/mainMenu.ts

export function displayMainMenu(llmManager: LLMManager): string {
  // 1. Show system status
  console.log("✅ Enhanced Lucid Terminal Active");
  console.log("✅ Authentication system loaded");
  console.log(`🔄 FixNet Synced: ${fixnet.getStats().total_fixes} fixes`);
  
  // 2. Show WiFi status
  console.log("📡 WiFi: Connected to [SSID]");
  
  // 3. Show active LLMs with bypass routing
  const activeModels = llmManager.getEnabledModels();
  
  if (activeModels.length === 0) {
    console.log("🚨 No AI Models Detected");
    console.log("Get Started:");
    console.log("  [1] Install AI Platform - Install Ollama + models");
    console.log("  [2] View Help - See all commands");
    console.log("  [3] FixNet Stats - View offline fix database");
  } else if (activeModels.length < 6) {
    console.log(`✅ Installed: ${activeModels.join(', ')}`);
    console.log("Quick Actions:");
    console.log("  [1] Models Info - Compare capabilities");
    console.log("  [2] Install Missing Models");
    console.log("  [3] LLM Management - Enable/disable models");
    console.log("  [4] FixNet Stats");
  } else {
    // Full suite installed - show tier-based routing
    console.log("✨ Full Local AI Suite Active (Tiers 0-4)");
    console.log("  • phi-2 - Tier 0: Fast basic responses");
    console.log("  • tinyllama - Tier 0: Quick chat");
    console.log("  • gemma2 - Tier 1: Balanced performance");
    console.log("  • mistral - Tier 2: Advanced reasoning");
    console.log("  • deepseek-coder - Tier 3: Expert coding");
    console.log("  • llama3.1-70b - Tier 4: Ultra-expert (70B)");
    
    console.log("\nQuick Actions:");
    console.log("  [1] Models Info");
    console.log("  [2] LLM Management - Enable/disable models");
    console.log("  [3] FixNet Stats - View offline fixes");
    console.log("  [4] Bypass Routing - See how models are selected");
  }
  
  console.log("\n  [0] Return to Prompt");
}
```

### Required: Bypass Routing Display

From LuciferAI's `_handle_single_task_with_llm()` (line 9510-9554):

```typescript
// When executing a task, show bypass routing:

export function showBypassRouting(llmManager: LLMManager, taskComplexity: string): void {
  const route = llmManager.getBypassRoute(taskComplexity);
  
  if (route.bypassed.length > 0) {
    // Show which models were skipped
    const skippedParts = route.bypassed.map(model => {
      const tier = llmManager.getModelTier(model);
      return `${model} (Tier ${tier})`;
    });
    
    console.log(`💡 Bypassed: ${skippedParts.join(', ')}`);
  }
  
  // Show which model is being used
  console.log(`🧠 Using ${route.selected} (Tier ${route.tier})`);
  console.log(`📋 Reason: ${route.reason}`);
  console.log();
}

// Example outputs:

// Simple task:
// 🧠 Using gemma2 (Tier 1)
// 📋 Reason: Standard fix generation

// Complex refactoring:
// 💡 Bypassed: tinyllama (Tier 0), phi-2 (Tier 0), gemma2 (Tier 1)
// 🧠 Using mistral (Tier 2)
// 📋 Reason: Advanced: Complex fixes or cross-cutting changes

// Expert security analysis:
// 💡 Bypassed: tinyllama (Tier 0), phi-2 (Tier 0), gemma2 (Tier 1), mistral (Tier 2)
// 🧠 Using deepseek-coder (Tier 3)
// 📋 Reason: Expert-level: Complex architectural change or security analysis

// Ultra-complex enterprise architecture:
// 💡 Bypassed: tinyllama (Tier 0), phi-2 (Tier 0), gemma2 (Tier 1), mistral (Tier 2), deepseek-coder (Tier 3)
// 🧠 Using llama3.1-70b (Tier 4)
// 📋 Reason: Ultra-complex: Requires research-grade validation
```

## 🎯 Phase 3: Command Router Integration

### Add commands to `commandRouter.ts`:

```typescript
// FixNet commands
if (command.startsWith('fixnet ')) {
  return executeCommandAsTool('fixnet', args);
}

if (command === 'fixnet stats') {
  // Show FixNet statistics
  const stats = fixnetRouter.formatStats();
  return {
    success: true,
    output: stats,
    metadata: { command: 'fixnet.stats' }
  };
}

if (command.startsWith('fixnet search ')) {
  const query = command.substring('fixnet search '.length);
  const fixes = fixnetRouter.searchFixes(query, 10);
  return {
    success: true,
    output: formatFixResults(fixes),
    metadata: { command: 'fixnet.search', query }
  };
}

// LLM Management commands
if (command === 'llm list') {
  const status = llmManager.listAllLLMs();
  return {
    success: true,
    output: formatLLMList(status),
    metadata: { command: 'llm.list' }
  };
}

if (command.startsWith('llm enable ')) {
  const model = command.substring('llm enable '.length);
  return llmManager.enableLLM(model);
}

if (command.startsWith('llm disable ')) {
  const model = command.substring('llm disable '.length);
  return llmManager.disableLLM(model);
}

// Main menu
if (command === 'mainmenu' || command === 'main menu') {
  return displayMainMenu(llmManager);
}
```

## 📊 Phase 4: Help Page Updates

Add to `helpGrammar.ts`:

```typescript
const FIXNET_COMMANDS = [
  {
    name: 'fixnet stats',
    description: 'Show FixNet statistics and offline fix database',
    category: 'FixNet',
    examples: ['fixnet stats']
  },
  {
    name: 'fixnet search <query>',
    description: 'Search for fixes by error message or keywords',
    category: 'FixNet',
    examples: ['fixnet search "import error"', 'fixnet search fs not defined']
  },
  {
    name: 'fixnet apply <fix_hash>',
    description: 'Apply a specific fix from the database',
    category: 'FixNet',
    examples: ['fixnet apply abc123']
  },
  {
    name: 'fixnet report <fix_hash> <success|failure>',
    description: 'Report whether a fix worked (updates consensus)',
    category: 'FixNet',
    examples: ['fixnet report abc123 success']
  }
];

const LLM_COMMANDS = [
  {
    name: 'llm list',
    description: 'Show all installed LLMs with enable/disable status',
    category: 'LLM Management',
    examples: ['llm list']
  },
  {
    name: 'llm list all',
    description: 'Show ALL 85+ supported models organized by tier',
    category: 'LLM Management',
    examples: ['llm list all']
  },
  {
    name: 'llm enable <model>',
    description: 'Enable an LLM for bypass routing',
    category: 'LLM Management',
    examples: ['llm enable mistral', 'llm enable phi-2']
  },
  {
    name: 'llm disable <model>',
    description: 'Disable an LLM (removes from bypass routing)',
    category: 'LLM Management',
    examples: ['llm disable tinyllama']
  },
  {
    name: 'models info',
    description: 'Detailed comparison of all model capabilities',
    category: 'LLM Management',
    examples: ['models info']
  }
];
```

## 🔄 Phase 5: Integration with Intent Parser

Update `intentParser.ts` to check FixNet first:

```typescript
export class IntentParser {
  private fixnetRouter: FixNetRouter;
  
  async parseIntent(userInput: string): Promise<ParsedIntent> {
    // 1. Check if this is an error/fix request
    if (this.looksLikeError(userInput)) {
      const offlineResult = this.fixnetRouter.findFix({ error: userInput });
      
      if (offlineResult.success && !offlineResult.needs_llm) {
        // Can fix offline - no LLM needed!
        return {
          intent: 'apply_fix',
          confidence: offlineResult.confidence,
          needsLLM: false,
          action: 'fixnet.apply',
          target: offlineResult.fix
        };
      }
    }
    
    // 2. Standard intent parsing...
    // 3. If needs LLM, get bypass routing recommendation
    if (needsLLM) {
      const tier = this.fixnetRouter.getTierRecommendation(userInput);
      return {
        intent: parsed.intent,
        confidence: parsed.confidence,
        needsLLM: true,
        recommendedTier: tier.tier,
        tierReason: tier.reason
      };
    }
  }
  
  private looksLikeError(input: string): boolean {
    const errorKeywords = [
      'error', 'exception', 'fail', 'crash', 'bug',
      'not defined', 'not found', 'cannot find', 'undefined',
      'missing', 'invalid', 'syntax error', 'reference error'
    ];
    return errorKeywords.some(kw => input.toLowerCase().includes(kw));
  }
}
```

## 📝 Phase 6: Testing

Create `tests/fixnet_test.ts`:

```typescript
describe('FixNet System', () => {
  test('Offline fix for standard library import', async () => {
    const result = await fixnet.findFix({ error: 'fs is not defined' });
    expect(result.success).toBe(true);
    expect(result.needs_llm).toBe(false);
    expect(result.source).toBe('offline');
    expect(result.execution_time_ms).toBeLessThan(100);
  });
  
  test('Consensus validation', () => {
    const fix = fixnet.getBestFix('import error');
    expect(fix).toBeDefined();
    expect(fix.consensus.trust_level).toBeOneOf(['trusted', 'highly_trusted']);
  });
  
  test('Bypass routing for complex task', () => {
    const route = llmManager.getBypassRoute('refactor architecture');
    expect(route.tier).toBeGreaterThanOrEqual(2); // Tier 2+ for refactoring
    expect(route.bypassed.length).toBeGreaterThan(0);
  });
});
```

## 🎯 Success Metrics

- ✅ 72% of fixes execute offline without LLM (<100ms)
- ✅ Main menu shows active LLMs with enable/disable status
- ✅ Bypass routing displays which models were skipped
- ✅ Consensus validation ensures fix quality (51%+ success rate)
- ✅ Every script tracked in script_counters
- ✅ Every fix stored with keywords for fast search
- ✅ LLM enable/disable persists across sessions
- ✅ Tier-based routing selects best model for task complexity

## 📚 File Structure

```
lucid-terminal/
├── electron/core/
│   ├── fixnet/
│   │   ├── fixDictionary.ts       ✅ Complete (415 lines)
│   │   ├── consensusEngine.ts     ✅ Complete (313 lines)
│   │   ├── offlineMatcher.ts      ✅ Complete (305 lines)
│   │   ├── fixnetRouter.ts        ✅ Complete (343 lines)
│   │   └── index.ts               ✅ Complete (22 lines)
│   ├── llm/
│   │   ├── llmManager.ts          ⏳ Next (est. 400 lines)
│   │   └── bypassRouter.ts        ⏳ Next (est. 200 lines)
│   ├── menu/
│   │   └── mainMenu.ts            ⏳ Next (est. 300 lines)
│   ├── models/
│   │   └── modelTiers.ts          ✅ Complete (408 lines)
│   ├── parser/
│   │   └── intentParser.ts        ✅ Complete (529 lines)
│   └── commandRouter.ts           🔄 Update needed
├── tests/
│   └── fixnet_test.ts             ⏳ Next (est. 200 lines)
└── ~/.lucid/
    ├── fixnet/data/
    │   ├── fix_dictionary.json    (Auto-created)
    │   ├── script_counters.json   (Auto-created)
    │   ├── keyword_index.json     (Auto-created)
    │   └── context_branches.json  (Auto-created)
    └── llm_state.json             (Auto-created)
```

## 🚀 Next Steps

1. **Create LLMManager** - Model enable/disable with persistence
2. **Create BypassRouter** - Show which models were skipped
3. **Create MainMenu** - Display active LLMs and options
4. **Update CommandRouter** - Add fixnet and llm commands
5. **Update IntentParser** - Check FixNet before calling LLM
6. **Create Tests** - Validate offline functionality
7. **Documentation** - User guide for FixNet + LLM management

Ready to proceed with Phase 2?
