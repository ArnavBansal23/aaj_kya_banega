import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, RotateCw, Settings2 } from 'lucide-react';
import { DishBrowser } from './components/DishBrowser.jsx';
import { DishManagement } from './components/DishManagement.jsx';
import { logOut, onAuthStateChange, signIn } from './lib/auth.js';
import {
  fetchActiveDishes,
  fetchDailyRecommendation,
  saveDailyRecommendation,
} from './lib/firestore.js';
import './App.css';

const TIME_ZONE = 'Asia/Kolkata';
const recommendationLoads = new Map();

function getTodayId() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(dateId, amount) {
  const [year, month, day] = dateId.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function formatDate(dateId) {
  const [year, month, day] = dateId.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function chooseDish(dishes, excludedIds = []) {
  const alternatives = dishes.filter((dish) => !excludedIds.includes(dish.id));
  const choices = alternatives.length > 0 ? alternatives : dishes;
  return choices[Math.floor(Math.random() * choices.length)];
}

function loadOrCreateTodayRecommendation(todayId, dishes) {
  if (!recommendationLoads.has(todayId)) {
    const task = (async () => {
      const existing = await fetchDailyRecommendation(todayId);
      const savedDish = existing && dishes.find((dish) => dish.id === existing.dishId);
      if (savedDish) return savedDish;

      const recentRecommendations = await Promise.all(
        [1, 2, 3].map((daysAgo) => fetchDailyRecommendation(shiftDate(todayId, -daysAgo))),
      );
      const recentlyServedIds = recentRecommendations
        .filter(Boolean)
        .map((recommendation) => recommendation.dishId);
      const nextDish = chooseDish(dishes, recentlyServedIds);
      await saveDailyRecommendation({
        dishId: nextDish.id,
        dishName: nextDish.name,
        date: todayId,
      });
      return nextDish;
    })().catch((error) => {
      recommendationLoads.delete(todayId);
      throw error;
    });
    recommendationLoads.set(todayId, task);
  }
  return recommendationLoads.get(todayId);
}

function HomeScreen({ onManage, onLogout, logoutPending, logoutError }) {
  const [todayId] = useState(getTodayId);
  const [dishes, setDishes] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAllDishes, setShowAllDishes] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    async function loadHome() {
      setLoading(true);
      setError('');
      try {
        const activeDishes = await fetchActiveDishes();
        if (!isCurrent) return;
        setDishes(activeDishes);

        if (activeDishes.length === 0) {
          setRecommendation(null);
          return;
        }

        const dailyDish = await loadOrCreateTodayRecommendation(todayId, activeDishes);
        if (isCurrent) setRecommendation(dailyDish);
      } catch (loadError) {
        if (isCurrent) setError(loadError.message || 'Kuch gadbad ho gayi.');
      } finally {
        if (isCurrent) setLoading(false);
      }
    }

    loadHome();
    return () => {
      isCurrent = false;
    };
  }, [todayId, reloadToken]);

  const saveSelection = useCallback(async (dish) => {
    setSaving(true);
    setError('');
    try {
      await saveDailyRecommendation({
        dishId: dish.id,
        dishName: dish.name,
        date: todayId,
      });
      setRecommendation(dish);
      return true;
    } catch (saveError) {
      setError(saveError.message || 'Dish save nahi ho paayi. Dobara try karein.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [todayId]);

  const showAnotherDish = async () => {
    if (saving || dishes.length === 0) return;

    const previousDays = [1, 2, 3].map((daysAgo) => shiftDate(todayId, -daysAgo));
    setSaving(true);
    setError('');
    try {
      const recentRecommendations = await Promise.all(
        previousDays.map((date) => fetchDailyRecommendation(date)),
      );
      const excludedIds = recentRecommendations
        .filter(Boolean)
        .map((dailyMeal) => dailyMeal.dishId);
      if (recommendation) excludedIds.push(recommendation.id);

      const nextDish = chooseDish(dishes, excludedIds);
      await saveDailyRecommendation({
        dishId: nextDish.id,
        dishName: nextDish.name,
        date: todayId,
      });
      setRecommendation(nextDish);
    } catch (saveError) {
      setError(saveError.message || 'Nayi dish save nahi ho paayi. Dobara try karein.');
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = formatDate(todayId);

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="ghar ka khana home">ghar ka khana<span>.</span></a>
        <div className="header-tools">
          <span className="header-note">Roz ke khaane ki chhoti si madad</span>
          <details className="account-menu">
            <summary aria-label="Settings and account options" title="Account options">
              <Settings2 size={17} aria-hidden="true" />
            </summary>
            <div className="account-menu-popover">
              <span>Shared account</span>
              <button type="button" onClick={onManage}>Manage dishes</button>
              <button type="button" onClick={onLogout} disabled={logoutPending}>
                {logoutPending ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </details>
        </div>
      </header>

      {logoutError && <p className="auth-inline-error" role="alert">{logoutError}</p>}

      <main className="home-main">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">GHAR KI RASOI SE</p>
          <h1 id="page-title">Aaj kya banega?</h1>
          <p className="date-label"><span aria-hidden="true" />Aaj, {dateLabel}</p>
        </section>

        {loading ? (
          <section className="meal-panel loading-panel" aria-live="polite" aria-busy="true">
            <p className="eyebrow">AAJ KI PASAND</p>
            <p className="loading-copy">Aaj ka khaana soch rahe hain…</p>
          </section>
        ) : error && !recommendation ? (
          <section className="message-panel" role="alert">
            <p className="eyebrow">AAJ KI PASAND</p>
            <h2>Abhi khaana nahi mil paaya.</h2>
            <p>{error}</p>
            <button className="text-button" type="button" onClick={() => setReloadToken((token) => token + 1)}>
              Phir se koshish karein <ArrowRight size={16} aria-hidden="true" />
            </button>
          </section>
        ) : dishes.length === 0 ? (
          <section className="message-panel">
            <p className="eyebrow">AAJ KI PASAND</p>
            <h2>Rasoi abhi khaali hai.</h2>
            <p>Jab dishes add hongi, yahin se aaj ka khaana chunenge.</p>
          </section>
        ) : (
          <>
            <section className="meal-panel" aria-labelledby="meal-heading">
              <div className="meal-panel-topline">
                <p className="eyebrow">AAJ KI PASAND</p>
                <span className="edition-mark">01 <i /> 01</span>
              </div>
              {recommendation ? (
                <>
                  <h2 id="meal-heading" aria-live="polite">{recommendation.name}</h2>
                  <p className="meal-caption">Aaj yahi bana lete hain.</p>
                </>
              ) : (
                <p className="loading-copy">Aaj ka khaana soch rahe hain…</p>
              )}
              <div className="meal-rule" />
              <div className="meal-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={showAnotherDish}
                  disabled={saving || !recommendation}
                >
                  <RotateCw size={16} aria-hidden="true" />
                  {saving ? 'Soch rahe hain…' : 'Dusra dikhao'}
                </button>
                <span className="action-note">Ek aur idea chahiye?</span>
              </div>
            </section>

            {error && <p className="inline-error" role="alert">{error}</p>}

            <div className="browse-control">
              <div>
                <span className="browse-kicker">APNI MARZI SE</span>
                <p>Kuch aur mann hai?</p>
              </div>
              <button
                className="browse-toggle"
                type="button"
                aria-expanded={showAllDishes}
                aria-controls="dish-browser"
                onClick={() => setShowAllDishes((shown) => !shown)}
              >
                {showAllDishes ? 'Aaj ki dish' : 'Show all dishes'}
                {showAllDishes ? <ArrowLeft size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
              </button>
            </div>

            {showAllDishes && (
              <DishBrowser
                dishes={dishes}
                selectedDishId={recommendation?.id}
                saving={saving}
                onSelectDish={saveSelection}
              />
            )}
          </>
        )}
      </main>

      <footer className="site-footer">
        <span>ghar ka khana.</span>
        <span>Ghar jaisa, roz.</span>
      </footer>
    </div>
  );
}

function getSignInMessage(error) {
  switch (error.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password combination was not recognized. Please try again.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/too-many-requests':
      return 'There have been too many attempts. Please wait a little and try again.';
    case 'auth/network-request-failed':
      return 'We could not connect. Check your internet connection and try again.';
    default:
      return 'We could not sign you in. Please try again.';
  }
}

function LoginScreen({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await signIn(email, password);
      setPassword('');
      onSignedIn();
    } catch (signInError) {
      setError(getSignInMessage(signInError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="site-shell auth-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="ghar ka khana home">ghar ka khana<span>.</span></a>
        <span className="header-note">Roz ke khaane ki chhoti si madad</span>
      </header>
      <main className="login-main">
        <p className="eyebrow">GHAR KI RASOI SE</p>
        <h1>Welcome home.</h1>
        <p className="login-intro">Sign in to see what’s cooking today.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={submitting}
          />

          <label htmlFor="login-password">Password</label>
          <div className="password-field">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={submitting}
            />
            <button
              className="password-visibility"
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
              disabled={submitting}
            >
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>

          {error && <p className="login-error" role="alert">{error}</p>}

          <button className="primary-button login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
            {!submitting && <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </form>
        <p className="login-footnote">A little help with the everyday question.</p>
      </main>
      <footer className="site-footer">
        <span>ghar ka khana.</span>
        <span>Ghar jaisa, roz.</span>
      </footer>
    </div>
  );
}

function App() {
  const [authStatus, setAuthStatus] = useState('checking');
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [activeView, setActiveView] = useState('home');

  useEffect(() => onAuthStateChange((nextUser) => {
    setUser(nextUser);
    setAuthStatus(nextUser ? 'signed-in' : 'signed-out');
    if (!nextUser) setActiveView('home');
    setAuthError('');
    setLogoutError('');
  }, () => {
    setAuthError('We could not check your sign-in status. Please refresh and try again.');
    setAuthStatus('error');
  }), []);

  async function handleLogout() {
    setLogoutPending(true);
    setLogoutError('');
    try {
      await logOut();
    } catch {
      setLogoutError('We could not sign you out. Please try again.');
    } finally {
      setLogoutPending(false);
    }
  }

  if (authStatus === 'checking') {
    return (
      <div className="site-shell auth-shell">
        <header className="site-header">
          <span className="wordmark">ghar ka khana<span>.</span></span>
        </header>
        <main className="auth-loading" aria-live="polite" aria-busy="true">
          <span className="loading-indicator" aria-hidden="true" />
          <p>Checking your sign-in…</p>
        </main>
      </div>
    );
  }

  if (authStatus === 'error') {
    return (
      <div className="site-shell auth-shell">
        <header className="site-header">
          <span className="wordmark">ghar ka khana<span>.</span></span>
        </header>
        <main className="login-main" role="alert">
          <h1>One moment.</h1>
          <p className="login-intro">{authError}</p>
          <button className="text-button" type="button" onClick={() => window.location.reload()}>
            Refresh <ArrowRight size={16} aria-hidden="true" />
          </button>
        </main>
      </div>
    );
  }

  if (authStatus === 'signed-in' && user) {
    if (activeView === 'manage-dishes') {
      return <DishManagement onBack={() => setActiveView('home')} />;
    }
    return (
      <HomeScreen
        onManage={() => setActiveView('manage-dishes')}
        onLogout={handleLogout}
        logoutPending={logoutPending}
        logoutError={logoutError}
      />
    );
  }

  return <LoginScreen onSignedIn={() => setAuthStatus('checking')} />;
}

export default App;
