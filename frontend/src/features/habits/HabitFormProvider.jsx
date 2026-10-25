/**
 * Opens the habit form from anywhere in the app (Today's "New habit" button and its "n" shortcut,
 * the Habits page, row menus) without each page managing its own modal.
 *
 *   const { openCreate, openEdit } = useHabitForm();
 *
 * Mounted once in AppShell.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { HabitFormModal } from './HabitFormModal.jsx';

const HabitFormContext = createContext(null);

export function HabitFormProvider({ children }) {
  const [state, setState] = useState({ open: false, habit: null });
  const openCreate = useCallback(() => setState({ open: true, habit: null }), []);
  const openEdit = useCallback((habit) => setState({ open: true, habit }), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const value = useMemo(
    () => ({ openCreate, openEdit, isOpen: state.open }),
    [openCreate, openEdit, state.open],
  );

  return (
    <HabitFormContext.Provider value={value}>
      {children}
      {state.open && <HabitFormModal open onClose={close} habit={state.habit} />}
    </HabitFormContext.Provider>
  );
}

/** @returns {{ openCreate: () => void, openEdit: (habit: object) => void, isOpen: boolean }} */
export function useHabitForm() {
  const context = useContext(HabitFormContext);
  if (!context) throw new Error('useHabitForm must be used inside <HabitFormProvider>');
  return context;
}
