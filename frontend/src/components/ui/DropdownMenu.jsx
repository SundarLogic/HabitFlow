/**
 * Dropdown menu (WAI-ARIA menu button pattern).
 *
 *   <DropdownMenu
 *     label="Account menu"
 *     trigger={(props) => <button {...props}>Ana</button>}
 *     items={[
 *       { label: 'Settings', icon: Settings, onSelect: () => navigate('/settings') },
 *       { label: 'Log out', icon: LogOut, onSelect: logout },
 *     ]}
 *   />
 *
 * Keyboard: Enter/Space/ArrowDown on the button opens the menu on the first item (ArrowUp: last).
 * Inside: Up/Down move (wrapping), Home/End jump, Enter/Space activate, Escape closes and returns
 * focus to the button, Tab closes. A click outside closes it.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * @param {object} props
 * @param {string} props.label accessible name of the menu
 * @param {(props: object) => import('react').ReactNode} props.trigger renders the button; spread
 *   the received props onto it (ref, aria-*, handlers)
 * @param {{ label: string, icon?: import('react').ComponentType, onSelect: () => void,
 *   tone?: 'danger' }[]} props.items
 * @param {'left'|'right'} [props.align='right']
 */
export function DropdownMenu({ label, trigger, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuId = useId();
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);

  // Move DOM focus to the active item whenever it changes while open.
  useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  // Close on a click outside the button and the menu.
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function openAt(index) {
    setActiveIndex(index);
    setOpen(true);
  }

  function close({ restoreFocus = true } = {}) {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }

  function onButtonKeyDown(event) {
    if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      openAt(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(items.length - 1);
    }
  }

  function onMenuKeyDown(event) {
    const last = items.length - 1;
    const moves = {
      ArrowDown: activeIndex === last ? 0 : activeIndex + 1,
      ArrowUp: activeIndex === 0 ? last : activeIndex - 1,
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActiveIndex(moves[event.key]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      close({ restoreFocus: false });
    }
  }

  function activate(item) {
    close();
    item.onSelect();
  }

  return (
    <div className="relative">
      {trigger({
        ref: buttonRef,
        type: 'button',
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => (open ? close() : openAt(0)),
        onKeyDown: onButtonKeyDown,
      })}
      {open && (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            'absolute z-40 mt-2 min-w-48 rounded-xl border border-border bg-surface-raised p-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={item.label} role="none">
                <button
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={() => activate(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm',
                    'hover:bg-surface-muted focus-visible:bg-surface-muted',
                    item.tone === 'danger' ? 'text-danger' : 'text-fg',
                  )}
                >
                  {Icon && <Icon aria-hidden="true" className="h-4 w-4" />}
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
