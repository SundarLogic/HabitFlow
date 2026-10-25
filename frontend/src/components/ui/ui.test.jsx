/**
 * Keyboard and ARIA behaviour of the interactive design-system components:
 * Modal (focus moves in, is trapped, Escape closes, focus returns), DropdownMenu (menu button
 * pattern) and Tabs (roving tabindex with arrow keys).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Button } from './Button.jsx';
import { DropdownMenu } from './DropdownMenu.jsx';
import { FormField, Input } from './FormControls.jsx';
import { ConfirmDialog, Modal } from './Modal.jsx';
import { Tabs } from './Tabs.jsx';

function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit habit"
        description="Change the name."
        footer={<Button onClick={() => setOpen(false)}>Save</Button>}
      >
        <input aria-label="Name" />
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('is a labelled dialog that traps focus and returns it on Escape', async () => {
    const user = userEvent.setup();
    render(<ModalDemo />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Edit habit' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Change the name.');
    // Focus moved inside (first focusable: the close button).
    expect(dialog).toContainElement(document.activeElement);

    // Tab cycles within the dialog: close -> input -> Save -> back to close.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('ConfirmDialog focuses Cancel first so Enter never confirms by accident', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete habit?"
        onCancel={() => {}}
        onConfirm={onConfirm}
        confirmLabel="Delete"
        tone="danger"
      />,
    );
    expect(screen.getByRole('alertdialog', { name: 'Delete habit?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });
});

describe('DropdownMenu', () => {
  it('opens with the keyboard, moves with arrows, closes with Escape', async () => {
    const user = userEvent.setup();
    const onSettings = vi.fn();
    const onLogout = vi.fn();
    render(
      <DropdownMenu
        label="Account"
        items={[
          { label: 'Settings', onSelect: onSettings },
          { label: 'Log out', onSelect: onLogout },
        ]}
        trigger={(props) => <button {...props}>Menu</button>}
      />,
    );
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    button.focus();
    await user.keyboard('{ArrowDown}');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus();
    await user.keyboard('{ArrowDown}'); // wraps around
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard('{End}{Enter}');
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onSettings).not.toHaveBeenCalled();
  });
});

describe('Tabs', () => {
  function TabsDemo() {
    const [value, setValue] = useState('a');
    return (
      <Tabs
        label="Range"
        value={value}
        onChange={setValue}
        tabs={[
          { value: 'a', label: 'Week' },
          { value: 'b', label: 'Month' },
          { value: 'c', label: 'Year' },
        ]}
      >
        {(v) => <p>Panel {v}</p>}
      </Tabs>
    );
  }

  it('uses roving tabindex and arrow keys, with a labelled panel', async () => {
    const user = userEvent.setup();
    render(<TabsDemo />);
    const week = screen.getByRole('tab', { name: 'Week' });
    expect(week).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Month' })).toHaveAttribute('tabindex', '-1');

    week.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Month' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Month' })).toHaveTextContent('Panel b');

    await user.keyboard('{ArrowLeft}{ArrowLeft}'); // wraps to the last tab
    expect(screen.getByRole('tab', { name: 'Year' })).toHaveAttribute('aria-selected', 'true');
  });
});

it('FormField links the label, hint and error to the control', () => {
  render(
    <FormField label="Email" hint="We never share it." error="Enter your email address" required>
      {(field) => <Input {...field} />}
    </FormField>,
  );
  const input = screen.getByLabelText(/Email/);
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAttribute('aria-required', 'true');
  expect(input).toHaveAccessibleDescription('We never share it. Enter your email address');
  expect(screen.getByRole('alert')).toHaveTextContent('Enter your email address');
});
