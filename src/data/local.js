// Empty offline-mode stubs. AppRouter passes the result to DataProvider
// as the initial state for `useAppData`. For online users the real
// Supabase data overwrites these immediately. For offline users App.jsx
// lazy-imports the actual seed fixtures (`./seed`) when `online` resolves
// false and populates its own _* state via setters — so this module no
// longer pulls seed.js into the cold-load critical path.
export function buildLocalData() {
  return {
    pubs: [],
    issues: [],
    stories: [],
    clients: [],
    sales: [],
    proposals: [],
    team: [],
    notifications: [],
  };
}
