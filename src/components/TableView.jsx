import { useState, useMemo } from 'react';
import { Check, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import { colors } from '../styles/theme.js';
import { TagPill } from './TagPill.jsx';

/**
 * Table view for notes - spreadsheet-style display with sortable columns.
 *
 * @param {object} props
 * @param {Array} props.notes - Notes array
 * @param {Array} props.allSections - All sections for page/section labels
 * @param {Array} props.pages - All pages
 * @param {function} props.onToggle - Toggle completion
 * @param {function} props.onEdit - Edit note content
 * @param {function} props.onDelete - Delete note
 * @param {function} props.onTagClick - Filter by tag
 * @param {function} props.onNavigate - Navigate to page/section
 * @param {string} props.currentUserId - Current user ID
 */
export function TableView({
  notes,
  allSections = [],
  pages = [],
  onToggle,
  onEdit,
  onDelete,
  onTagClick,
  onNavigate,
  currentUserId,
}) {
  const [sortColumn, setSortColumn] = useState('created');
  const [sortDir, setSortDir] = useState('desc');
  const [editingCell, setEditingCell] = useState(null); // { noteId, field }
  const [editValue, setEditValue] = useState('');

  // Column definitions
  const columns = [
    { key: 'status', label: '', width: 40 },
    { key: 'content', label: 'Note', flex: 1, minWidth: 200 },
    { key: 'tags', label: 'Tags', width: 180 },
    { key: 'location', label: 'Page / Section', width: 180 },
    { key: 'date', label: 'Date', width: 100 },
    { key: 'created', label: 'Created', width: 110 },
  ];

  // Enrich notes with location data
  const enriched = useMemo(() => notes.map(note => {
    const section = allSections.find(s => s.id === note.sectionId);
    const page = section ? pages.find(p => p.id === section.pageId) : null;
    return {
      ...note,
      pageName: page?.name || '',
      sectionName: section?.name || '',
      pageId: page?.id,
    };
  }), [notes, allSections, pages]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...enriched];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'status':
          cmp = (a.completed ? 1 : 0) - (b.completed ? 1 : 0);
          break;
        case 'content':
          cmp = (a.content || '').localeCompare(b.content || '');
          break;
        case 'tags':
          cmp = (a.tags?.join(',') || '').localeCompare(b.tags?.join(',') || '');
          break;
        case 'location':
          cmp = `${a.pageName}/${a.sectionName}`.localeCompare(`${b.pageName}/${b.sectionName}`);
          break;
        case 'date':
          cmp = (a.date || '').localeCompare(b.date || '');
          break;
        case 'created':
          cmp = (a.createdAt || 0) - (b.createdAt || 0);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [enriched, sortColumn, sortDir]);

  const toggleSort = (col) => {
    if (sortColumn === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDir(col === 'created' ? 'desc' : 'asc');
    }
  };

  const handleEditStart = (noteId, field, currentValue) => {
    setEditingCell({ noteId, field });
    setEditValue(currentValue || '');
  };

  const handleEditCommit = () => {
    if (editingCell && onEdit) {
      onEdit(editingCell.noteId, editValue);
    }
    setEditingCell(null);
    setEditValue('');
  };

  const SortIcon = ({ col }) => {
    if (sortColumn !== col) return <ArrowUpDown size={10} style={{ opacity: 0.3 }} />;
    return sortDir === 'asc'
      ? <ChevronUp size={10} />
      : <ChevronDown size={10} />;
  };

  return (
    <div style={{
      overflowX: 'auto',
      border: `1px solid ${colors.border}`,
      borderRadius: 2,
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 13,
        fontFamily: "'Inter', sans-serif",
      }}>
        {/* Header */}
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => col.key !== 'status' && toggleSort(col.key)}
                style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  color: colors.textMuted,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  borderBottom: `1px solid ${colors.border}`,
                  background: colors.surface,
                  cursor: col.key !== 'status' ? 'pointer' : 'default',
                  whiteSpace: 'nowrap',
                  width: col.width || 'auto',
                  minWidth: col.minWidth || 'auto',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {col.label}
                  {col.key !== 'status' && <SortIcon col={col.key} />}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {sorted.map(note => (
            <tr
              key={note.id}
              style={{
                borderBottom: `1px solid ${colors.border}`,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = colors.surface}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Status checkbox */}
              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                <button
                  onClick={() => onToggle?.(note.id)}
                  style={{
                    width: 16,
                    height: 16,
                    border: `1px solid ${note.completed ? colors.textMuted : colors.border}`,
                    background: note.completed ? colors.textMuted : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {note.completed && <Check size={10} color={colors.bg} strokeWidth={3} />}
                </button>
              </td>

              {/* Content - editable */}
              <td style={{ padding: '8px 12px' }}>
                {editingCell?.noteId === note.id && editingCell?.field === 'content' ? (
                  <input
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={handleEditCommit}
                    onKeyDown={e => { if (e.key === 'Enter') handleEditCommit(); }}
                    autoFocus
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: `1px solid ${colors.primary}`,
                      color: colors.textPrimary,
                      fontSize: 13,
                      fontFamily: "'Inter', sans-serif",
                      padding: '2px 6px',
                      outline: 'none',
                      borderRadius: 2,
                    }}
                  />
                ) : (
                  <span
                    onClick={() => handleEditStart(note.id, 'content', note.content)}
                    style={{
                      color: note.completed ? colors.textMuted : colors.textPrimary,
                      textDecoration: note.completed ? 'line-through' : 'none',
                      cursor: 'text',
                      lineHeight: 1.4,
                    }}
                  >
                    {note.content || '(empty)'}
                  </span>
                )}
              </td>

              {/* Tags */}
              <td style={{ padding: '8px 12px' }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {note.tags?.map(tag => (
                    <TagPill key={tag} tag={tag} small onClick={() => onTagClick?.(tag)} />
                  ))}
                </div>
              </td>

              {/* Location */}
              <td style={{ padding: '8px 12px' }}>
                {note.pageName && (
                  <span
                    onClick={() => onNavigate?.(note.pageId, note.sectionId)}
                    style={{
                      color: colors.textMuted,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = colors.primary}
                    onMouseLeave={e => e.currentTarget.style.color = colors.textMuted}
                  >
                    {note.pageName} / {note.sectionName}
                  </span>
                )}
              </td>

              {/* Date */}
              <td style={{
                padding: '8px 12px',
                color: colors.textMuted,
                fontSize: 12,
              }}>
                {note.date || '—'}
              </td>

              {/* Created */}
              <td style={{
                padding: '8px 12px',
                color: colors.textMuted,
                fontSize: 11,
                whiteSpace: 'nowrap',
              }}>
                {note.createdAt
                  ? new Date(note.createdAt).toLocaleDateString()
                  : note.created_at
                    ? new Date(note.created_at).toLocaleDateString()
                    : '—'
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sorted.length === 0 && (
        <div style={{
          padding: '40px 0',
          textAlign: 'center',
          color: colors.textMuted,
          fontSize: 13,
        }}>
          No notes to display
        </div>
      )}
    </div>
  );
}

export default TableView;
