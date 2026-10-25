/**
 * Settings (/settings). Phase 8: account summary and the theme choice. Editing the profile,
 * password and notification preferences arrives with the settings feature.
 */
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Card, Tabs } from '../components/ui/index.js';
import { useAuth } from '../features/auth/AuthProvider.jsx';
import { useTheme } from '../lib/theme.jsx';

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Card as="section" aria-labelledby="account-title">
          <h2 id="account-title" className="text-base font-semibold">
            Account
          </h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-fg-muted">Name</dt>
            <dd>{user?.name}</dd>
            <dt className="text-fg-muted">Email</dt>
            <dd>{user?.email}</dd>
            <dt className="text-fg-muted">Timezone</dt>
            <dd>{user?.timezone}</dd>
          </dl>
        </Card>
        <Card as="section" aria-labelledby="appearance-title">
          <h2 id="appearance-title" className="mb-4 text-base font-semibold">
            Appearance
          </h2>
          <Tabs label="Theme" tabs={THEMES} value={theme} onChange={setTheme}>
            {(value) => (
              <p className="text-sm text-fg-muted">
                {value === 'system'
                  ? 'HabitFlow follows your device setting.'
                  : `HabitFlow always uses the ${value} theme.`}
              </p>
            )}
          </Tabs>
        </Card>
      </div>
    </>
  );
}
