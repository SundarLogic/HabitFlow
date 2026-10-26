/**
 * Settings (/settings): profile, timezone, notifications, password, plan, appearance and the
 * danger zone. Each section is a small component from features/settings that saves on its own.
 */
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Card, Tabs } from '../components/ui/index.js';
import {
  NotificationPrefs,
  ProfileForm,
  TimezoneForm,
} from '../features/settings/AccountForms.jsx';
import { DeleteAccount } from '../features/settings/DeleteAccount.jsx';
import { PasswordForm } from '../features/settings/PasswordForm.jsx';
import { PlanCard } from '../features/settings/PlanCard.jsx';
import { useAuth } from '../features/auth/AuthProvider.jsx';
import { cn } from '../lib/cn.js';
import { useTheme } from '../lib/theme.jsx';

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** A titled settings card, labelled by its heading for screen reader landmarks. */
function Section({ id, title, className, children }) {
  return (
    <Card as="section" aria-labelledby={id} className={className}>
      <h2
        id={id}
        className={cn('mb-4 text-base font-semibold', id === 'danger-title' && 'text-danger')}
      >
        {title}
      </h2>
      {children}
    </Card>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  if (!user) return null;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="profile-title" title="Profile">
          <ProfileForm />
        </Section>
        <Section id="timezone-title" title="Timezone">
          <TimezoneForm />
        </Section>
        <Section id="notifications-title" title="Notifications">
          <NotificationPrefs />
        </Section>
        <Section id="plan-title" title="Plan">
          <PlanCard />
        </Section>
        <Section id="password-title" title="Password">
          <PasswordForm />
        </Section>
        <Section id="appearance-title" title="Appearance">
          <Tabs label="Theme" tabs={THEMES} value={theme} onChange={setTheme}>
            {(value) => (
              <p className="text-sm text-fg-muted">
                {value === 'system'
                  ? 'HabitFlow follows your device setting.'
                  : `HabitFlow always uses the ${value} theme.`}
              </p>
            )}
          </Tabs>
        </Section>
        <Section id="danger-title" title="Danger zone" className="border-danger/40 lg:col-span-2">
          <DeleteAccount />
        </Section>
      </div>
    </>
  );
}
