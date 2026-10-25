/**
 * Habits (/habits): manage habits. Active / Archived tabs, search, category filter, and per-habit
 * menu (Edit, Archive / Restore, Delete).
 *
 * Reordering (Active tab, unfiltered list): "Move up" / "Move down" buttons on each row, so it
 * works with keyboard, touch and screen readers alike (drag-and-drop alone would not). The new
 * order shows immediately and is saved with PATCH /habits/reorder; a polite live region announces
 * the new position, and focus stays on the button that was pressed.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ListChecks,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import {
  Badge,
  Button,
  Card,
  DropdownMenu,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Select,
  Skeleton,
  Tabs,
  useToast,
} from '../components/ui/index.js';
import { listCategories, listHabits, reorderHabits } from '../features/habits/api.js';
import { DeleteHabitDialog } from '../features/habits/DeleteHabitDialog.jsx';
import { HabitIcon } from '../features/habits/HabitIcon.jsx';
import { useHabitForm } from '../features/habits/HabitFormProvider.jsx';
import { scheduleSummary } from '../features/habits/schedule.js';
import { useHabitActions } from '../features/habits/useHabitActions.js';
import { longDate } from '../lib/dates.js';
import { queryKeys } from '../lib/queryClient.js';

const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

/** The search text, applied 300 ms after typing stops (fewer requests while typing). */
function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function HabitsPage() {
  const { openCreate } = useHabitForm();
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const debouncedSearch = useDebounced(search.trim());
  const filters = { status, search: debouncedSearch, category };

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: listCategories,
  });

  return (
    <>
      <PageHeader
        title="Habits"
        description="Everything you track, in the order it appears on Today."
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            New habit
          </Button>
        }
      />
      <Tabs label="Habit status" tabs={TABS} value={status} onChange={setStatus}>
        {() => (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row" role="search">
              <div className="relative flex-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-muted"
                />
                <Input
                  type="search"
                  aria-label="Search habits by name"
                  placeholder="Search habits"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                aria-label="Filter by category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="sm:w-48"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <HabitList
              filters={filters}
              canReorder={status === 'active' && !debouncedSearch && !category}
              onCreate={openCreate}
            />
          </div>
        )}
      </Tabs>
    </>
  );
}

function HabitList({ filters, canReorder, onCreate }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { openEdit } = useHabitForm();
  const { archive, unarchive, remove } = useHabitActions();
  const [toDelete, setToDelete] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const moveButtons = useRef(new Map());
  const pendingFocus = useRef(null);
  const key = queryKeys.habits(filters);

  const {
    data: habits,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: key,
    queryFn: () => listHabits(filters),
  });

  const reorder = useMutation({
    mutationFn: (ordered) => reorderHabits(ordered.map((h) => h.id)),
    onMutate: async (ordered) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, ordered);
      return { previous };
    },
    onError: (err, _ordered, context) => {
      queryClient.setQueryData(key, context?.previous);
      toast.error("Couldn't save the new order", { description: err.message });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      queryClient.invalidateQueries({ queryKey: ['today'] });
    },
  });

  // After a move, keep keyboard focus on the same button of the moved habit (or the opposite
  // one if it reached the top/bottom and its button got disabled).
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const own = moveButtons.current.get(`${target.id}:${target.direction}`);
    const other = moveButtons.current.get(
      `${target.id}:${target.direction === 'up' ? 'down' : 'up'}`,
    );
    (own && !own.disabled ? own : other)?.focus();
  }, [habits]);

  function move(habit, direction) {
    // Ignore clicks while the previous order is saving. (Disabling the buttons instead would
    // throw keyboard focus out of the list.)
    if (reorder.isPending) return;
    const index = habits.findIndex((h) => h.id === habit.id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= habits.length) return;
    const ordered = [...habits];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    pendingFocus.current = { id: habit.id, direction };
    reorder.mutate(ordered);
    setAnnouncement(`${habit.name} moved to position ${target + 1} of ${habits.length}.`);
  }

  if (isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  if (habits.length === 0) {
    const filtered = Boolean(filters.search || filters.category);
    return (
      <Card>
        <EmptyState
          icon={ListChecks}
          title={
            filtered
              ? 'No habits match'
              : filters.status === 'archived'
                ? 'No archived habits'
                : 'No habits yet'
          }
          description={
            filtered
              ? 'Try another search or category.'
              : filters.status === 'archived'
                ? 'Habits you archive keep their history and show up here.'
                : 'Create a habit and it will appear here and on Today.'
          }
          action={
            !filtered && filters.status === 'active' ? (
              <Button onClick={onCreate}>Create a habit</Button>
            ) : undefined
          }
        />
      </Card>
    );
  }

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <Card className="py-0 sm:py-0">
        <ul className="divide-y divide-border">
          {habits.map((habit, index) => {
            const isArchived = habit.status === 'archived';
            const items = isArchived
              ? [
                  {
                    label: 'Restore',
                    icon: ArchiveRestore,
                    onSelect: () => unarchive.mutate(habit),
                  },
                  {
                    label: 'Delete',
                    icon: Trash2,
                    tone: 'danger',
                    onSelect: () => setToDelete(habit),
                  },
                ]
              : [
                  { label: 'Edit', icon: Pencil, onSelect: () => openEdit(habit) },
                  { label: 'Archive', icon: Archive, onSelect: () => archive.mutate(habit) },
                  {
                    label: 'Delete',
                    icon: Trash2,
                    tone: 'danger',
                    onSelect: () => setToDelete(habit),
                  },
                ];
            return (
              <li key={habit.id} className="flex items-center gap-3 py-3">
                <HabitIcon icon={habit.icon} color={habit.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/habits/${habit.id}`}
                      className="font-medium text-fg hover:underline"
                    >
                      {habit.name}
                    </Link>
                    {habit.category && <Badge>{habit.category}</Badge>}
                  </div>
                  <p className="text-sm text-fg-muted">
                    {isArchived && habit.archivedAt
                      ? `Archived ${longDate(habit.archivedAt.slice(0, 10))}`
                      : scheduleSummary(habit)}
                  </p>
                </div>
                {canReorder && (
                  <div className="flex">
                    {[
                      ['up', ArrowUp, index === 0],
                      ['down', ArrowDown, index === habits.length - 1],
                    ].map(([direction, Icon, atEdge]) => (
                      <IconButton
                        key={direction}
                        ref={(el) => {
                          if (el) moveButtons.current.set(`${habit.id}:${direction}`, el);
                          else moveButtons.current.delete(`${habit.id}:${direction}`);
                        }}
                        label={`Move ${habit.name} ${direction}`}
                        icon={Icon}
                        size="sm"
                        disabled={atEdge}
                        onClick={() => move(habit, direction)}
                      />
                    ))}
                  </div>
                )}
                <DropdownMenu
                  label={`Actions for ${habit.name}`}
                  items={items}
                  trigger={(props) => (
                    <IconButton
                      {...props}
                      label={`Actions for ${habit.name}`}
                      icon={MoreVertical}
                    />
                  )}
                />
              </li>
            );
          })}
        </ul>
      </Card>
      <DeleteHabitDialog
        habit={toDelete}
        onClose={() => setToDelete(null)}
        onArchive={(habit) => {
          setToDelete(null);
          archive.mutate(habit);
        }}
        onDelete={(habit) => {
          setToDelete(null);
          remove.mutate(habit);
        }}
      />
    </>
  );
}
