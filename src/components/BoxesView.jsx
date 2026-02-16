import { useState, useEffect, useRef } from 'react';
import { Check, Trash2, GripVertical, Move } from 'lucide-react';
import { colors } from '../styles/theme.js';

/**
 * Kanban-style boxes view with drag-and-drop
 * Supports both box reordering and note moving between boxes
 *
 * @param {object} props
 * @param {Array} props.notes - Notes to display
 * @param {Array} props.sections - Section definitions (for page-level view)
 * @param {string} props.groupBy - Grouping mode ('status' or 'tag')
 * @param {function} props.onNoteMove - Handler for moving notes between sections
 * @param {function} props.onNoteToggle - Toggle note completion
 * @param {function} props.onNoteDelete - Delete note handler
 * @param {string} props.contextId - Context identifier for saving box order
 * @param {object} props.boxConfigs - Saved box configurations
 * @param {function} props.onSaveBoxConfigs - Save box configuration handler
 */
export function BoxesView({
  notes,
  sections,
  groupBy,
  onNoteMove,
  onNoteToggle,
  onNoteDelete,
  contextId,
  boxConfigs,
  onSaveBoxConfigs,
}) {
  const [draggingNote, setDraggingNote] = useState(null);
  const [dragOverBox, setDragOverBox] = useState(null);
  const [draggingBoxId, setDraggingBoxId] = useState(null);
  const [dropPosition, setDropPosition] = useState(null);
  const [boxOrder, setBoxOrder] = useState([]);
  const [moveNoteModal, setMoveNoteModal] = useState(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const boxRefs = useRef({});

  // Detect touch device
  useEffect(() => {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    setIsTouchDevice(hasTouch && isCoarsePointer);
  }, []);

  // Generate default box IDs
  const generateDefaultBoxIds = () => {
    if (sections) {
      return sections.map(s => s.id);
    }
    const keys = new Set();
    notes.forEach(n => {
      const key =
        groupBy === 'status'
          ? n.completed
            ? 'Completed'
            : 'Active'
          : n.tags?.[0] || 'Untagged';
      keys.add(key);
    });
    if (groupBy === 'status') {
      keys.add('Active');
      keys.add('Completed');
    }
    return Array.from(keys);
  };

  // Initialize box order
  useEffect(() => {
    const savedOrder = boxConfigs?.[contextId]?.order;
    const defaultOrder = generateDefaultBoxIds();

    if (savedOrder && savedOrder.length > 0) {
      const newBoxes = defaultOrder.filter(id => !savedOrder.includes(id));
      const validSaved = savedOrder.filter(id => defaultOrder.includes(id));
      setBoxOrder([...validSaved, ...newBoxes]);
    } else {
      setBoxOrder(defaultOrder);
    }
  }, [contextId, sections?.length, groupBy]);

  const saveBoxOrder = newOrder => {
    setBoxOrder(newOrder);
    if (onSaveBoxConfigs) {
      onSaveBoxConfigs(contextId, { order: newOrder });
    }
  };

  const getBoxNotes = boxId => {
    if (sections) {
      return notes.filter(n => n.sectionId === boxId);
    }
    return notes.filter(n => {
      const key =
        groupBy === 'status'
          ? n.completed
            ? 'Completed'
            : 'Active'
          : n.tags?.[0] || 'Untagged';
      return key === boxId;
    });
  };

  const getBoxName = boxId => {
    if (sections) {
      const section = sections.find(s => s.id === boxId);
      return section?.name || boxId;
    }
    return boxId;
  };

  // Box drag handlers
  const handleBoxDragStart = (e, boxId) => {
    e.dataTransfer.setData('text/plain', `box:${boxId}`);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => setDraggingBoxId(boxId), 0);
  };

  const handleBoxDragOver = (e, targetBoxId) => {
    if (!draggingBoxId || draggingBoxId === targetBoxId) return;
    e.preventDefault();
    const rect = boxRefs.current[targetBoxId]?.getBoundingClientRect();
    if (!rect) return;
    const midpoint = rect.left + rect.width / 2;
    setDropPosition({
      boxId: targetBoxId,
      position: e.clientX < midpoint ? 'before' : 'after',
    });
  };

  const handleBoxDrop = e => {
    e.preventDefault();
    if (!draggingBoxId || !dropPosition) {
      setDraggingBoxId(null);
      setDropPosition(null);
      return;
    }

    const newOrder = [...boxOrder];
    const dragIndex = newOrder.indexOf(draggingBoxId);
    let targetIndex = newOrder.indexOf(dropPosition.boxId);

    if (dragIndex === -1 || targetIndex === -1 || dragIndex === targetIndex) {
      setDraggingBoxId(null);
      setDropPosition(null);
      return;
    }

    newOrder.splice(dragIndex, 1);
    targetIndex = newOrder.indexOf(dropPosition.boxId);
    if (dropPosition.position === 'after') targetIndex++;
    newOrder.splice(targetIndex, 0, draggingBoxId);

    saveBoxOrder(newOrder);
    setDraggingBoxId(null);
    setDropPosition(null);
  };

  // Note drag handlers
  const handleNoteDragStart = (e, note) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', `note:${note.id}`);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => setDraggingNote(note), 0);
  };

  const handleNoteContainerDragOver = (e, boxId) => {
    if (!e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    e.stopPropagation();
    if (draggingNote) setDragOverBox(boxId);
  };

  const handleNoteContainerDrop = (e, targetBoxId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggingNote || !sections) {
      setDraggingNote(null);
      setDragOverBox(null);
      return;
    }
    if (draggingNote.sectionId !== targetBoxId) {
      onNoteMove(draggingNote.id, targetBoxId);
    }
    setDraggingNote(null);
    setDragOverBox(null);
  };

  // Drag handle component
  const NoteDragHandle = ({ note }) => (
    <div
      draggable
      onDragStart={e => handleNoteDragStart(e, note)}
      onDragEnd={() => {
        setDraggingNote(null);
        setDragOverBox(null);
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: '4px 4px',
        gridTemplateRows: '4px 4px 4px',
        gap: 2,
        cursor: 'grab',
        padding: 4,
        opacity: 0.4,
        transition: 'opacity 0.15s ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
      title="Drag to move to another section"
    >
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: colors.textMuted,
          }}
        />
      ))}
    </div>
  );

  return (
    <div>
      {/* Boxes grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
        onDragOver={e => {
          if (draggingBoxId) e.preventDefault();
        }}
        onDrop={e => {
          if (draggingBoxId) handleBoxDrop(e);
        }}
      >
        {boxOrder.map(boxId => {
          const boxNotes = getBoxNotes(boxId);
          const boxName = getBoxName(boxId);
          const isBoxDropTarget = dropPosition?.boxId === boxId;
          const isNoteDropTarget = dragOverBox === boxId && draggingNote;

          return (
            <div
              key={boxId}
              ref={el => (boxRefs.current[boxId] = el)}
              onDragOver={e => {
                if (draggingBoxId) handleBoxDragOver(e, boxId);
                if (draggingNote) handleNoteContainerDragOver(e, boxId);
              }}
              onDragLeave={e => {
                if (draggingNote && !e.currentTarget.contains(e.relatedTarget)) {
                  setDragOverBox(null);
                }
              }}
              onDrop={e => {
                if (draggingNote) handleNoteContainerDrop(e, boxId);
              }}
              style={{
                background: isNoteDropTarget ? colors.surface : colors.bg,
                border: `1px solid ${isNoteDropTarget ? colors.primary : colors.border}`,
                opacity: draggingBoxId === boxId ? 0.5 : 1,
                transition: 'all 0.15s ease',
                boxShadow: isBoxDropTarget
                  ? `${dropPosition.position === 'before' ? '-4px' : '4px'} 0 0 ${colors.primary}`
                  : 'none',
              }}
            >
              {/* Box header */}
              <div
                draggable={!isTouchDevice}
                onDragStart={e => handleBoxDragStart(e, boxId)}
                onDragEnd={() => {
                  setDraggingBoxId(null);
                  setDropPosition(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 16px',
                  borderBottom: `1px solid ${colors.border}`,
                  cursor: isTouchDevice ? 'default' : 'grab',
                  background: colors.surface,
                }}
              >
                {!isTouchDevice && (
                  <GripVertical
                    size={14}
                    color={colors.textMuted}
                    style={{ opacity: 0.5, flexShrink: 0 }}
                  />
                )}
                <p
                  style={{
                    color: colors.textMuted,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 1.5,
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {boxName.toUpperCase()}
                </p>
                <span style={{ color: colors.textMuted, fontSize: 10 }}>
                  {boxNotes.length}
                </span>
              </div>

              {/* Box content */}
              <div style={{ padding: '8px 16px 16px', minHeight: 60 }}>
                {boxNotes.length === 0 ? (
                  <p
                    style={{
                      color: colors.textMuted,
                      fontSize: 12,
                      opacity: 0.5,
                      margin: '8px 0',
                    }}
                  >
                    {isNoteDropTarget ? 'Drop here' : 'No notes'}
                  </p>
                ) : (
                  boxNotes.map(note => (
                    <div
                      key={note.id}
                      style={{
                        padding: '10px 0',
                        borderBottom: `1px solid ${colors.border}`,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        opacity: draggingNote?.id === note.id ? 0.5 : 1,
                        transition: 'opacity 0.15s ease',
                      }}
                    >
                      {/* Drag handle or move button */}
                      {sections &&
                        (isTouchDevice ? (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setMoveNoteModal({ note, fromBoxId: boxId });
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 24,
                              height: 24,
                              background: 'transparent',
                              border: `1px solid ${colors.border}`,
                              color: colors.textMuted,
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                            title="Move to another section"
                          >
                            <Move size={12} />
                          </button>
                        ) : (
                          <NoteDragHandle note={note} />
                        ))}

                      {/* Checkbox */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onNoteToggle(note.id);
                        }}
                        style={{
                          width: 16,
                          height: 16,
                          border: `1px solid ${note.completed ? colors.textMuted : colors.border}`,
                          background: note.completed ? colors.textMuted : 'transparent',
                          cursor: 'pointer',
                          flexShrink: 0,
                          marginTop: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {note.completed && (
                          <Check size={10} color={colors.bg} strokeWidth={3} />
                        )}
                      </button>

                      {/* Note content */}
                      <div style={{ flex: 1 }}>
                        <p
                          style={{
                            color: note.completed
                              ? colors.textMuted
                              : colors.textPrimary,
                            fontSize: 13,
                            fontFamily: "'Manrope', sans-serif",
                            margin: 0,
                            textDecoration: note.completed ? 'line-through' : 'none',
                          }}
                        >
                          {note.content}
                        </p>
                        {note.tags?.length > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              gap: 4,
                              marginTop: 6,
                              flexWrap: 'wrap',
                            }}
                          >
                            {note.tags.map(tag => (
                              <span
                                key={tag}
                                style={{
                                  fontSize: 9,
                                  color: colors.textMuted,
                                  textTransform: 'uppercase',
                                  padding: '2px 4px',
                                  border: `1px solid ${colors.border}`,
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {note.date && (
                          <span
                            style={{
                              color: colors.textMuted,
                              fontSize: 10,
                              display: 'block',
                              marginTop: 4,
                            }}
                          >
                            {note.date}
                          </span>
                        )}
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onNoteDelete(note.id);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ff6b6b',
                          cursor: 'pointer',
                          padding: 4,
                          opacity: 0.3,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.3')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drag indicators */}
      {draggingBoxId && (
        <div
          style={{
            position: 'fixed',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            background: colors.surface,
            border: `1px solid ${dropPosition ? colors.primary : colors.border}`,
            padding: '10px 20px',
            fontSize: 12,
            color: dropPosition ? colors.textPrimary : colors.textMuted,
            zIndex: 1000,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}
        >
          <span style={{ color: colors.primary, marginRight: 8 }}>⇄</span>
          {dropPosition ? 'Release to drop' : 'Drag to reorder boxes'}
        </div>
      )}

      {draggingNote && (
        <div
          style={{
            position: 'fixed',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            background: colors.surface,
            border: `1px solid ${dragOverBox ? colors.primary : colors.border}`,
            padding: '10px 20px',
            fontSize: 12,
            color: dragOverBox ? colors.textPrimary : colors.textMuted,
            zIndex: 1000,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}
        >
          <span style={{ color: colors.primary, marginRight: 8 }}>↗</span>
          {dragOverBox ? 'Release to move note' : 'Drag to another section'}
        </div>
      )}

      {/* Move note modal (mobile) */}
      {moveNoteModal && sections && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setMoveNoteModal(null)}
        >
          <div
            style={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              width: '100%',
              maxWidth: 320,
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: 16, borderBottom: `1px solid ${colors.border}` }}>
              <p
                style={{
                  color: colors.textPrimary,
                  fontSize: 14,
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                Move Note
              </p>
              <p
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  margin: '8px 0 0 0',
                  lineHeight: 1.4,
                }}
              >
                {moveNoteModal.note.content.length > 50
                  ? moveNoteModal.note.content.slice(0, 50) + '...'
                  : moveNoteModal.note.content}
              </p>
            </div>

            <div style={{ padding: 8 }}>
              <p
                style={{
                  color: colors.textMuted,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1,
                  padding: '8px 8px 4px',
                  margin: 0,
                }}
              >
                SELECT SECTION
              </p>
              {sections.map(section => {
                const isCurrentSection =
                  moveNoteModal.note.sectionId === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => {
                      if (!isCurrentSection) {
                        onNoteMove(moveNoteModal.note.id, section.id);
                      }
                      setMoveNoteModal(null);
                    }}
                    disabled={isCurrentSection}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      padding: '12px 16px',
                      background: isCurrentSection ? colors.bg : 'transparent',
                      border: 'none',
                      color: isCurrentSection
                        ? colors.textMuted
                        : colors.textPrimary,
                      fontSize: 13,
                      fontFamily: "'Manrope', sans-serif",
                      cursor: isCurrentSection ? 'default' : 'pointer',
                      textAlign: 'left',
                      opacity: isCurrentSection ? 0.5 : 1,
                    }}
                  >
                    <span style={{ flex: 1 }}>{section.name}</span>
                    {isCurrentSection && (
                      <span style={{ fontSize: 10, color: colors.textMuted }}>
                        CURRENT
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ padding: 12, borderTop: `1px solid ${colors.border}` }}>
              <button
                onClick={() => setMoveNoteModal(null)}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  color: colors.textMuted,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BoxesView;
