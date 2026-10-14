'use client';
import { useSelect } from 'kiss-for-react';
import Link from 'next/link';
import { State } from '@/src/business/State';
import { Filter } from '@/src/business/Filter';

/**
 * A second page, to show that the store survives client-side navigation: the todos added or
 * completed on the home page are counted here, since the store lives in the root layout,
 * which stays mounted. The counts are methods of the `TodoList` class, so this also shows
 * that the store holds class instances, not the JSON the server sent.
 */
export default function StatsPage() {
  const total = useSelect((s: State) => s.todoList.count());
  const completed = useSelect((s: State) => s.todoList.count(Filter.showCompleted));
  const active = useSelect((s: State) => s.todoList.count(Filter.showActive));
  return (
    <main className="appContentStyle">
      <h1 className="h1Style">Stats</h1>
      <p>
        The same store, after navigating: <strong data-testid="total">{total}</strong> todos,{' '}
        <strong data-testid="completed">{completed}</strong> completed,{' '}
        <strong data-testid="active">{active}</strong> active.
      </p>
      <p>
        <Link href="/" data-testid="back-to-todos">Back to the todos</Link>
      </p>
    </main>
  );
}
