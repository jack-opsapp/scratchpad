import { colors } from '../styles/theme.js';
import { NoteCard } from './NoteCard.jsx';

/**
 * Home View - shows all notes across all pages/sections,
 * grouped by page > section, sorted by most recent note per page.
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

  if (pageOrder.length === 0) {
    return (
      <div style={{ padding: '60px 40px', textAlign: 'center' }}>
        <p style={{
          color: colors.textMuted,
          fontSize: 14,
          fontFamily: "'Manrope', sans-serif",
        }}>
          No notes yet — Open a page to start adding notes
        </p>
      </div>
    );
  }

  return (
    <div>
      {pageOrder.map(pageId => {
        const page = pages.find(p => p.id === pageId);
        if (!page) return null;
        const pageSections = grouped[pageId];

        return (
          <div key={pageId} style={{ marginBottom: 32 }}>
            {Object.entries(pageSections).map(([sectionId, sectionNotes]) => {
              const section = allSections.find(s => s.id === sectionId);
              if (!section) return null;

              return (
                <div key={sectionId} style={{ marginBottom: 16 }}>
                  <p
                    onClick={() => onNavigate?.(pageId, sectionId)}
                    style={{
                      color: colors.textMuted,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 1.5,
                      marginBottom: 4,
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                    }}
                  >
                    {page.name} / {section.name}
                  </p>
                  {sectionNotes
                    .sort((a, b) => {
                      // Incomplete first, then by created date
                      if (a.completed !== b.completed) return a.completed ? 1 : -1;
                      return (b.createdAt || 0) - (a.createdAt || 0);
                    })
                    .map(note => (
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
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default HomeView;
