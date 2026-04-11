import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from './hooks/useAuth';
import { DataProvider } from './hooks/useAppData';
import App from './App';
import { buildLocalData } from './data/local';

// Lazy-load LoginPage (pulls in framer-motion — only needed before auth)
const LoginPage = lazy(() => import('./pages/LoginPage'));

export default function AppRouter() {
  const { user, teamMember, loading, isOnline } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  // Auto-skip splash: offline after 3.8s animation, online immediately on auth
  useEffect(() => {
    if (!loading && !splashDone) {
      if (user || teamMember) {
        // Authenticated — go straight to app (teamMember may still be loading)
        setSplashDone(true);
        return;
      }
      if (!isOnline) {
        // Offline — play full animation then auto-enter
        const timer = setTimeout(() => setSplashDone(true), 3800);
        return () => clearTimeout(timer);
      }
    }
  }, [loading, user, teamMember, isOnline, splashDone]);

  // Show app after auth resolved AND user is authenticated/offline
  if (splashDone && !loading && (user || teamMember || !isOnline)) {
    return (
      <DataProvider localData={buildLocalData()}>
        <App />
      </DataProvider>
    );
  }

  // Still checking auth — show minimal loading state (not the login page)
  if (loading) {
    return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#08090D" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 36, height: 36, borderRadius: 4, background: "#E8ECF2", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 17, color: "#08090D" }}>13</div>
      </div>
    </div>;
  }

  // Auth checked, no user — show LoginPage (unless user exists but teamMember still loading)
  if (user) {
    return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#08090D" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 36, height: 36, borderRadius: 4, background: "#E8ECF2", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 17, color: "#08090D" }}>13</div>
        <div style={{ marginTop: 12, color: "#525E72", fontSize: 12 }}>Loading your workspace...</div>
      </div>
    </div>;
  }
  return <Suspense fallback={null}><LoginPage onSkip={() => setSplashDone(true)} /></Suspense>;
}
