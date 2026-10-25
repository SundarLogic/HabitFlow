/**
 * Tabs (WAI-ARIA tabs pattern, automatic activation).
 *
 *   <Tabs label="Analytics range" value={tab} onChange={setTab}
 *     tabs={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }]}>
 *     {(value) => <Panel range={value} />}
 *   </Tabs>
 *
 * Keyboard: Tab moves into the tab list (only the selected tab is tabbable: "roving tabindex"),
 * Left/Right arrows move and select, Home/End jump to the first/last tab. The panel is labelled
 * by its tab.
 */
import { useId, useRef } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * @param {object} props
 * @param {string} props.label accessible name of the tab list
 * @param {{ value: string, label: string }[]} props.tabs
 * @param {string} props.value the selected tab
 * @param {(value: string) => void} props.onChange
 * @param {(value: string) => import('react').ReactNode} props.children renders the selected panel
 */
export function Tabs({ label, tabs, value, onChange, children, className }) {
  const baseId = useId();
  const tabRefs = useRef([]);
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.value === value),
  );

  function select(index) {
    const tab = tabs[(index + tabs.length) % tabs.length];
    onChange(tab.value);
    tabRefs.current[tabs.indexOf(tab)]?.focus();
  }

  function onKeyDown(event) {
    const moves = {
      ArrowRight: selectedIndex + 1,
      ArrowLeft: selectedIndex - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select(moves[event.key]);
  }

  const selected = tabs[selectedIndex];
  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="inline-flex rounded-lg border border-border bg-surface-muted p-1"
      >
        {tabs.map((tab, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={tab.value}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.value}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onChange(tab.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isSelected ? 'bg-surface-raised text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${selected?.value}`}
        tabIndex={0}
        className="mt-4"
      >
        {selected && children(selected.value)}
      </div>
    </div>
  );
}
