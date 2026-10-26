/**
 * Slow-query logging (ADR-058). Sequelize measures every query (`benchmark: true` in
 * models/index.js) and hands us the SQL and its duration; queries slower than SLOW_QUERY_MS
 * (default 500 ms) are logged at "warn" so they show up in the hosting platform's logs.
 *
 * Privacy: Sequelize writes VALUES into the SQL text (e.g. WHERE email = 'ana@example.com', or a
 * password hash in an INSERT). redactSql() replaces every quoted literal and long number before
 * anything is logged, so only the SHAPE of the query is kept.
 */

const MAX_SQL_LENGTH = 1000;

/**
 * Removes literal values from SQL: 'text' -> '?', and numbers of 4+ digits -> ?.
 * @param {string} sql
 * @returns {string}
 */
export function redactSql(sql) {
  return sql
    .replace(/^Executing \([^)]*\):\s*/, '') // Sequelize's "Executing (default): " prefix
    .replace(/'(?:[^']|'')*'/g, "'?'") // string literals (with '' escapes inside)
    .replace(/\b\d{4,}\b/g, '?') // long numbers (ids, timestamps)
    .slice(0, MAX_SQL_LENGTH);
}

/**
 * Builds the `logging` function for Sequelize.
 * @param {{ logger: import('pino').Logger, thresholdMs: number }} options
 * @returns {(sql: string, durationMs?: number) => void}
 */
export function createSlowQueryLogger({ logger, thresholdMs }) {
  return (sql, durationMs) => {
    if (typeof durationMs !== 'number' || durationMs < thresholdMs) return;
    logger.warn({ durationMs, sql: redactSql(sql) }, 'Slow database query');
  };
}
