import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { DataProvider } from './hooks/useAppData';
import App from './App';
import LoginPage from './pages/LoginPage';

// Import local data generators for offline fallback
import { buildLocalData } from './data/local';

export default function AppRouter() {
  const { teamMember, loading, isOnline } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  // Auto-skip splash: offline after 3.8s animation, online immediately on auth
  useEffect(() => {
    if (!loading && !splashDone) {
      if (teamMember) {
        // Authenticated — skip splash immediately (or after brief delay if first load)
        const timer = setTimeout(() => setSplashDone(true), splashDone ? 0 : 800);
        return () => clearTimeout(timer);
      }
      if (!isOnline) {
        // Offline — play full animation then auto-enter
        const timer = setTimeout(() => setSplashDone(true), 3800);
        return () => clearTimeout(timer);
      }
    }
  }, [loading, teamMember, isOnline, splashDone]);

  // Show app after splash is done AND user is authenticated/offline
  if (splashDone && !loading && (teamMember || !isOnline)) {
    return (
      <DataProvider localData={buildLocalData()}>
        <App />
      </DataProvider>
    );
  }

  // Show LoginPage as the landing experience
  return <LoginPage onSkip={() => setSplashDone(true)} />;
}
