import { Check, ChevronRight } from 'lucide-react';

export function DishBrowser({ dishes, selectedDishId, saving, onSelectDish }) {
  return (
    <section className="dish-browser" id="dish-browser" aria-labelledby="dish-browser-title">
      <div className="browser-heading">
        <div>
          <p className="eyebrow">RASOI KI LIST</p>
          <h2 id="dish-browser-title">Aaj ka mann?</h2>
        </div>
        <span>{dishes.length} dishes</span>
      </div>
      <ul className="dish-list">
        {dishes.map((dish, index) => {
          const isSelected = dish.id === selectedDishId;
          return (
            <li key={dish.id}>
              <button
                className={`dish-option${isSelected ? ' is-selected' : ''}`}
                type="button"
                onClick={() => onSelectDish(dish)}
                disabled={saving || isSelected}
                aria-current={isSelected ? 'true' : undefined}
              >
                <span className="dish-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="dish-name">{dish.name}</span>
                {isSelected ? <Check size={17} aria-label="Aaj ki pasand" /> : <ChevronRight size={17} aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="browser-footnote">Kisi dish par tap karein — aaj ke liye wahi save ho jayegi.</p>
    </section>
  );
}
