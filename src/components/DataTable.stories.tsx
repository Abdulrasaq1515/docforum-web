// DataTable stories (CSF 3).
//
// Storybook itself isn't wired up in this repo yet — it's tracked as issue #97
// ("Storybook component library with interaction and accessibility tests").
// These stories follow the standard CSF 3 format so they're ready to be
// imported by `.storybook/main.ts` the moment Storybook is added, and they
// also serve as living, runnable examples of the table's states for anyone
// reading the code. They deliberately exercise every visual variant the
// component exposes: default, loading, empty, error, paginated, filtered,
// and sorted.
//
// Until Storybook is installed (#97), the `Meta`/`StoryObj` types are stubbed
// locally so this file typechecks standalone — swap them for
// `import type { Meta, StoryObj } from '@storybook/react'` when #97 lands.

import type { ComponentType, ReactNode } from 'react';
import { DataTable, type Column, type FilterDefinition, type SortState } from './DataTable';

type Meta<C> = {
  title: string;
  component: ComponentType<C>;
  tags?: string[];
  parameters?: Record<string, unknown>;
};

type StoryObj = {
  name: string;
  render: () => ReactNode;
};

function defineMeta<C>(meta: Meta<C>): Meta<C> {
  return meta;
}

export default defineMeta<typeof DataTable<unknown>>({
  title: 'Components/DataTable',
  component: DataTable as unknown as ComponentType<unknown>,
  tags: ['autodocs'],
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
});

interface Row {
  id: string;
  name: string;
  status: 'active' | 'pending' | 'closed';
  createdAt: string;
}

const columns: Column<Row>[] = [
  { key: 'id', header: 'ID', cell: (r) => <code>{r.id}</code>, sortable: true },
  { key: 'name', header: 'Name', cell: (r) => r.name, sortable: true },
  { key: 'status', header: 'Status', cell: (r) => r.status, sortable: true },
  {
    key: 'createdAt',
    header: 'Created',
    cell: (r) => <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleDateString()}</time>,
    sortable: true,
  },
];

const filters: FilterDefinition[] = [
  { key: 'name', kind: 'text', label: 'Name', placeholder: 'Filter by name' },
  {
    key: 'status',
    kind: 'select',
    label: 'Status',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'pending', label: 'Pending' },
      { value: 'closed', label: 'Closed' },
    ],
  },
];

const rows: Row[] = [
  { id: 'ord-001', name: 'Alice Atkinson', status: 'active', createdAt: '2026-09-14T10:00:00Z' },
  { id: 'ord-002', name: 'Bob Brown', status: 'pending', createdAt: '2026-09-15T14:30:00Z' },
  { id: 'ord-003', name: 'Carol Cooper', status: 'closed', createdAt: '2026-09-16T09:15:00Z' },
  { id: 'ord-004', name: 'Dan Davies', status: 'active', createdAt: '2026-09-17T11:45:00Z' },
];

type Story = StoryObj;

export const Default: Story = {
  name: 'Default',
  render: () => (
    <DataTable
      caption="Orders"
      id="orders"
      columns={columns}
      filters={filters}
      filterValues={{}}
      onFiltersChange={() => {}}
      sort={null}
      onSortChange={() => {}}
      cursor={null}
      cursorTrail={[]}
      onCursorChange={() => {}}
      rows={rows}
      nextCursor="cursor-page-2"
      isLoading={false}
      rowKey={(r) => r.id}
    />
  ),
};

export const Loading: Story = {
  name: 'Loading',
  render: () => (
    <DataTable
      caption="Orders"
      id="orders"
      columns={columns}
      filters={filters}
      filterValues={{}}
      rows={[]}
      isLoading={true}
      nextCursor={null}
      rowKey={(r) => r.id}
    />
  ),
};

export const Empty: Story = {
  name: 'Empty state',
  render: () => (
    <DataTable
      caption="Orders"
      id="orders"
      columns={columns}
      filters={filters}
      filterValues={{}}
      rows={[]}
      isLoading={false}
      nextCursor={null}
      emptyMessage="No orders match these filters."
      rowKey={(r) => r.id}
    />
  ),
};

export const ErrorState: Story = {
  name: 'Error state',
  render: () => (
    <DataTable
      caption="Orders"
      id="orders"
      columns={columns}
      filters={filters}
      filterValues={{}}
      rows={[]}
      isLoading={false}
      nextCursor={null}
      error={new Error('docforum-core is waking up — try again in a minute.')}
      onRetry={() => {}}
      rowKey={(r) => r.id}
    />
  ),
};

export const Sorted: Story = {
  name: 'Sorted ascending',
  render: () => (
    <DataTable
      caption="Orders"
      id="orders"
      columns={columns}
      filters={filters}
      filterValues={{}}
      sort={{ key: 'createdAt', direction: 'asc' } as SortState}
      onSortChange={() => {}}
      rows={rows}
      nextCursor={null}
      isLoading={false}
      rowKey={(r) => r.id}
    />
  ),
};

export const Paginated: Story = {
  name: 'Mid-list (paginated)',
  render: () => (
    <DataTable
      caption="Orders"
      id="orders"
      columns={columns}
      filters={filters}
      filterValues={{}}
      cursor="cursor-page-2"
      cursorTrail={[null]}
      onCursorChange={() => {}}
      rows={rows.slice(0, 2)}
      nextCursor="cursor-page-3"
      isLoading={false}
      rowKey={(r) => r.id}
    />
  ),
};

export const Filtered: Story = {
  name: 'Filtered',
  render: () => (
    <DataTable
      caption="Orders"
      id="orders"
      columns={columns}
      filters={filters}
      filterValues={{ name: 'Alice', status: 'active' }}
      onFiltersChange={() => {}}
      rows={rows.filter((r) => r.name.startsWith('Alice') && r.status === 'active')}
      nextCursor={null}
      isLoading={false}
      rowKey={(r) => r.id}
    />
  ),
};
