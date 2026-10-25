/**
 * Pages whose features arrive in later phases. Each already has its route, title and heading, so
 * navigation, the layout and deep links work end to end.
 */
import { BarChart3, ListChecks } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Card, EmptyState } from '../components/ui/index.js';

function ComingSoon({ icon, title, description }) {
  return (
    <Card>
      <EmptyState icon={icon} title={title} description={description} />
    </Card>
  );
}

export function HabitDetailPage() {
  const { id } = useParams();
  return (
    <>
      <PageHeader title="Habit" />
      <ComingSoon
        icon={ListChecks}
        title="Habit details are on their way"
        description={`History, streaks and reminders for habit ${id} will appear here.`}
      />
    </>
  );
}

export function AnalyticsPage() {
  return (
    <>
      <PageHeader title="Analytics" description="Your progress over time." />
      <ComingSoon
        icon={BarChart3}
        title="Charts are on their way"
        description="Completion rates, streaks and a calendar heatmap will live here."
      />
    </>
  );
}
