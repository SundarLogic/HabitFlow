/**
 * "Delete habit?" dialog that steers towards the safer choice (retention policy, ADR-010):
 *   - Archive (primary for active habits): leaves daily tracking, keeps ALL history, reversible.
 *   - Delete permanently (danger): removes the habit and its history for good.
 * Focus starts on Cancel so a reflexive Enter never destroys anything.
 */
import { Button, Modal } from '../../components/ui/index.js';

/**
 * @param {{ habit: object | null, onClose: () => void, onArchive: (habit) => void,
 *   onDelete: (habit) => void }} props
 */
export function DeleteHabitDialog({ habit, onClose, onArchive, onDelete }) {
  if (!habit) return null;
  const isArchived = habit.status === 'archived';
  return (
    <Modal
      open
      onClose={onClose}
      role="alertdialog"
      size="sm"
      title={`Delete "${habit.name}"?`}
      description={
        isArchived
          ? 'This permanently removes the habit and its whole history. It cannot be undone.'
          : 'Archiving stops tracking but keeps your history and streaks, and you can restore it anytime. Deleting removes everything for good.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} data-autofocus>
            Cancel
          </Button>
          {!isArchived && <Button onClick={() => onArchive(habit)}>Archive instead</Button>}
          <Button variant="danger" onClick={() => onDelete(habit)}>
            Delete permanently
          </Button>
        </>
      }
    />
  );
}
