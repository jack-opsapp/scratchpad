import { useState, useCallback, useRef } from 'react';

/**
 * Undo/Redo hook for note operations.
 * Tracks actions and provides undo/redo with Supabase persistence.
 *
 * Action types:
 * - create_note: { noteId, note, inputMessage }
 * - delete_note: { noteId, note }
 * - toggle_note: { noteId, previousCompleted }
 * - edit_note: { noteId, previousContent, newContent }
 * - move_note: { noteId, previousSectionId, newSectionId }
 * - copy_note: { noteId (of the copy) }
 */

const MAX_HISTORY = 50;

export function useUndoRedo({ supabase, setNotes, setInputValue, user }) {
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  // Keep refs in sync for use in keyboard handlers
  const pushUndo = useCallback((action) => {
    setUndoStack(prev => {
      const next = [...prev, action].slice(-MAX_HISTORY);
      undoStackRef.current = next;
      return next;
    });
    // Clear redo on new action
    setRedoStack([]);
    redoStackRef.current = [];
  }, []);

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return false;

    const action = stack[stack.length - 1];
    const newUndo = stack.slice(0, -1);
    undoStackRef.current = newUndo;
    setUndoStack(newUndo);

    // Push to redo
    setRedoStack(prev => {
      const next = [...prev, action];
      redoStackRef.current = next;
      return next;
    });

    switch (action.type) {
      case 'create_note':
        // Remove the created note, restore input
        setNotes(prev => prev.filter(n => n.id !== action.noteId));
        supabase.from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', action.noteId);
        if (action.inputMessage && setInputValue) {
          setInputValue(action.inputMessage);
        }
        break;

      case 'delete_note':
        // Restore the deleted note
        setNotes(prev => [...prev, action.note]);
        supabase.from('notes').update({ deleted_at: null }).eq('id', action.noteId);
        break;

      case 'toggle_note':
        // Toggle back
        setNotes(prev => prev.map(n =>
          n.id === action.noteId
            ? { ...n, completed: action.previousCompleted, completed_by_user_id: action.previousCompleted ? user?.id : null }
            : n
        ));
        supabase.from('notes').update({
          completed: action.previousCompleted,
          completed_by_user_id: action.previousCompleted ? user?.id : null,
          completed_at: action.previousCompleted ? new Date().toISOString() : null,
        }).eq('id', action.noteId);
        break;

      case 'edit_note':
        // Restore previous content
        setNotes(prev => prev.map(n =>
          n.id === action.noteId ? { ...n, content: action.previousContent } : n
        ));
        supabase.from('notes').update({ content: action.previousContent }).eq('id', action.noteId);
        break;

      case 'move_note':
        // Move back to previous section
        setNotes(prev => prev.map(n =>
          n.id === action.noteId ? { ...n, sectionId: action.previousSectionId } : n
        ));
        supabase.from('notes').update({ section_id: action.previousSectionId }).eq('id', action.noteId);
        break;

      case 'copy_note':
        // Remove the copy
        setNotes(prev => prev.filter(n => n.id !== action.noteId));
        supabase.from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', action.noteId);
        break;

      default:
        break;
    }

    return true;
  }, [supabase, setNotes, setInputValue, user]);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return false;

    const action = stack[stack.length - 1];
    const newRedo = stack.slice(0, -1);
    redoStackRef.current = newRedo;
    setRedoStack(newRedo);

    // Push back to undo
    setUndoStack(prev => {
      const next = [...prev, action];
      undoStackRef.current = next;
      return next;
    });

    switch (action.type) {
      case 'create_note':
        // Re-create the note
        setNotes(prev => [...prev, action.note]);
        supabase.from('notes').update({ deleted_at: null }).eq('id', action.noteId);
        break;

      case 'delete_note':
        // Re-delete
        setNotes(prev => prev.filter(n => n.id !== action.noteId));
        supabase.from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', action.noteId);
        break;

      case 'toggle_note':
        // Toggle again (opposite of previous)
        const newCompleted = !action.previousCompleted;
        setNotes(prev => prev.map(n =>
          n.id === action.noteId
            ? { ...n, completed: newCompleted, completed_by_user_id: newCompleted ? user?.id : null }
            : n
        ));
        supabase.from('notes').update({
          completed: newCompleted,
          completed_by_user_id: newCompleted ? user?.id : null,
          completed_at: newCompleted ? new Date().toISOString() : null,
        }).eq('id', action.noteId);
        break;

      case 'edit_note':
        // Re-apply the edit
        setNotes(prev => prev.map(n =>
          n.id === action.noteId ? { ...n, content: action.newContent } : n
        ));
        supabase.from('notes').update({ content: action.newContent }).eq('id', action.noteId);
        break;

      case 'move_note':
        // Move again to new section
        setNotes(prev => prev.map(n =>
          n.id === action.noteId ? { ...n, sectionId: action.newSectionId } : n
        ));
        supabase.from('notes').update({ section_id: action.newSectionId }).eq('id', action.noteId);
        break;

      case 'copy_note':
        // Re-create the copy
        setNotes(prev => [...prev, action.note]);
        supabase.from('notes').update({ deleted_at: null }).eq('id', action.noteId);
        break;

      default:
        break;
    }

    return true;
  }, [supabase, setNotes, user]);

  return {
    pushUndo,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}
