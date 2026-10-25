/**
 * The heading block at the top of each page: one <h1>, an optional description and actions.
 * Also sets the document title (usePageTitle).
 */
import { usePageTitle } from '../../hooks/usePageTitle.js';

export function PageHeader({ title, description, actions }) {
  usePageTitle(title);
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
