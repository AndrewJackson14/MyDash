import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { Z, DISPLAY, COND, BODY, R, Ri, FS, FW, INV } from '../lib/theme';

export default function LoginPage({ onSkip }) {
  const { signInWithGoogle, signInWithEmail, isOnline } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('splash'); // splash → login

  // After logo breathes, transition to login
  const onLogoSettled = () => {
    setTimeout(() => setPhase('login'), 2200);
  };

  const handleEmail = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try { await signInWithEmail(email, password); }
    catch (err) { setError(err.message || 'Sign in failed'); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: Z.bg, fontFamily: BODY, position: 'relative', overflow: 'hidden' }}>

      {/* LOGO — always visible, moves up when login appears */}
      <motion.div
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, zIndex: 10 }}
        initial={{ y: 0 }}
        animate={phase === 'login' ? { y: -100, scale: 0.45 } : { y: 0, scale: 1 }}
        transition={phase === 'login' ? { duration: 1, ease: [0.4, 0, 0.2, 1] } : {}}
      >
        {/* Logo image — springs in big */}
        <motion.img
          src="/logo.png"
          alt="13 Stars Media"
          style={{ width: 200, height: 200, objectFit: 'contain' }}
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 16, mass: 1, delay: 0.2 }}
          onAnimationComplete={onLogoSettled}
        />

        {/* Company name — fades in after logo */}
        <motion.div
          style={{ textAlign: 'center' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.0, ease: 'easeOut' }}
        >
          <div style={{ fontSize: FS.title, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, letterSpacing: -0.3 }}>
            13 Stars Media
          </div>
          <div style={{ fontSize: FS.md, color: Z.td, fontFamily: COND, fontWeight: FW.semi, marginTop: 4 }}>
            MyDash
          </div>
        </motion.div>
      </motion.div>

      {/* LOGIN CARD — slides up after logo shrinks */}
      <AnimatePresence>
        {phase === 'login' && (
          <motion.div
            key="login"
            style={{
              position: 'absolute',
              width: 380,
              background: Z.sf,
              border: `1px solid ${Z.bd}`,
              borderRadius: R,
              padding: 40,
              top: '50%',
              marginTop: 20,
            }}
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1], delay: 0.15 }}
          >
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>
                Welcome back
              </h2>
              <p style={{ margin: 0, fontSize: FS.base, color: Z.td }}>Sign in to MyDash</p>
            </div>

            {!isOnline && (
              <div style={{ padding: 12, background: Z.sa, borderRadius: Ri, marginBottom: 20, fontSize: FS.base, color: Z.tm, textAlign: 'center' }}>
                Running in offline mode — no database connected.
                <br/>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
              </div>
            )}

            {isOnline && (
              <>
                <button onClick={signInWithGoogle}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, marginBottom: 20 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Sign in with Google
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{ flex: 1, height: 1, background: Z.bd }} />
                  <span style={{ fontSize: FS.sm, color: Z.td }}>or</span>
                  <div style={{ flex: 1, height: 1, background: Z.bd }} />
                </div>

                <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required
                    style={{ padding: '10px 14px', borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.md, outline: 'none' }} />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required
                    style={{ padding: '10px 14px', borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.md, outline: 'none' }} />
                  {error && <div style={{ fontSize: FS.base, color: Z.da }}>{error}</div>}
                  <button type="submit" disabled={loading}
                    style={{ padding: '12px 16px', border: 'none', borderRadius: Ri, background: Z.go, color: INV.light, fontSize: FS.md, fontWeight: FW.bold, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                    {loading ? 'Signing in...' : 'Sign In'}
                  </button>
                </form>
              </>
            )}

            <p style={{ marginTop: 24, fontSize: FS.sm, color: Z.td, textAlign: 'center' }}>
              Making Communities Better Through Print.™
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
