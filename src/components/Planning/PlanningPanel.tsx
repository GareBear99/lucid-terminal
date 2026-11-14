import { X, FileText, Plus, ChevronRight, Calendar, User, Trash2, Check } from 'lucide-react';
import { Tooltip } from '../Tooltip/Tooltip';
import { useState } from 'react';
import {
  usePlanStore,
  planStatus,
  planStepCounts,
  type Plan,
} from '../../stores/planStore';

interface PlanningPanelProps {
  onClose: () => void;
}

export function PlanningPanel({ onClose }: PlanningPanelProps) {
  const plans = usePlanStore((s) => s.plans);
  const createPlan = usePlanStore((s) => s.createPlan);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const selectedPlan = selectedPlanId
    ? plans.find((p) => p.id === selectedPlanId) ?? null
    : null;

  const submitCreate = () => {
    const id = createPlan(newTitle, newDescription);
    if (id === null) return;
    setNewTitle('');
    setNewDescription('');
    setShowCreateForm(false);
    setSelectedPlanId(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-5xl h-[80vh] bg-[var(--bg-secondary)]/80 backdrop-blur-xl border border-[var(--border)] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-tertiary)]/60 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <FileText size={20} className="text-[var(--accent)]" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Planning
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Manage and track implementation plans
              </p>
            </div>
          </div>
          <Tooltip content="Close">
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[var(--bg-primary)]/70 transition-colors"
            >
              <X size={18} className="text-[var(--text-muted)]" />
            </button>
          </Tooltip>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Plans List */}
          {!selectedPlan && (
            <div className="w-full p-6 overflow-y-auto">
              {/* New Plan Button */}
              {!showCreateForm && (
                <button
                  data-testid="plan-create-toggle"
                  onClick={() => setShowCreateForm(true)}
                  className="w-full p-4 mb-4 rounded-lg border-2 border-dashed border-[var(--border)] 
                           hover:border-[var(--accent)] hover:bg-[var(--bg-primary)]/70 transition-all
                           flex items-center justify-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <Plus size={18} />
                  <span className="text-sm font-medium">Create New Plan</span>
                </button>
              )}

              {/* New Plan Form */}
              {showCreateForm && (
                <div className="w-full p-4 mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]/60 backdrop-blur-md">
                  <input
                    data-testid="plan-title-input"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitCreate();
                      if (e.key === 'Escape') setShowCreateForm(false);
                    }}
                    placeholder="Plan title"
                    className="w-full mb-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)]/60 border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                  />
                  <input
                    data-testid="plan-description-input"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitCreate();
                      if (e.key === 'Escape') setShowCreateForm(false);
                    }}
                    placeholder="Description (optional)"
                    className="w-full mb-3 px-3 py-2 rounded-lg bg-[var(--bg-secondary)]/60 border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      data-testid="plan-create-submit"
                      onClick={submitCreate}
                      disabled={!newTitle.trim()}
                      className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-sm font-medium text-white disabled:opacity-40"
                    >
                      Create plan
                    </button>
                    <button
                      data-testid="plan-create-cancel"
                      onClick={() => {
                        setShowCreateForm(false);
                        setNewTitle('');
                        setNewDescription('');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Plans Grid */}
              <div className="space-y-3">
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onClick={() => setSelectedPlanId(plan.id)}
                  />
                ))}
              </div>

              {/* Empty state */}
              {plans.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <FileText size={48} className="text-[var(--text-muted)] mb-4" />
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                    No plans yet
                  </h3>
                  <p className="text-sm text-[var(--text-muted)] max-w-md">
                    Create your first implementation plan to track progress on complex tasks
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Plan Detail View */}
          {selectedPlan && (
            <PlanDetail
              plan={selectedPlan}
              onBack={() => setSelectedPlanId(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Plan Detail View — real steps, progress, and delete. No
// placeholder content: every line here reads from the store.
function PlanDetail({ plan, onBack }: { plan: Plan; onBack: () => void }) {
  const addStep = usePlanStore((s) => s.addStep);
  const toggleStep = usePlanStore((s) => s.toggleStep);
  const deleteStep = usePlanStore((s) => s.deleteStep);
  const deletePlan = usePlanStore((s) => s.deletePlan);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { done, total } = planStepCounts(plan);
  const status = planStatus(plan);
  const createdDate = plan.created.slice(0, 10);

  const submitStep = () => {
    const id = addStep(plan.id, newStepTitle);
    if (id === null) return;
    setNewStepTitle('');
  };

  return (
    <div className="w-full flex flex-col overflow-hidden">
      {/* Plan Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-tertiary)]/60 backdrop-blur-md">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-3 transition-colors"
        >
          <ChevronRight size={14} className="rotate-180" />
          Back to all plans
        </button>
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
          {plan.title}
        </h3>
        {plan.description && (
          <p className="text-sm text-[var(--text-muted)] mb-3">
            {plan.description}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-1">
            <Calendar size={12} />
            {createdDate}
          </div>
          <div className="flex items-center gap-1">
            <User size={12} />
            You
          </div>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Plan Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-4">
          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-[var(--text-secondary)]">Progress</span>
              <span className="text-[var(--text-primary)] font-medium">
                {done}/{total} steps
              </span>
            </div>
            <div className="h-2 bg-[var(--bg-primary)]/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
              />
            </div>
          </div>

          {/* Steps */}
          {plan.steps.length === 0 ? (
            <div className="p-6 rounded-lg bg-[var(--bg-primary)]/60 backdrop-blur-md border border-[var(--border)] text-center">
              <FileText size={40} className="text-[var(--text-muted)] mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                No steps yet
              </h4>
              <p className="text-xs text-[var(--text-muted)]">
                Add the first step below to start tracking this plan
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {plan.steps.map((step) => (
                <li
                  key={step.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-primary)]/60 backdrop-blur-md border border-[var(--border)]"
                >
                  <button
                    data-testid={`plan-step-toggle-${step.id}`}
                    onClick={() => toggleStep(plan.id, step.id)}
                    aria-label={step.done ? `Mark "${step.title}" not done` : `Mark "${step.title}" done`}
                    className="shrink-0 w-5 h-5 rounded border border-[var(--border)] flex items-center justify-center text-white bg-[var(--bg-secondary)]/60 hover:border-[var(--accent)]"
                  >
                    {step.done && <Check size={14} className="text-[var(--accent)]" />}
                  </button>
                  <span
                    className={`flex-1 text-sm ${
                      step.done
                        ? 'line-through text-[var(--text-muted)]'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {step.title}
                  </span>
                  <button
                    data-testid={`plan-step-delete-${step.id}`}
                    onClick={() => deleteStep(plan.id, step.id)}
                    aria-label={`Delete step "${step.title}"`}
                    className="shrink-0 p-1 rounded hover:bg-[var(--bg-secondary)]/60 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Add Step */}
          <div className="flex items-center gap-2">
            <input
              data-testid="plan-step-input"
              value={newStepTitle}
              onChange={(e) => setNewStepTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitStep();
              }}
              placeholder="Add a step"
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-primary)]/60 border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
            />
            <button
              data-testid="plan-step-add"
              onClick={submitStep}
              disabled={!newStepTitle.trim()}
              className="px-3 py-2 rounded-lg bg-[var(--accent)] text-sm font-medium text-white disabled:opacity-40"
            >
              Add step
            </button>
          </div>

          {/* Delete Plan — two clicks: arm, then confirm. */}
          <div className="pt-2">
            <button
              data-testid="plan-delete"
              onClick={() => {
                if (confirmingDelete) {
                  deletePlan(plan.id);
                  onBack();
                } else {
                  setConfirmingDelete(true);
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/40 text-sm text-red-400 hover:bg-red-500/10"
            >
              <Trash2 size={14} />
              {confirmingDelete ? 'Click again to delete' : 'Delete plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Plan Card Component
function PlanCard({ plan, onClick }: { plan: Plan; onClick: () => void }) {
  const { done, total } = planStepCounts(plan);
  const progressPercent = total === 0 ? 0 : (done / total) * 100;

  return (
    <button
      data-testid={`plan-card-${plan.id}`}
      onClick={onClick}
      className="w-full p-4 rounded-lg bg-[var(--bg-primary)]/60 backdrop-blur-md border border-[var(--border)]
               hover:border-[var(--accent)] hover:shadow-md transition-all duration-200
               text-left group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1 group-hover:text-[var(--accent)] transition-colors">
            {plan.title}
          </h3>
          <p className="text-xs text-[var(--text-muted)] line-clamp-2">
            {plan.description}
          </p>
        </div>
        <ChevronRight size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors ml-2" />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusBadge status={planStatus(plan)} />
          <span className="text-xs text-[var(--text-muted)]">
            {done}/{total} steps
          </span>
        </div>
        
        {/* Mini Progress Bar */}
        <div className="w-20 h-1.5 bg-[var(--bg-secondary)]/60 rounded-full overflow-hidden">
          <div 
            className="h-full bg-[var(--accent)] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </button>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: 'draft' | 'in-progress' | 'completed' }) {
  const colors = {
    draft: 'text-gray-400 bg-gray-400/10',
    'in-progress': 'text-blue-400 bg-blue-400/10',
    completed: 'text-green-400 bg-green-400/10'
  };

  const labels = {
    draft: 'Draft',
    'in-progress': 'In Progress',
    completed: 'Completed'
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}
