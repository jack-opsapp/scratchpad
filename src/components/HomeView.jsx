import { useState, useRef, useEffect } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { colors, transitions } from '../styles/theme.js';
import { NoteCard } from './NoteCard.jsx';

/**
 * Home View - masonry grid of page/section cards with tap-to-expand animation.
 * Shows all notes across all pages grouped by page > section.
 */
export function HomeView({
  notes,
  pages,
  allSections,
  user,
  onNavigate,
  onToggle,
  onEdit,
  onDelete,
  onTagClick,
  newNoteId,
}) {
  const [expandedCard, setExpandedCard] = useState(null); // { pageId, sectionId }
  const [animating, setAnimating] = useState(false);
  const cardRefs = useRef({});
  const expandedRef = useRef(null);

  // Group notes by page, then section
  const grouped = {};
  for (const note of notes) {
    const section = allSections.find(s => s.id === note.sectionId);
    if (!section) continue;
    const pageId = section.pageId;
    if (!grouped[pageId]) grouped[pageId] = {};
    if (!grouped[pageId][section.id]) grouped[pageId][section.id] = [];
    grouped[pageId][section.id].push(note);
  }

  // Sort pages by most recent note
  const pageOrder = Object.keys(grouped).sort((a, b) => {
    const aMax = Math.max(...Object.values(grouped[a]).flat().map(n => n.createdAt || new Date(n.created_at || 0).getTime() || 0));
    const bMax = Math.max(...Object.values(grouped[b]).flat().map(n => n.createdAt || new Date(n.created_at || 0).getTime() || 0));
    return bMax - aMax;
  });

  // Build flat list of cards: each is a page/section combo
  const cards = [];
  for (const pageId of pageOrder) {
    const page = pages.find(p => p.id === pageId);
    if (!page) continue;
    const pageSections = grouped[pageId];
    for (const [sectionId, sectionNotes] of Object.entries(pageSections)) {
      const section = allSections.find(s => s.id === sectionId);
      if (!section) continue;
      const sorted = [...sectionNotes].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      cards.push({ pageId, sectionId, page, section, notes: sorted });
    }
  }

  // Scroll expanded card into view
  useEffect(() => {
    if (expandedCard && expandedRef.current) {
      expandedRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [expandedCard]);

  const isExpanded = (pageId, sectionId) =>
    expandedCard?.pageId === pageId && expandedCard?.sectionId === sectionId;

  const handleCardClick = (pageId, sectionId) => {
    if (isExpanded(pageId, sectionId)) {
      setAnimating(true);
      setExpandedCard(null);
      setTimeout(() => setAnimating(false), 300);
    } else {
      setAnimating(true);
      setExpandedCard({ pageId, sectionId });
      setTimeout(() => setAnimating(false), 300);
    }
  };

  if (cards.length === 0) {
    return (
      <div style={{ padding: '60px 40px', textAlign: 'center' }}>
        <p style={{
          color: colors.textMuted,
          fontSize: 14,
          fontFamily: "'Inter', sans-serif",
        }}>
          No notes yet — Open a page to start adding notes
        </p>
      </div>
    );
  }

  // If a card is expanded, show it full-width with all notes
  if (expandedCard) {
    const card = cards.find(c => c.pageId === expandedCard.pageId && c.sectionId === expandedCard.sectionId);
    if (!card) {
      setExpandedCard(null);
      return null;
    }

    return (
      <div
        ref={expandedRef}
        style={{
          animation: 'fadeSlideIn 0.3s ease',
        }}
      >
        {/* Back to grid + section header */}
        <div
          onClick={() => handleCardClick(card.pageId, card.sectionId)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 0',
            cursor: 'pointer',
            marginBottom: 8,
          }}
        >
          <ChevronRight
            size={14}
            color={colors.textMuted}
            style={{ transform: 'rotate(180deg)', transition: 'transform 0.2s' }}
          />
          <span style={{
            color: colors.textMuted,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
          }}>
            BACK TO GRID
          </span>
        </div>

        {/* Expanded card header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 0',
            borderBottom: `1px solid ${colors.border}`,
            marginBottom: 8,
          }}
        >
          <div>
            <span
              onClick={() => onNavigate?.(card.pageId, card.sectionId)}
              style={{
                color: colors.primary,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {card.page.name}
            </span>
            <h3 style={{
              color: colors.textPrimary,
              fontSize: 18,
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              margin: '4px 0 0',
            }}>
              {card.section.name}
            </h3>
          </div>
          <span style={{
            color: colors.textMuted,
            fontSize: 12,
          }}>
            {card.notes.length} note{card.notes.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* All notes */}
        {card.notes.map(note => (
          <NoteCard
            key={note.id}
            note={note}
            isNew={note.id === newNoteId}
            currentUserId={user?.id}
            canEdit={true}
            canDelete={true}
            canToggle={true}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onTagClick={onTagClick}
          />
        ))}

        {/* Open in section link */}
        <div
          onClick={() => onNavigate?.(card.pageId, card.sectionId)}
          style={{
            padding: '16px 0',
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          <span style={{
            color: colors.primary,
            fontSize: 12,
            fontWeight: 500,
            borderBottom: `1px solid transparent`,
            transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderBottomColor = colors.primary}
            onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}
          >
            Open {card.page.name} / {card.section.name} →
          </span>
        </div>

        {/* Keyframe animation */}
        <style>{`
          @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  // Masonry grid of cards
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
          padding: '8px 0',
        }}
      >
        {cards.map(card => {
          const key = `${card.pageId}-${card.sectionId}`;
          const previewNotes = card.notes.slice(0, 4);
          const remaining = card.notes.length - previewNotes.length;
          const incompleteCount = card.notes.filter(n => !n.completed).length;
          const completedCount = card.notes.filter(n => n.completed).length;

          return (
            <div
              key={key}
              ref={el => cardRefs.current[key] = el}
              onClick={() => handleCardClick(card.pageId, card.sectionId)}
              style={{
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: 2,
                padding: 16,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minHeight: 120,
                display: 'flex',
                flexDirection: 'column',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = colors.primary + '60';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {/* Card header */}
              <div style={{ marginBottom: 12 }}>
                <span style={{
                  color: colors.primary,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                }}>
                  {card.page.name}
                </span>
                <h4 style={{
                  color: colors.textPrimary,
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "'Inter', sans-serif",
                  margin: '2px 0 0',
                  lineHeight: 1.3,
                }}>
                  {card.section.name}
                </h4>
              </div>

              {/* Preview notes */}
              <div style={{ flex: 1 }}>
                {previewNotes.map(note => (
                  <div
                    key={note.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '4px 0',
                    }}
                  >
                    <div style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: note.completed ? colors.textMuted : colors.primary,
                      flexShrink: 0,
                      marginTop: 5,
                      opacity: note.completed ? 0.5 : 0.8,
                    }} />
                    <span style={{
                      color: note.completed ? colors.textMuted : colors.textPrimary,
                      fontSize: 12,
                      lineHeight: 1.4,
                      textDecoration: note.completed ? 'line-through' : 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      opacity: note.completed ? 0.6 : 1,
                    }}>
                      {note.content}
                    </span>
                  </div>
                ))}
                {remaining > 0 && (
                  <span style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    paddingLeft: 14,
                  }}>
                    +{remaining} more
                  </span>
                )}
              </div>

              {/* Card footer - stats */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 12,
                paddingTop: 8,
                borderTop: `1px solid ${colors.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {incompleteCount > 0 && (
                    <span style={{ color: colors.textMuted, fontSize: 11 }}>
                      {incompleteCount} open
                    </span>
                  )}
                  {completedCount > 0 && (
                    <span style={{ color: colors.textMuted, fontSize: 11, opacity: 0.6 }}>
                      {completedCount} done
                    </span>
                  )}
                </div>
                <ChevronRight size={12} color={colors.textMuted} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid animation styles */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default HomeView;
