/**
 * ChartFigure: a titled chart plus the same numbers as a table.
 *
 * Charts are pictures; screen readers can't read SVG bars. Each chart is therefore hidden from
 * assistive technology and paired with a real data table inside a "Show data" disclosure that
 * everyone can open (handy for exact numbers too).
 *
 *   <ChartFigure title="Daily completion rate" columns={['Date', 'Rate']} rows={[['Oct 1','80%']]}>
 *     <BarChart ... />
 *   </ChartFigure>
 */
import { useId } from 'react';
import { Card } from '../../components/ui/index.js';

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {string[]} props.columns table header labels
 * @param {(string|number)[][]} props.rows table rows (already formatted)
 * @param {number} [props.height=240] chart height in px
 */
export function ChartFigure({ title, description, columns, rows, height = 240, children }) {
  const titleId = useId();
  return (
    <Card as="figure" aria-labelledby={titleId} className="min-w-0">
      <figcaption>
        <h2 id={titleId} className="text-base font-semibold text-fg">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </figcaption>
      <div aria-hidden="true" className="mt-4 w-full" style={{ height }}>
        {children}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-fg-muted hover:text-fg">Show data</summary>
        {/* A scrollable box must be reachable by keyboard (tabIndex) and named, so keyboard
            users can scroll long tables too (axe: scrollable-region-focusable). */}
        <div
          tabIndex={0}
          role="region"
          aria-label={`${title}: data`}
          className="mt-2 max-h-64 overflow-auto rounded focus-visible:outline-2 focus-visible:outline-ring"
        >
          <table className="w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="border-b border-border py-1 pr-4 font-medium"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.join('|')}>
                  {row.map((cell, i) => (
                    <td
                      key={columns[i]}
                      className="border-b border-border/60 py-1 pr-4 text-fg-muted"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

/** "0.6667" -> "67%", null -> "—" (nothing was due). */
export function formatRate(rate) {
  return rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)}%`;
}
