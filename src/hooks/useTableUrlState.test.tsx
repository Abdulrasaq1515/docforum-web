import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTableUrlState } from '../components/DataTable';
import type { FilterDefinition } from '../components/DataTable';

// useTableUrlState reads + writes URL state via react-router's useSearchParams.
// We render the hook inside a MemoryRouter with an initial entry so we can
// drive the URL deterministically.

const filters: FilterDefinition[] = [
  { key: 'name', kind: 'text', label: 'Name' },
  {
    key: 'status',
    kind: 'select',
    label: 'Status',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'pending', label: 'Pending' },
    ],
  },
];

import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

describe('useTableUrlState', () => {
  it('reads filters, sort and cursor from the URL', () => {
    const initial =
      '?test.f.name=Alice&test.f.status=active&test.sort=id&test.dir=asc&test.cursor=abc123';
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[{ search: initial }]}>{children}</MemoryRouter>
    );
    const { result } = renderHook(
      () => useTableUrlState({ id: 'test', filters }),
      { wrapper },
    );
    expect(result.current.filters.name).toBe('Alice');
    expect(result.current.filters.status).toBe('active');
    expect(result.current.sort).toEqual({ key: 'id', direction: 'asc' });
    expect(result.current.cursor).toBe('abc123');
  });

  it('drops invalid filter values and reports them in issues', () => {
    const initial = '?test.f.name=<bad>';
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[{ search: initial }]}>{children}</MemoryRouter>
    );
    const { result } = renderHook(
      () => useTableUrlState({ id: 'test', filters }),
      { wrapper },
    );
    expect(result.current.filters.name).toBe('');
    expect(result.current.issues.length).toBeGreaterThan(0);
  });

  it('drops unknown select options', () => {
    const initial = '?test.f.status=unknown';
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[{ search: initial }]}>{children}</MemoryRouter>
    );
    const { result } = renderHook(
      () => useTableUrlState({ id: 'test', filters }),
      { wrapper },
    );
    expect(result.current.filters.status).toBe('');
    expect(result.current.issues.some((m) => /Status/.test(m))).toBe(true);
  });

  it('drops malformed cursors and shows newest', () => {
    const initial = '?test.cursor=has space';
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[{ search: initial }]}>{children}</MemoryRouter>
    );
    const { result } = renderHook(
      () => useTableUrlState({ id: 'test', filters }),
      { wrapper },
    );
    expect(result.current.cursor).toBeNull();
    expect(result.current.issues.some((m) => /page position/i.test(m))).toBe(true);
  });

  it('returns the default sort when URL has none', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    );
    const { result } = renderHook(
      () => useTableUrlState({ id: 'test', filters, defaultSort: { key: 'createdAt', direction: 'desc' } }),
      { wrapper },
    );
    expect(result.current.sort).toEqual({ key: 'createdAt', direction: 'desc' });
  });

  it('pageNumber is null on a deep link with no trail', () => {
    const initial = '?test.cursor=abc';
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[{ search: initial }]}>{children}</MemoryRouter>
    );
    const { result } = renderHook(
      () => useTableUrlState({ id: 'test', filters }),
      { wrapper },
    );
    expect(result.current.pageNumber).toBeNull();
  });
});
