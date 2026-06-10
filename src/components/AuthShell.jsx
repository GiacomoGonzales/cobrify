/**
 * AuthShell — Fondo y estilo de la landing (Cobrify) para páginas de autenticación.
 * Reutilizable para ir actualizando el estilo de Login, Register, etc. de forma consistente.
 * Paleta navy/blue + Plus Jakarta Sans + degradado mesh sutil (estilo Stripe), igual que LandingPageV2.
 */
export default function AuthShell({ children, className = 'max-w-md' }) {
  return (
    <div className="auth-shell relative min-h-screen flex items-center justify-center p-4">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .auth-shell {
          --navy:#0A2540; --body:#425466; --soft:#F6F9FC; --border:#E6EBF1; --blue:#2563EB; --blue-dark:#1D4ED8;
          background: linear-gradient(160deg, #F4F8FF 0%, #EBF5FB 52%, #F5F2FF 100%);
          color: var(--navy);
          font-family: 'Plus Jakarta Sans', -apple-system, 'Segoe UI', sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .auth-shell-bg { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
        .auth-shell-ribbon {
          position: absolute; left: -10%; right: -10%; top: -22%; height: 720px;
          transform: skewY(-8deg); transform-origin: top left;
          background:
            radial-gradient(42% 60% at 18% 42%, rgba(37, 99, 235, .18), transparent 70%),
            radial-gradient(38% 55% at 62% 28%, rgba(6, 182, 212, .16), transparent 70%),
            radial-gradient(46% 62% at 88% 58%, rgba(59, 130, 246, .13), transparent 70%);
          background-size: 160% 160%;
          animation: auth-mesh 16s ease-in-out infinite alternate;
        }
        .auth-shell-ribbon::after {
          content: ''; position: absolute; inset: 0;
          background:
            radial-gradient(30% 45% at 40% 70%, rgba(14, 165, 233, .14), transparent 70%),
            radial-gradient(26% 40% at 75% 20%, rgba(99, 162, 255, .14), transparent 70%);
          background-size: 170% 170%;
          animation: auth-mesh 22s ease-in-out infinite alternate-reverse;
        }
        @keyframes auth-mesh { 0% { background-position: 0% 0%; } 100% { background-position: 100% 100%; } }
        @media (prefers-reduced-motion: reduce) {
          .auth-shell-ribbon, .auth-shell-ribbon::after { animation: none !important; }
        }
      `}</style>
      <div className="auth-shell-bg" aria-hidden="true"><div className="auth-shell-ribbon" /></div>
      <div className={`relative z-10 w-full ${className}`}>{children}</div>
    </div>
  )
}
