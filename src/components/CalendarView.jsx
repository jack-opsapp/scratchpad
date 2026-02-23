import { useState } from 'react';
import { colors } from '../styles/theme.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Calendar view for notes with drag-and-drop scheduling
 *
 * @param {object} props
 * @param {Array} props.notes - Notes to display
 * @param {Date} props.currentMonth - Currently displayed month
 * @param {function} props.onMonthChange - Month navigation handler (+1/-1)
 * @param {function} props.onNoteClick - Note click handler
 * @param {function} props.onNoteMove - Handler for moving note to new date
 */
export function CalendarView({
  notes,
  currentMonth,
  onMonthChange,
  onNoteClick,
  onNoteMove,
}) {
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  ).getDate();

  const firstDay = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  ).getDay();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthStr = MONTH_NAMES[currentMonth.getMonth()].slice(0, 3);

  // Get notes for a specific day
  const getNotesForDay = (day) =>
    notes.filter(n => {
      if (!n.date) return false;
      const lower = n.date.toLowerCase().trim();
      const storedDayMatch = lower.match(/(\d{1,2})/);
      if (!storedDayMatch) return false;
      return (
        lower.includes(monthStr.toLowerCase()) &&
        parseInt(storedDayMatch[1]) === day
      );
    });

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button
          onClick={() => onMonthChange(-1)}
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.textMuted,
            cursor: 'pointer',
            fontSize: 18,
          }}
        >
          ←
        </button>
        <span
          style={{
            color: colors.textPrimary,
            fontSize: 16,
            fontWeight: 600,
            fontFamily: "'Manrope', sans-serif",
          }}
        >
          {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </span>
        <button
          onClick={() => onMonthChange(1)}
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.textMuted,
            cursor: 'pointer',
            fontSize: 18,
          }}
        >
          →
        </button>
      </div>

      {/* Calendar grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 1,
          background: colors.border,
        }}
      >
        {/* Day headers */}
        {DAY_NAMES.map(d => (
          <div
            key={d}
            style={{
              background: colors.surface,
              padding: 8,
              color: colors.textMuted,
              fontSize: 10,
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            {d}
          </div>
        ))}

        {/* Empty cells for first week */}
        {Array(firstDay)
          .fill(null)
          .map((_, i) => (
            <div key={`empty-${i}`} style={{ background: colors.bg, padding: 8 }} />
          ))}

        {/* Day cells */}
        {days.map(day => {
          const dayNotes = getNotesForDay(day);

          return (
            <div
              key={day}
              style={{
                background: dragOver === day ? colors.surface : colors.bg,
                padding: 8,
                minHeight: 80,
              }}
              onDragOver={e => {
                e.preventDefault();
                setDragOver(day);
              }}
              onDrop={e => {
                e.preventDefault();
                if (dragging) {
                  onNoteMove(dragging.id, `${monthStr} ${day}`);
                }
                setDragging(null);
                setDragOver(null);
              }}
            >
              <span style={{ color: colors.textMuted, fontSize: 11 }}>{day}</span>

              {/* Notes for this day (max 2 visible) */}
              {dayNotes.slice(0, 2).map(n => (
                <div
                  key={n.id}
                  draggable
                  onDragStart={() => setDragging(n)}
                  onDragEnd={() => {
                    setDragging(null);
                    setDragOver(null);
                  }}
                  onClick={() => onNoteClick(n)}
                  style={{
                    marginTop: 4,
                    padding: '4px 6px',
                    background: colors.surface,
                    fontSize: 10,
                    cursor: 'grab',
                    color: n.completed ? colors.textMuted : colors.textPrimary,
                    fontFamily: "'Manrope', sans-serif",
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    borderLeft: `2px solid ${colors.primary}`,
                  }}
                >
                  {n.content}
                </div>
              ))}

              {/* Overflow indicator */}
              {dayNotes.length > 2 && (
                <span style={{ fontSize: 9, color: colors.textMuted }}>
                  +{dayNotes.length - 2}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarView;
