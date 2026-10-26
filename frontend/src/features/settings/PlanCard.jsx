/**
 * The workspace's plan and how much of it is used ("6 of 10 active habits").
 * The plan and its limits come from GET /auth/me (never hard-coded, CLAUDE.md §3.1); the count is
 * the number of active habits. Pro exists but can't be bought yet (ADR-026), so it says "coming soon".
 */
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../../components/ui/index.js';
import { queryKeys } from '../../lib/queryClient.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { listHabits } from '../habits/api.js';

const PLAN_NAMES = { free: 'Free plan', pro: 'Pro plan' };

export function PlanCard() {
  const { plan } = useAuth();
  const { data: active } = useQuery({
    queryKey: queryKeys.habits({ status: 'active' }),
    queryFn: () => listHabits({ status: 'active' }),
  });
  const limit = plan?.limits?.maxActiveHabits ?? null;
  const used = active?.length;
  const percent = limit && used !== undefined ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-lg font-semibold text-fg">{PLAN_NAMES[plan?.code] ?? 'Free plan'}</p>
        <Badge tone="brand">Current</Badge>
      </div>
      {limit === null ? (
        <p className="text-sm text-fg-muted">Unlimited active habits.</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-sm text-fg">
            {used === undefined ? '…' : used} of {limit} active habits
          </p>
          <div
            role="progressbar"
            aria-label="Active habits used"
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={used ?? 0}
            className="h-2 overflow-hidden rounded-full bg-surface-muted"
          >
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-fg-muted">
            Archived habits don&apos;t count towards the limit.
          </p>
        </div>
      )}
      {plan?.code !== 'pro' && (
        <div className="rounded-lg border border-dashed border-border p-3 text-sm">
          <p className="font-medium text-fg">
            Pro <Badge>Coming soon</Badge>
          </p>
          <p className="mt-1 text-fg-muted">
            Unlimited habits and more insights. Nothing to do yet: the free plan stays free.
          </p>
        </div>
      )}
    </div>
  );
}
