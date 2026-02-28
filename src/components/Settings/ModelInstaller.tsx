import { useState, useEffect } from 'react';
import { Download, Check, Loader, HardDrive, Trash2 } from 'lucide-react';

interface Model {
  name: string;
  displayName: string;
  size: string;
  tier: number;
  installed: boolean;
  enabled: boolean;
  downloading: boolean;
}

interface ModelTier {
  tier: number;
  label: string;
  description: string;
  color: string;
  models: Model[];
}

// Core dependencies (Tier 0-2 essentials)
const CORE_MODELS = ['tinyllama', 'phi-2', 'gemma2:2b', 'mistral'];

export function ModelInstaller() {
const [tiers, setTiers] = useState<ModelTier[]>([
    {
      tier: 0,
      label: 'Tier 0 - Nano ⚡',
      description: 'Core dependencies: Ultra-fast, minimal memory (<1.5GB)',
      color: '#7ee787',
      models: [
        { name: 'tinyllama', displayName: '⭐ TinyLlama 1.1B (Core)', size: '637 MB', tier: 0, installed: false, enabled: false, downloading: false },
        { name: 'phi-2', displayName: '⭐ Phi-2 2.7B (Core)', size: '1.6 GB', tier: 0, installed: false, enabled: false, downloading: false },
        { name: 'qwen2.5:0.5b', displayName: 'Qwen 2.5 0.5B', size: '395 MB', tier: 0, installed: false, enabled: false, downloading: false },
        { name: 'stablelm2:1.6b', displayName: 'StableLM 2 1.6B', size: '984 MB', tier: 0, installed: false, enabled: false, downloading: false },
      ]
    },
    {
      tier: 1,
      label: 'Tier 1 - Small 🚀',
      description: 'Recommended for dev: Great balance of speed/quality (1.5-3.5GB)',
      color: '#79c0ff',
      models: [
        { name: 'gemma2:2b', displayName: '⭐ Gemma 2 2B (Core)', size: '1.6 GB', tier: 1, installed: false, enabled: false, downloading: false },
        { name: 'qwen2.5:1.5b', displayName: 'Qwen 2.5 1.5B', size: '934 MB', tier: 1, installed: false, enabled: false, downloading: false },
        { name: 'phi-3:3.8b', displayName: 'Phi-3 Mini 3.8B', size: '2.2 GB', tier: 1, installed: false, enabled: false, downloading: false },
        { name: 'llama3.2:3b', displayName: 'Llama 3.2 3B', size: '2.0 GB', tier: 1, installed: false, enabled: false, downloading: false },
        { name: 'aya:8b', displayName: 'Aya 8B (Multilingual)', size: '4.8 GB', tier: 1, installed: false, enabled: false, downloading: false },
      ]
    },
    {
      tier: 2,
      label: 'Tier 2 - Medium 💪',
      description: 'Production-ready: Excellent quality (4-8GB)',
      color: '#d29922',
      models: [
        { name: 'mistral', displayName: '⭐ Mistral 7B (Core)', size: '4.1 GB', tier: 2, installed: false, enabled: false, downloading: false },
        { name: 'llama3.1:8b', displayName: 'Llama 3.1 8B', size: '4.7 GB', tier: 2, installed: false, enabled: false, downloading: false },
        { name: 'llama3.2:1b', displayName: 'Llama 3.2 1B', size: '1.3 GB', tier: 2, installed: false, enabled: false, downloading: false },
        { name: 'gemma:7b', displayName: 'Gemma 7B', size: '4.8 GB', tier: 2, installed: false, enabled: false, downloading: false },
        { name: 'qwen2.5:7b', displayName: 'Qwen 2.5 7B', size: '4.7 GB', tier: 2, installed: false, enabled: false, downloading: false },
        { name: 'mistral-nemo', displayName: 'Mistral Nemo 12B', size: '7.1 GB', tier: 2, installed: false, enabled: false, downloading: false },
        { name: 'codellama:7b', displayName: 'Code Llama 7B', size: '3.8 GB', tier: 2, installed: false, enabled: false, downloading: false },
      ]
    },
    {
      tier: 3,
      label: 'Tier 3 - Large 🔥',
      description: 'High performance: Complex reasoning (10-25GB)',
      color: '#ff7b72',
      models: [
        { name: 'llama3.1:13b', displayName: 'Llama 3.1 13B', size: '7.4 GB', tier: 3, installed: false, enabled: false, downloading: false },
        { name: 'deepseek-coder:6.7b', displayName: 'DeepSeek Coder 6.7B', size: '3.8 GB', tier: 3, installed: false, enabled: false, downloading: false },
        { name: 'codellama:13b', displayName: 'Code Llama 13B', size: '7.4 GB', tier: 3, installed: false, enabled: false, downloading: false },
        { name: 'wizard-vicuna:13b', displayName: 'Wizard Vicuna 13B', size: '7.4 GB', tier: 3, installed: false, enabled: false, downloading: false },
        { name: 'mixtral:8x7b', displayName: 'Mixtral 8x7B MoE', size: '26 GB', tier: 3, installed: false, enabled: false, downloading: false },
        { name: 'qwen2.5:14b', displayName: 'Qwen 2.5 14B', size: '9.0 GB', tier: 3, installed: false, enabled: false, downloading: false },
        { name: 'solar:10.7b', displayName: 'Solar 10.7B', size: '6.1 GB', tier: 3, installed: false, enabled: false, downloading: false },
      ]
    },
    {
      tier: 4,
      label: 'Tier 4 - Extreme 🚀',
      description: 'Frontier models: SOTA performance (20GB+, requires 32GB+ RAM)',
      color: '#bc8cff',
      models: [
        { name: 'llama3.1:70b', displayName: 'Llama 3.1 70B', size: '40 GB', tier: 4, installed: false, enabled: false, downloading: false },
        { name: 'llama3.1:405b', displayName: 'Llama 3.1 405B', size: '231 GB', tier: 4, installed: false, enabled: false, downloading: false },
        { name: 'deepseek-coder:33b', displayName: 'DeepSeek Coder 33B', size: '19 GB', tier: 4, installed: false, enabled: false, downloading: false },
        { name: 'codellama:34b', displayName: 'Code Llama 34B', size: '19 GB', tier: 4, installed: false, enabled: false, downloading: false },
        { name: 'qwen2.5:32b', displayName: 'Qwen 2.5 32B', size: '19 GB', tier: 4, installed: false, enabled: false, downloading: false },
        { name: 'qwen2.5:72b', displayName: 'Qwen 2.5 72B', size: '41 GB', tier: 4, installed: false, enabled: false, downloading: false },
        { name: 'mixtral:8x22b', displayName: 'Mixtral 8x22B MoE', size: '80 GB', tier: 4, installed: false, enabled: false, downloading: false },
      ]
    }
  ]);

  const [installingCore, setInstallingCore] = useState(false);
  const [storageInfo, setStorageInfo] = useState({ used: '0 GB', available: '0 GB' });

  useEffect(() => {
    // Load installed models from backend
    loadInstalledModels();
    loadStorageInfo();
  }, []);

  const loadInstalledModels = async () => {
    try {
      const result = await window.lucidAPI.lucid.llmList();
      if (result.success && result.models) {
        setTiers(prev => prev.map(tier => ({
          ...tier,
          models: tier.models.map(model => {
            const installedModel = result.models.find((m: any) => m.name === model.name);
            return {
              ...model,
              installed: !!installedModel,
              enabled: installedModel?.enabled || false
            };
          })
        })));
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const loadStorageInfo = async () => {
    try {
      const result = await window.lucidAPI.lucid.getStorageInfo();
      if (result.success) {
        setStorageInfo(result.storage);
      }
    } catch (error) {
      console.error('Failed to load storage info:', error);
    }
  };

  const installModel = async (modelName: string, tierIndex: number, modelIndex: number) => {
    setTiers(prev => {
      const newTiers = [...prev];
      newTiers[tierIndex].models[modelIndex].downloading = true;
      return newTiers;
    });

    try {
      await window.lucidAPI.lucid.installModel(modelName);
      setTiers(prev => {
        const newTiers = [...prev];
        newTiers[tierIndex].models[modelIndex].downloading = false;
        newTiers[tierIndex].models[modelIndex].installed = true;
        return newTiers;
      });
      await loadStorageInfo();
    } catch (error) {
      console.error('Failed to install model:', error);
      setTiers(prev => {
        const newTiers = [...prev];
        newTiers[tierIndex].models[modelIndex].downloading = false;
        return newTiers;
      });
    }
  };

  const uninstallModel = async (modelName: string, tierIndex: number, modelIndex: number) => {
    try {
      await window.lucidAPI.lucid.uninstallModel(modelName);
      setTiers(prev => {
        const newTiers = [...prev];
        newTiers[tierIndex].models[modelIndex].installed = false;
        newTiers[tierIndex].models[modelIndex].enabled = false;
        return newTiers;
      });
      await loadStorageInfo();
    } catch (error) {
      console.error('Failed to uninstall model:', error);
    }
  };

  const toggleModel = async (modelName: string, enabled: boolean, tierIndex: number, modelIndex: number) => {
    try {
      await window.lucidAPI.lucid.llmSetEnabled(modelName, !enabled);
      setTiers(prev => {
        const newTiers = [...prev];
        newTiers[tierIndex].models[modelIndex].enabled = !enabled;
        return newTiers;
      });
    } catch (error) {
      console.error('Failed to toggle model:', error);
    }
  };

  const installCoreModels = async () => {
    setInstallingCore(true);
    try {
      await window.lucidAPI.lucid.installCoreModels();
      await loadInstalledModels();
      await loadStorageInfo();
    } catch (error) {
      console.error('Failed to install core models:', error);
    } finally {
      setInstallingCore(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Storage Info */}
      <section className="bg-[var(--bg-tertiary)] rounded-lg p-4 border border-[var(--border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive size={18} className="text-[var(--accent)]" />
            <h3 className="text-sm font-semibold">Model Storage</h3>
          </div>
          <div className="text-sm text-[var(--text-muted)]">
            <span className="font-mono">{storageInfo.used}</span> used
            <span className="mx-2">•</span>
            <span className="font-mono">{storageInfo.available}</span> available
          </div>
        </div>
      </section>

      {/* Install Core Dependencies */}
      <section>
        <div className="bg-gradient-to-r from-[var(--accent)]/10 to-transparent rounded-lg p-4 border border-[var(--accent)]/30 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold mb-1">Core Dependencies</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Install essential models: {CORE_MODELS.join(', ')} (~8GB total)
              </p>
            </div>
            <button
              onClick={installCoreModels}
              disabled={installingCore}
              className="btn btn-primary flex items-center gap-2"
            >
              {installingCore ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  Installing...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Install Core
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Model Tiers */}
      {tiers.map((tier, tierIndex) => (
        <section key={tier.tier}>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-1 h-6 rounded-full"
              style={{ backgroundColor: tier.color }}
            />
            <div>
              <h3 className="text-sm font-semibold" style={{ color: tier.color }}>
                {tier.label}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">{tier.description}</p>
            </div>
          </div>

          <div className="space-y-2 ml-4">
            {tier.models.map((model, modelIndex) => (
              <div
                key={model.name}
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] hover:border-[var(--text-muted)] transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{model.displayName}</span>
                    {model.installed && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 font-mono">
                        INSTALLED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-1">
                    <span className="font-mono">{model.size}</span>
                    <span>•</span>
                    <span>{model.name}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {model.installed && (
                    <label className="flex items-center gap-2 cursor-pointer mr-2">
                      <input
                        type="checkbox"
                        checked={model.enabled}
                        onChange={() => toggleModel(model.name, model.enabled, tierIndex, modelIndex)}
                        className="rounded"
                      />
                      <span className="text-xs">Enabled</span>
                    </label>
                  )}

                  {model.downloading ? (
                    <div className="flex items-center gap-2 text-[var(--accent)]">
                      <Loader size={14} className="animate-spin" />
                      <span className="text-xs">Downloading...</span>
                    </div>
                  ) : model.installed ? (
                    <button
                      onClick={() => uninstallModel(model.name, tierIndex, modelIndex)}
                      className="btn-ghost p-1.5 rounded text-red-500 hover:bg-red-500/10"
                      title="Uninstall model"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => installModel(model.name, tierIndex, modelIndex)}
                      className="btn btn-secondary text-xs px-3 py-1 flex items-center gap-1"
                    >
                      <Download size={12} />
                      Install
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
