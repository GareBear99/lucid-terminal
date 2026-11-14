import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  defaultToolPermission,
  type AgentToolPermission,
} from '../../lib/agentPermissions';
import { getBuiltInToolDefinitions } from '../../lib/agentToolsImpl';
import { useAgentPermissionStore } from '../../stores/agentPermissionStore';

/**
 * Agent Permissions — the Settings surface over the agent
 * permission store (steal #6 — Zed). This is the user-facing
 * side of the permission model: what the agent may do
 * unsupervised, per tool and per path rule.
 *
 * The store is the single source of truth (the loop reads it
 * at run start) — this tab only edits it. It does NOT duplicate
 * the permissions into Settings: one model, one place.
 *
 * - Auto: the tool runs without asking.
 * - Ask: the tool pauses for Keep/Reject, with its diff.
 * - Deny: the tool never runs (the loop reports it blocked).
 * A tool with no override runs its default — readonly tools
 * auto-run, write tools ask. The default is shown in the row
 * so an empty row still says what happens.
 */
const PERMISSION_LABELS: Record<AgentToolPermission, string> = {
  auto: 'Auto',
  ask: 'Ask',
  deny: 'Deny',
};

export function AgentPermissionsTab() {
  const tools = useAgentPermissionStore((s) => s.tools);
  const rules = useAgentPermissionStore((s) => s.rules);
  const setToolPermission = useAgentPermissionStore((s) => s.setToolPermission);
  const addRule = useAgentPermissionStore((s) => s.addRule);
  const removeRule = useAgentPermissionStore((s) => s.removeRule);
  const resetPermissions = useAgentPermissionStore((s) => s.resetPermissions);
  const [newPattern, setNewPattern] = useState('');
  // A rule is 'auto' or 'deny' only — it never says 'ask'
  // (that is the default).
  const [newPermission, setNewPermission] = useState<'auto' | 'deny'>('deny');
  const [newTools, setNewTools] = useState('');

  const definitions = getBuiltInToolDefinitions();

  const addNewRule = () => {
    const pattern = newPattern.trim();
    if (!pattern) return;
    const ruleTools = newTools
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    addRule({
      id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      pattern,
      permission: newPermission,
      tools: ruleTools.length > 0 ? ruleTools : undefined,
    });
    setNewPattern('');
    setNewTools('');
  };

  return (
    <div className="space-y-6" data-testid="agent-permissions-tab">
      <section>
        <h3 className="text-sm font-medium flex items-center gap-2">
          <ShieldCheck size={16} /> Agent permissions
        </h3>
        <p className="text-xs opacity-70 mt-1">
          What the agent may do without asking. A write the agent asks about shows its diff
          first — Keep lands it, Reject stops it, and a checkpoint lets you undo a kept edit.
          Deny beats Auto; a path rule beats a per-tool setting.
        </p>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-medium opacity-80">Per tool</h4>
        {definitions.map((definition) => {
          const name = definition.function.name;
          const def = defaultToolPermission(definition);
          const current = tools[name];
          return (
            <div key={name} className="flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs truncate" data-testid={`agent-permission-tool-${name}`}>
                  {name}
                </div>
                <div className="text-xs opacity-60 truncate">
                  {definition.function.description ?? ''}
                </div>
              </div>
              <select
                aria-label={`Permission for ${name}`}
                data-testid={`agent-permission-select-${name}`}
                className="bg-transparent border border-[var(--border)] rounded px-2 py-1 text-xs"
                value={current ?? ''}
                onChange={(e) => {
                  const value = e.target.value as '' | AgentToolPermission;
                  // Picking the default clears the override — the
                  // store drops a tool whose permission equals its
                  // default, so the row stays honest.
                  setToolPermission(name, value === '' ? def : value);
                }}
              >
                <option value="">{`${PERMISSION_LABELS[def]} (default)`}</option>
                <option value="auto">Auto</option>
                <option value="ask">Ask</option>
                <option value="deny">Deny</option>
              </select>
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-medium opacity-80">Path rules</h4>
        <p className="text-xs opacity-70">
          A rule matches a tool call by the path it touches (a regex on the file path).
          Deny beats Auto; the first rule is not the winner — the strongest permission wins.
          Leave the tools blank to apply the rule to every tool.
        </p>
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-2 text-sm" data-testid="agent-permission-rule">
            <span className="font-mono text-xs truncate flex-1">{rule.pattern}</span>
            <span className="text-xs opacity-70">
              {rule.tools ? rule.tools.join(', ') : 'all tools'}
            </span>
            <select
              aria-label={`Permission for rule ${rule.pattern}`}
              className="bg-transparent border border-[var(--border)] rounded px-2 py-1 text-xs"
              value={rule.permission}
              // addRule replaces a rule with the same id, so this
              // is the update path — no separate setRule exists.
              onChange={(e) => addRule({ ...rule, permission: e.target.value as 'auto' | 'deny' })}
            >
              <option value="auto">Auto</option>
              <option value="deny">Deny</option>
            </select>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-[var(--border)] opacity-80 hover:opacity-100"
              onClick={() => removeRule(rule.id)}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            aria-label="New rule pattern"
            data-testid="agent-permission-new-pattern"
            className="flex-1 min-w-0 bg-transparent border border-[var(--border)] rounded px-2 py-1 text-xs font-mono"
            placeholder="e.g. src/lib"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
          />
          <input
            aria-label="New rule tools"
            data-testid="agent-permission-new-tools"
            className="w-32 bg-transparent border border-[var(--border)] rounded px-2 py-1 text-xs font-mono"
            placeholder="tools, optional"
            value={newTools}
            onChange={(e) => setNewTools(e.target.value)}
          />
          <select
            aria-label="New rule permission"
            className="bg-transparent border border-[var(--border)] rounded px-2 py-1 text-xs"
            value={newPermission}
            onChange={(e) => setNewPermission(e.target.value as 'auto' | 'deny')}
          >
            <option value="auto">Auto</option>
            <option value="deny">Deny</option>
          </select>
          <button
            type="button"
            data-testid="agent-permission-add-rule"
            className="text-xs px-2 py-1 rounded border border-[var(--border)] opacity-80 hover:opacity-100"
            onClick={addNewRule}
          >
            Add rule
          </button>
        </div>
      </section>

      <button
        type="button"
        data-testid="agent-permission-reset"
        className="text-xs px-3 py-1.5 rounded border border-[var(--border)] opacity-80 hover:opacity-100"
        onClick={() => resetPermissions()}
      >
        Reset all to defaults
      </button>
    </div>
  );
}
