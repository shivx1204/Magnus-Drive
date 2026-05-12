import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export default function CategoryAccordion({
  groups,
  accentColor = 'var(--accent)',
  renderCard,
  gridClass,
  enableSearch = false,
  searchPlaceholder = 'Search product...',
}) {
  const [openCats, setOpenCats] = useState(new Set());
  const [query, setQuery] = useState('');
  const prevOpenCatsRef = useRef(null);
  const categories = Object.keys(groups);
  const allOpen = categories.length > 0 && categories.every((c) => openCats.has(c));

  const toggleCat = useCallback((cat) => {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setOpenCats(allOpen ? new Set() : new Set(categories));
  }, [allOpen, categories]);

  if (!categories.length) return null;

  const normalizedQuery = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!enableSearch || !normalizedQuery) return groups;
    const next = {};
    Object.entries(groups).forEach(([cat, prods]) => {
      const matches = (prods || []).filter((p) => {
        const code = (p?.code || '').toString().toLowerCase();
        const name = (p?.name || '').toString().toLowerCase();
        const barcode = (p?.barcode || '').toString().toLowerCase();
        return code.includes(normalizedQuery) || name.includes(normalizedQuery) || barcode.includes(normalizedQuery);
      });
      if (matches.length) next[cat] = matches;
    });
    return next;
  }, [enableSearch, groups, normalizedQuery]);

  const visibleCategories = useMemo(() => Object.keys(filteredGroups), [filteredGroups]);

  useEffect(() => {
    if (!enableSearch) return;
    if (!normalizedQuery) {
      if (prevOpenCatsRef.current) {
        setOpenCats(prevOpenCatsRef.current);
        prevOpenCatsRef.current = null;
      }
      return;
    }
    if (!prevOpenCatsRef.current) prevOpenCatsRef.current = openCats;
    setOpenCats(new Set(visibleCategories));
  }, [enableSearch, normalizedQuery, visibleCategories]); // intentionally not depending on openCats

  return (
    <div className="cat-accordion">
      {enableSearch && (
        <div className="mb-2 flex items-center gap-2">
          <div
            className="flex-1 flex items-center rounded-lg overflow-hidden border px-3"
            style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}
          >
            <span className="text-sm mr-2 opacity-50">🔎</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full py-2 outline-none text-xs bg-transparent"
              style={{ color: 'var(--ink)' }}
            />
          </div>
          {normalizedQuery && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="px-3 py-2 rounded-lg text-xs font-bold"
              style={{ background: 'var(--soft)', color: 'var(--muted)', border: '1px solid var(--line)' }}
              title="Clear search"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="cat-pill-bar">
        <button
          type="button"
          onClick={toggleAll}
          className="cat-pill cat-pill-toggle"
          style={{
            background: allOpen ? accentColor : 'var(--soft)',
            color: allOpen ? '#fff' : 'var(--muted)',
            borderColor: allOpen ? accentColor : 'var(--line)',
          }}
        >
          {allOpen ? '⊟ Collapse' : '⊞ Expand'}
        </button>
        {visibleCategories.map((cat) => {
          const isOpen = openCats.has(cat);
          return (
            <button
              type="button"
              key={cat}
              onClick={() => toggleCat(cat)}
              className={`cat-pill ${isOpen ? 'cat-pill-active' : ''}`}
              style={{
                background: isOpen ? accentColor : 'var(--soft)',
                color: isOpen ? '#fff' : 'var(--ink)',
                borderColor: isOpen ? accentColor : 'var(--line)',
              }}
            >
              <span className="cat-pill-name">{cat}</span>
              <span className="cat-pill-count">({filteredGroups[cat].length})</span>
              <span className={`cat-pill-chevron ${isOpen ? 'cat-pill-chevron-open' : ''}`}>▾</span>
            </button>
          );
        })}
      </div>

      {visibleCategories.map((cat) => {
        const isOpen = openCats.has(cat);
        if (!isOpen) return null;
        return (
          <div key={cat} className="cat-panel" style={{ overflow: 'hidden' }}>
            <div className="cat-panel-inner" style={{ borderLeftColor: accentColor }}>
              <div className="cat-panel-label" style={{ color: accentColor }}>{cat}</div>
              <div className={gridClass || 'grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1.5'}>
                {filteredGroups[cat].map((p) => renderCard(p, cat))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
