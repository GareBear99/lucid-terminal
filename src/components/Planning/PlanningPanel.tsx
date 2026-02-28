import { X, FileText, Plus, ChevronRight, Calendar, User } from 'lucide-react';
import { useState } from 'react';

interface PlanningPanelProps {
  onClose: () => void;
}

interface Plan {
  id: string;
  title: string;
  description: string;
  created: string;
  status: 'draft' | 'in-progress' | 'completed';
  steps: number;
  completedSteps: number;
}

// Placeholder data
const PLACEHOLDER_PLANS: Plan[] = [
  {
    id: '1',
    title: 'FixNet VPS Integration',
    description: 'Deploy batch upload server to BotFortress',
    created: '2026-02-27',
    status: 'draft',
    steps: 5,
    completedSteps: 0
  },
  {
    id: '2',
    title: 'Account System Implementation',
    description: 'Add user ID display and GitHub integration',
    created: '2026-02-27',
    status: 'completed',
    steps: 6,
    completedSteps: 6
  }
];

export function PlanningPanel({ onClose }: PlanningPanelProps) {
  const [plans] = useState<Plan[]>(PLACEHOLDER_PLANS);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-5xl h-[80vh] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
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
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--bg-primary)] transition-colors"
            title="Close"
          >
            <X size={18} className="text-[var(--text-muted)]" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Plans List */}
          {!selectedPlan && (
            <div className="w-full p-6 overflow-y-auto">
              {/* New Plan Button */}
              <button
                className="w-full p-4 mb-4 rounded-lg border-2 border-dashed border-[var(--border)] 
                         hover:border-[var(--accent)] hover:bg-[var(--bg-primary)] transition-all
                         flex items-center justify-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <Plus size={18} />
                <span className="text-sm font-medium">Create New Plan</span>
              </button>

              {/* Plans Grid */}
              <div className="space-y-3">
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onClick={() => setSelectedPlan(plan)}
                  />
                ))}
              </div>

              {/* Placeholder Message */}
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
            <div className="w-full flex flex-col overflow-hidden">
              {/* Plan Header */}
              <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
                <button
                  onClick={() => setSelectedPlan(null)}
                  className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-3 transition-colors"
                >
                  <ChevronRight size={14} className="rotate-180" />
                  Back to all plans
                </button>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                  {selectedPlan.title}
                </h3>
                <p className="text-sm text-[var(--text-muted)] mb-3">
                  {selectedPlan.description}
                </p>
                <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                  <div className="flex items-center gap-1">
                    <Calendar size={12} />
                    {selectedPlan.created}
                  </div>
                  <div className="flex items-center gap-1">
                    <User size={12} />
                    You
                  </div>
                  <StatusBadge status={selectedPlan.status} />
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
                        {selectedPlan.completedSteps}/{selectedPlan.steps} steps
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[var(--accent)] transition-all duration-300"
                        style={{ width: `${(selectedPlan.completedSteps / selectedPlan.steps) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Placeholder Content */}
                  <div className="p-6 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-center">
                    <FileText size={40} className="text-[var(--text-muted)] mx-auto mb-3" />
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                      Plan details coming soon
                    </h4>
                    <p className="text-xs text-[var(--text-muted)]">
                      This panel will show detailed steps, progress tracking, and notes
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Plan Card Component
function PlanCard({ plan, onClick }: { plan: Plan; onClick: () => void }) {
  const progressPercent = (plan.completedSteps / plan.steps) * 100;

  return (
    <button
      onClick={onClick}
      className="w-full p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)]
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
          <StatusBadge status={plan.status} />
          <span className="text-xs text-[var(--text-muted)]">
            {plan.completedSteps}/{plan.steps} steps
          </span>
        </div>
        
        {/* Mini Progress Bar */}
        <div className="w-20 h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
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
function StatusBadge({ status }: { status: Plan['status'] }) {
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
