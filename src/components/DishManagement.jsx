import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, Search, X } from 'lucide-react';
import {
  addDish,
  editDish,
  fetchActiveDishes,
  restoreDish,
  softDeleteDish,
} from '../lib/firestore.js';

function normalizeDishName(name) {
  return name.trim().normalize('NFKC').toLocaleLowerCase('en-IN');
}

function getOperationError(error) {
  if (error.code === 'permission-denied') {
    return 'Permission denied. Make sure you are signed in with the authorized account.';
  }
  if (error.code === 'unavailable' || error.code === 'network-request-failed') {
    return 'Could not connect to Firestore. Check your connection and try again.';
  }
  return error.message || 'Something went wrong. Please try again.';
}

export function DishManagement({ onBack }) {
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);
  const [formName, setFormName] = useState('');
  const [savingForm, setSavingForm] = useState(false);
  const [pendingDishId, setPendingDishId] = useState('');
  const [undoItems, setUndoItems] = useState([]);
  const timers = useRef(new Map());

  const refreshDishes = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setLoadError('');
    try {
      const activeDishes = await fetchActiveDishes();
      setDishes(activeDishes);
      return true;
    } catch (error) {
      setLoadError(getOperationError(error));
      return false;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const activeTimers = timers.current;
    async function loadInitialDishes() {
      await refreshDishes(true);
    }
    loadInitialDishes();
    return () => {
      activeTimers.forEach((timer) => window.clearTimeout(timer));
      activeTimers.clear();
    };
  }, [refreshDishes]);

  const sortedDishes = useMemo(
    () => [...dishes].sort((left, right) => left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })),
    [dishes],
  );
  const filteredDishes = useMemo(() => {
    const needle = normalizeDishName(search);
    if (!needle) return sortedDishes;
    return sortedDishes.filter((dish) => normalizeDishName(dish.name).includes(needle));
  }, [search, sortedDishes]);

  function openAddForm() {
    setOperationError('');
    setNotice('');
    setForm({ dishId: null });
    setFormName('');
  }

  function openEditForm(dish) {
    setOperationError('');
    setNotice('');
    setForm({ dishId: dish.id });
    setFormName(dish.name);
  }

  function closeForm() {
    if (savingForm) return;
    setForm(null);
    setFormName('');
    setOperationError('');
  }

  async function submitForm(event) {
    event.preventDefault();
    const name = formName.trim();
    if (!name) {
      setOperationError('Enter a dish name.');
      return;
    }

    const normalized = normalizeDishName(name);
    const duplicate = dishes.find((dish) => (
      dish.id !== form.dishId && normalizeDishName(dish.name) === normalized
    ));
    if (duplicate) {
      setOperationError('An active dish with this name already exists.');
      return;
    }

    setSavingForm(true);
    setOperationError('');
    setNotice('');
    try {
      if (form.dishId) {
        await editDish(form.dishId, { name });
        setNotice('Dish name updated.');
      } else {
        await addDish(name);
        setNotice('Dish added.');
      }
      setForm(null);
      setFormName('');
      await refreshDishes();
    } catch (error) {
      setOperationError(getOperationError(error));
    } finally {
      setSavingForm(false);
    }
  }

  function removeUndoItem(dishId) {
    const timer = timers.current.get(dishId);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(dishId);
    setUndoItems((items) => items.filter((item) => item.dishId !== dishId));
  }

  async function deleteDish(dish) {
    const confirmed = window.confirm(`Delete “${dish.name}” from the active dish list?`);
    if (!confirmed) return;

    setPendingDishId(dish.id);
    setOperationError('');
    setNotice('');
    try {
      await softDeleteDish(dish.id);
      setNotice('Dish removed from the active list.');
      const undoItem = { dishId: dish.id, name: dish.name };
      setUndoItems((items) => [...items.filter((item) => item.dishId !== dish.id), undoItem]);
      const timer = window.setTimeout(() => removeUndoItem(dish.id), 5000);
      timers.current.set(dish.id, timer);
      await refreshDishes();
    } catch (error) {
      setOperationError(getOperationError(error));
    } finally {
      setPendingDishId('');
    }
  }

  async function undoDelete(item) {
    setPendingDishId(item.dishId);
    setOperationError('');
    setNotice('');
    const timer = timers.current.get(item.dishId);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(item.dishId);
    try {
      await restoreDish(item.dishId);
      removeUndoItem(item.dishId);
      setNotice('Dish restored to the active list.');
      await refreshDishes();
    } catch (error) {
      setOperationError(getOperationError(error));
      const retryTimer = window.setTimeout(() => removeUndoItem(item.dishId), 5000);
      timers.current.set(item.dishId, retryTimer);
    } finally {
      setPendingDishId('');
    }
  }

  return (
    <div className="site-shell management-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="ghar ka khana home">ghar ka khana<span>.</span></a>
        <button className="back-link" type="button" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          Back home
        </button>
      </header>

      <main className="management-main">
        <div className="management-heading">
          <div>
            <p className="eyebrow">GHAR KI RASOI SE</p>
            <h1>Manage dishes</h1>
            <p className="management-subtitle">Aapki ghar ki meal list</p>
          </div>
          <button className="primary-button add-dish-button" type="button" onClick={openAddForm} disabled={Boolean(form) || Boolean(pendingDishId)}>
            <Plus size={16} aria-hidden="true" />
            Add a dish
          </button>
        </div>

        <div className="dish-summary-row">
          <p><strong>{dishes.length}</strong> active {dishes.length === 1 ? 'dish' : 'dishes'}</p>
          <label className="dish-search">
            <Search size={16} aria-hidden="true" />
            <span className="visually-hidden">Search dishes by name</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search dishes"
              aria-label="Search dishes"
            />
          </label>
        </div>

        {form && (
          <form className="dish-editor" onSubmit={submitForm} aria-labelledby="dish-editor-title">
            <div className="editor-topline">
              <h2 id="dish-editor-title">{form.dishId ? 'Edit dish' : 'Add a dish'}</h2>
              <button className="icon-button" type="button" onClick={closeForm} aria-label="Close form" disabled={savingForm}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <label htmlFor="dish-name">Dish name</label>
            <input
              id="dish-name"
              type="text"
              value={formName}
              onChange={(event) => setFormName(event.target.value)}
              maxLength={120}
              autoFocus
              disabled={savingForm}
              required
            />
            {operationError && <p className="management-error" role="alert">{operationError}</p>}
            <div className="editor-actions">
              <button className="primary-button" type="submit" disabled={savingForm}>
                {savingForm ? 'Saving…' : form.dishId ? 'Save changes' : 'Add dish'}
              </button>
              <button className="quiet-button" type="button" onClick={closeForm} disabled={savingForm}>Cancel</button>
            </div>
          </form>
        )}

        {!form && operationError && <p className="management-error" role="alert">{operationError}</p>}
        {notice && <p className="management-notice" role="status">{notice}</p>}

        {undoItems.length > 0 && (
          <div className="undo-list" aria-live="polite">
            {undoItems.map((item) => (
              <p className="undo-notice" key={item.dishId}>
                <span>“{item.name}” deleted.</span>
                <button type="button" onClick={() => undoDelete(item)} disabled={Boolean(pendingDishId)}>
                  {pendingDishId === item.dishId ? 'Restoring…' : 'Undo'}
                </button>
              </p>
            ))}
          </div>
        )}

        {loadError ? (
          <section className="management-message" role="alert">
            <p>{loadError}</p>
            <button className="quiet-button" type="button" onClick={() => refreshDishes(true)}>Try again</button>
          </section>
        ) : loading ? (
          <p className="management-message" role="status" aria-busy="true">Loading dishes…</p>
        ) : dishes.length === 0 ? (
          <section className="management-message">
            <h2>No active dishes yet.</h2>
            <p>Add a dish to start building your meal list.</p>
          </section>
        ) : filteredDishes.length === 0 ? (
          <p className="management-message">No dishes match “{search}”.</p>
        ) : (
          <ul className="management-dish-list" aria-label="Active dishes">
            {filteredDishes.map((dish) => (
              <li key={dish.id}>
                <span className="management-dish-name">{dish.name}</span>
                <div className="dish-row-actions">
                  <button type="button" className="quiet-button" onClick={() => openEditForm(dish)} disabled={Boolean(pendingDishId) || Boolean(form)}>
                    Edit
                  </button>
                  <button type="button" className="quiet-button delete-action" onClick={() => deleteDish(dish)} disabled={Boolean(pendingDishId) || Boolean(form)}>
                    {pendingDishId === dish.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="site-footer">
        <span>ghar ka khana.</span>
        <span>Ghar jaisa, roz.</span>
      </footer>
    </div>
  );
}
