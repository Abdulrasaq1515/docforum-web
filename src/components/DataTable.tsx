import { type ReactNode, useCallback, useMemo, useRef } from 'react';
import { Spinner } from './Spinner';
import styles from './DataTable.module.css';

// ───────────────────────────────────────────────────────────────────────────
// DataTable — accessible, responsive data table with cursor pagination,
// server-side sorting, and URL-synced filters.
//
// Cursor pagination can't jump to arbitrary pages, so the UI offers only
// "Load more" and "Newer" (back to newest) — never a page-number box.
// The current view always reflects the URL, so it's shareable and
// survives reload. Desktop renders a real <table> with aria-sort; under
// 600px the same markup is reflowed to stacked cards via CSS, with
// column labels surfaced through `data-label` attributes.
// ───────────────────────────────────────────────────────────────────────────

/** Direction of a server-side sort on a single column. */
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  /** Column key — matches `Column.key`. */
  key: string;
  direction: SortDirection;
}

/** A text or select filter tied to a single column key. */
export interface FilterState {
  [key: string]: string;
}

export type FilterKind = 'text' | 'select';

export interface FilterDefinition {
  key: string;
  kind: FilterKind;
  label: string;
  placeholder?: string;
  /** For `select` filters: the options to render. */
  options?: { value: string; label: string }[];
  /** Defaults to 128. */
  maxLength?: number;
  /** Allowed-character regex for text inputs. Defaults to a broad, safe
   * token charset that rejects HTML/script payloads. */
  allowedPattern?: RegExp;
}

export interface Column<T> {
  key: string;
  header: string;
  /** Render the cell content for a row. */
  cell: (row: T) => ReactNode;
  /** Sortable columns expose a `sort` callback that produces the server
   * sort key + direction. Omit for non-sortable columns. */
  sortable?: boolean;
  /** Width hint (e.g. '12rem'). Optional. */
  width?: string;
  /** Hide this column entirely below the `mobileHidden` breakpoint (px).
   * Defaults to hiding nothing. */
  mobileHidden?: boolean;
}

/** A page returned by a cursor-paginated API. Mirrors `CursorPage<T>`
 * but kept local to the table so feature code can pass a shaped list
 * without importing the core type. */
export interface DataTablePage<T> {
  items: T[];
  /** Opaque cursor for the next page; `null` = last page. */
  nextCursor: string | null;
}

export interface DataTableFetchResult<T> {
  page: DataTablePage<T>;
}

export interface DataTableProps<T> {
  /** Accessible label / caption for the table. Required. */
  caption: string;
  /** Unique id used to namespace the table's filter/sort state in the URL. */
  id: string;
  columns: Column<T>[];
  filters?: FilterDefinition[];
  /** Current filter values, keyed by filter key. */
  filterValues?: FilterState;
  onFiltersChange?: (next: FilterState) => void;
  sort?: SortState | null;
  onSortChange?: (next: SortState | null) => void;
  /** Cursor of the currently displayed page. `null` = newest. */
  cursor?: string | null;
  /** History of cursors visited when paging forward, oldest-first. Used to
   * provide a stable "Newer" navigation. */
  cursorTrail?: (string | null)[];
  onCursorChange?: (next: { cursor: string | null; trail: (string | null)[] }) => void;
  /** Rows currently on display. */
  rows: T[];
  nextCursor: string | null;
  isLoading: boolean;
  isFetching?: boolean;
  error?: unknown;
  /** Called when the user clicks "Load more" / "Newer". */
  onRetry?: () => void;
  /** Row key — defaults to using the index, but a stable key is strongly
   * recommended for correctness under refetch/placeholder data. */
  rowKey?: (row: T, index: number) => string;
  /** When `cursorTrail` is empty and `cursor` is non-null (a deep link),
   * the "Newer" button jumps to `null` (newest) instead of guessing. */
  pageSizeHint?: number;
  /** Optional empty-state message. */
  emptyMessage?: string;
}

const DEFAULT_PATTERN = /^[A-Za-z0-9 .,_:@\-/+()]*$/;
const MAX_FILTER_LENGTH = 128;

function isInteractive(target: EventTarget | null, currentTarget: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const closest = target.closest('button, a, input, select, [data-no-sort]');
  if (!closest) return false;
  // The sort button itself (and its child spans) isn't a "nested interactive"
  // element — it's the thing we want to click to sort. Only block sort when
  // the click lands on a different interactive element inside the header.
  return closest !== currentTarget;
}

export function DataTable<T>({
  caption,
  id,
  columns,
  filters = [],
  filterValues = {},
  onFiltersChange,
  sort,
  onSortChange,
  cursor = null,
  cursorTrail = [],
  onCursorChange,
  rows,
  nextCursor,
  isLoading,
  isFetching = false,
  error,
  onRetry,
  rowKey,
  emptyMessage = 'No results match these filters.',
}: DataTableProps<T>) {
  // Guard against accidental double-fire of sort when a user presses Enter
  // on a focused sortable header.
  const sortHeaderRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleSort = useCallback(
    (column: Column<T>) => {
      if (!column.sortable || !onSortChange) return;
      if (sort?.key === column.key) {
        // Toggle direction; if currently 'desc', clear sort.
        if (sort.direction === 'asc') {
          onSortChange({ key: column.key, direction: 'desc' });
        } else {
          onSortChange(null);
        }
      } else {
        onSortChange({ key: column.key, direction: 'asc' });
      }
    },
    [sort, onSortChange],
  );

  const handleFilterInput = useCallback(
    (filter: FilterDefinition, value: string) => {
      if (!onFiltersChange) return;
      const max = filter.maxLength ?? MAX_FILTER_LENGTH;
      const trimmed = value.slice(0, max);
      const pattern = filter.allowedPattern ?? DEFAULT_PATTERN;
      // For select filters, allow any of the defined option values.
      if (filter.kind === 'select') {
        const valid = (filter.options ?? []).some((opt) => opt.value === trimmed) || trimmed === '';
        if (!valid) return;
      } else if (trimmed && !pattern.test(trimmed)) {
        // Reject characters outside the allowed set; keep the previous value.
        return;
      }
      onFiltersChange({ ...filterValues, [filter.key]: trimmed });
    },
    [filterValues, onFiltersChange],
  );

  const clearFilters = useCallback(() => {
    if (!onFiltersChange) return;
    const cleared: FilterState = {};
    for (const f of filters) cleared[f.key] = '';
    onFiltersChange(cleared);
  }, [filters, onFiltersChange]);

  const hasActiveFilters = useMemo(
    () => filters.some((f) => Boolean((filterValues[f.key] ?? '').trim())),
    [filters, filterValues],
  );

  const hasOlder = Boolean(nextCursor);
  const hasNewer = cursor !== null;

  const loadMore = useCallback(() => {
    if (!onCursorChange || !nextCursor) return;
    onCursorChange({ cursor: nextCursor, trail: [...cursorTrail, cursor] });
  }, [onCursorChange, nextCursor, cursorTrail, cursor]);

  const goNewer = useCallback(() => {
    if (!onCursorChange) return;
    const prev = cursorTrail.length > 0 ? cursorTrail[cursorTrail.length - 1] : null;
    onCursorChange({ cursor: prev, trail: cursorTrail.slice(0, -1) });
  }, [onCursorChange, cursorTrail]);

  const goNewest = useCallback(() => {
    if (!onCursorChange) return;
    onCursorChange({ cursor: null, trail: [] });
  }, [onCursorChange]);

  const sortedColumn = columns.find((c) => c.key === sort?.key);
  const visibleRows = rows;

  // Compose the screen-reader-friendly sort description.
  const sortDescription = sortedColumn
    ? `Sorted by ${sortedColumn.header}, ${sort!.direction === 'asc' ? 'ascending' : 'descending'}`
    : 'Not sorted';

  return (
    <div className={styles.root}>
      {/* Filters toolbar */}
      {filters.length > 0 && (
        <div className={styles.toolbar} role="search" aria-label={`${caption} filters`}>
          {filters.map((filter) => (
            <div key={filter.key} className={styles.filterGroup}>
              <label htmlFor={`${id}-filter-${filter.key}`} className={styles.filterLabel}>
                {filter.label}
              </label>
              {filter.kind === 'select' ? (
                <select
                  id={`${id}-filter-${filter.key}`}
                  className={styles.filterSelect}
                  value={filterValues[filter.key] ?? ''}
                  onChange={(e) => handleFilterInput(filter, e.target.value)}
                >
                  <option value="">All</option>
                  {(filter.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`${id}-filter-${filter.key}`}
                  type="text"
                  className={styles.filterInput}
                  value={filterValues[filter.key] ?? ''}
                  placeholder={filter.placeholder ?? `Filter by ${filter.label.toLowerCase()}`}
                  onChange={(e) => handleFilterInput(filter, e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </div>
          ))}
          {hasActiveFilters && (
            <button type="button" className={styles.clearBtn} onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Status bar */}
      <div className={styles.statusBar} aria-live="polite">
        <span className={styles.statusCount}>
          {isLoading
            ? 'Loading…'
            : `${visibleRows.length} ${visibleRows.length === 1 ? 'row' : 'rows'} on this page`}
          {isFetching && !isLoading ? ' · updating…' : ''}
        </span>
        <span className={styles.sortHint}>{sortDescription}</span>
      </div>

      {/* Error state */}
      {error ? (
        <div className={styles.errorBox} role="alert">
          <p>Couldn't load this list. {String((error as Error)?.message ?? '')}</p>
          {onRetry && (
            <button type="button" className={styles.clearBtn} onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      ) : (
        <div className={styles.tableWrapper} aria-busy={isFetching}>
          <table className={styles.table} aria-label={caption}>
            <caption className="visually-hidden" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }}>
              {caption}
            </caption>
            <thead>
              <tr>
                {columns.map((column) => {
                  const isSorted = sort?.key === column.key;
                  const ariaSort = isSorted ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : 'none';
                  if (column.sortable && onSortChange) {
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={ariaSort as 'ascending' | 'descending' | 'none'}
                        style={{ width: column.width }}
                      >
                        <button
                          type="button"
                          ref={(el) => {
                            sortHeaderRefs.current[column.key] = el;
                          }}
                          className={styles.clearBtn}
                          style={{ border: 'none', padding: 0, background: 'transparent', fontWeight: 'inherit', cursor: 'pointer', alignSelf: 'inherit' }}
                          onClick={(e) => {
                            if (isInteractive(e.target, e.currentTarget)) return;
                            handleSort(column);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSort(column);
                            }
                          }}
                          aria-label={`${column.header}${
                            isSorted ? `, sorted ${sort!.direction === 'asc' ? 'ascending' : 'descending'}. Activate to ${sort!.direction === 'asc' ? 'sort descending' : 'clear sort'}` : '. Activate to sort ascending'
                          }`}
                        >
                          {column.header}
                          <span className={styles.sortIcon} aria-hidden="true">
                            {isSorted ? (sort!.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </th>
                    );
                  }
                  return (
                    <th key={column.key} scope="col" style={{ width: column.width }}>
                      {column.header}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length}>
                    <div className={styles.spinnerCell}>
                      <Spinner size={20} />
                      <span>Loading…</span>
                    </div>
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className={styles.emptyRow}>
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, index) => {
                  const key = rowKey ? rowKey(row, index) : String(index);
                  return (
                    <tr key={key}>
                      {columns.map((column) => (
                        <td key={column.key} data-label={column.header}>
                          {column.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination — cursor-based, so only Newer / Older / Newest */}
      {!error && (
        <nav className={styles.pagination} aria-label={`${caption} pages`}>
          <div className={styles.pagerButtons}>
            <button
              type="button"
              className={styles.clearBtn}
              onClick={goNewer}
              disabled={!hasNewer || isFetching}
              aria-label="Newer entries"
            >
              ← Newer
            </button>
            {hasNewer && cursorTrail.length === 0 && (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={goNewest}
                disabled={isFetching}
              >
                Newest
              </button>
            )}
            <button
              type="button"
              className={styles.clearBtn}
              onClick={loadMore}
              disabled={!hasOlder || isFetching}
              aria-label="Older entries"
            >
              Older →
            </button>
          </div>
          <span className={styles.pageInfo}>
            {cursor === null ? 'Newest page' : cursorTrail.length > 0 ? `Page ${cursorTrail.length + 1}` : 'Deep-linked page'}
          </span>
        </nav>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// useTableUrlState — URL-synced filter, sort and cursor state for a DataTable.
//
// All three live in the URL query string so a filtered+sorted view is
// shareable and survives reload. Values read from the URL are untrusted:
// they're trimmed, length-capped and shape-checked before being passed
// back to the consumer. Invalid values are dropped (and reported via
// `issues`) rather than throwing.
// ───────────────────────────────────────────────────────────────────────────

export interface TableUrlState {
  filters: FilterState;
  sort: SortState | null;
  cursor: string | null;
  /** Trail of cursors visited when paging forward, oldest-first. Carried in
   * browser history state so back/forward stays consistent. */
  cursorTrail: (string | null)[];
  /** Human-readable notes about any invalid URL values that were dropped. */
  issues: string[];
}

export interface UseTableUrlStateOptions {
  /** Unique id for this table's URL keys. Must not collide with another
   * table on the same route. */
  id: string;
  filters: FilterDefinition[];
  /** Default sort applied when the URL has none. */
  defaultSort?: SortState | null;
}

import { useLocation, useSearchParams } from 'react-router-dom';

const MAX_CURSOR_LENGTH = 512;
const CURSOR_PATTERN = /^[A-Za-z0-9._~:+/=-]+$/;
const SORT_PATTERN = /^[A-Za-z0-9_]+$/;

function paramKey(id: string, suffix: string): string {
  return `${id}.${suffix}`;
}

function readTrail(state: unknown, id: string): (string | null)[] {
  const key = `${id}.trail`;
  const trail = (state as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(trail) || trail.length > 500) return [];
  return trail.every((entry) => entry === null || typeof entry === 'string') ? (trail as (string | null)[]) : [];
}

export function useTableUrlState({ id, filters, defaultSort = null }: UseTableUrlStateOptions): TableUrlState & {
  setFilters: (next: FilterState) => void;
  setSort: (next: SortState | null) => void;
  setCursor: (next: { cursor: string | null; trail: (string | null)[] }) => void;
  clearFilters: () => void;
  pageNumber: number | null;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const trailKey = `${id}.trail`;
  const cursorTrail = readTrail(location.state, id);

  const issues: string[] = [];

  // Parse filters from URL.
  const parsedFilters: FilterState = {};
  for (const filter of filters) {
    const key = paramKey(id, `f.${filter.key}`);
    const raw = (searchParams.get(key) ?? '').trim();
    if (!raw) {
      parsedFilters[filter.key] = '';
      continue;
    }
    const max = filter.maxLength ?? MAX_FILTER_LENGTH;
    const pattern = filter.allowedPattern ?? DEFAULT_PATTERN;
    if (raw.length > max) {
      issues.push(`${filter.label} was too long and was ignored.`);
      parsedFilters[filter.key] = '';
      continue;
    }
    if (filter.kind === 'select') {
      const valid = (filter.options ?? []).some((opt) => opt.value === raw);
      if (!valid) {
        issues.push(`${filter.label} had an unknown option and was ignored.`);
        parsedFilters[filter.key] = '';
        continue;
      }
    } else if (!pattern.test(raw)) {
      issues.push(`${filter.label} contained invalid characters and was ignored.`);
      parsedFilters[filter.key] = '';
      continue;
    }
    parsedFilters[filter.key] = raw;
  }

  // Parse sort from URL.
  const sortKeyParam = searchParams.get(paramKey(id, 'sort'));
  const sortDirParam = searchParams.get(paramKey(id, 'dir'));
  let sort: SortState | null = defaultSort;
  if (sortKeyParam) {
    if (!SORT_PATTERN.test(sortKeyParam)) {
      issues.push('Sort column in the URL was invalid and was ignored.');
    } else if (sortDirParam !== 'asc' && sortDirParam !== 'desc') {
      issues.push('Sort direction in the URL was invalid and was ignored.');
    } else {
      sort = { key: sortKeyParam, direction: sortDirParam };
    }
  } else if (!sortKeyParam && sortDirParam) {
    // No sort key but a direction present: clear sort.
    sort = null;
  }

  // Parse cursor.
  const cursorParam = (searchParams.get(paramKey(id, 'cursor')) ?? '').trim();
  let cursor: string | null = null;
  if (cursorParam) {
    if (cursorParam.length <= MAX_CURSOR_LENGTH && CURSOR_PATTERN.test(cursorParam)) {
      cursor = cursorParam;
    } else {
      issues.push('The page position in this link is malformed — showing the newest entries.');
    }
  }

  const buildParams = useCallback(
    (next: { filters?: FilterState; sort?: SortState | null; cursor?: string | null }) => {
      const params = new URLSearchParams(searchParams);
      // Filters
      for (const filter of filters) {
        const key = paramKey(id, `f.${filter.key}`);
        const value = (next.filters ?? parsedFilters)[filter.key] ?? '';
        if (value) params.set(key, value);
        else params.delete(key);
      }
      // Sort
      const sortKey = paramKey(id, 'sort');
      const dirKey = paramKey(id, 'dir');
      const nextSort = next.sort !== undefined ? next.sort : sort;
      if (nextSort) {
        params.set(sortKey, nextSort.key);
        params.set(dirKey, nextSort.direction);
      } else {
        params.delete(sortKey);
        params.delete(dirKey);
      }
      // Cursor
      const cursorKeyP = paramKey(id, 'cursor');
      const nextCursor = next.cursor !== undefined ? next.cursor : cursor;
      if (nextCursor) params.set(cursorKeyP, nextCursor);
      else params.delete(cursorKeyP);
      return params;
    },
    [searchParams, filters, id, parsedFilters, sort, cursor],
  );

  const setFilters = useCallback(
    (nextFilters: FilterState) => {
      // Applying filters always returns to the newest page.
      const params = buildParams({ filters: nextFilters, cursor: null });
      setSearchParams(params, { state: { [trailKey]: [] } });
    },
    [buildParams, setSearchParams, trailKey],
  );

  const setSort = useCallback(
    (nextSort: SortState | null) => {
      // Sort also resets to newest.
      const params = buildParams({ sort: nextSort, cursor: null });
      setSearchParams(params, { state: { [trailKey]: [] } });
    },
    [buildParams, setSearchParams, trailKey],
  );

  const setCursor = useCallback(
    (next: { cursor: string | null; trail: (string | null)[] }) => {
      const params = buildParams({ cursor: next.cursor });
      setSearchParams(params, { state: { [trailKey]: next.trail } });
    },
    [buildParams, setSearchParams, trailKey],
  );

  const clearFilters = useCallback(() => {
    const cleared: FilterState = {};
    for (const f of filters) cleared[f.key] = '';
    setFilters(cleared);
  }, [filters, setFilters]);

  const pageNumber = cursor === null ? 1 : cursorTrail.length > 0 ? cursorTrail.length + 1 : null;

  return {
    filters: parsedFilters,
    sort,
    cursor,
    cursorTrail,
    issues,
    setFilters,
    setSort,
    setCursor,
    clearFilters,
    pageNumber,
  };
}

// Small helper used internally so consumers don't need to repeat it.
export function hasActiveTableFilters(filters: FilterState): boolean {
  return Object.values(filters).some((v) => Boolean(String(v).trim()));
}
