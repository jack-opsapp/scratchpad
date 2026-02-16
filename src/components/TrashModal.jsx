/**
 * Trash Modal Component
 *
 * Shows soft-deleted pages, sections, and notes.
 * Allows restoring individual items or emptying the entire trash.
 */

import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Trash2, ChevronDown, ChevronRight, FileText, FolderOpen, StickyNote, AlertTriangle } from 'lucide-react';

const colors = {
  bg: '#000000',
  surface: '#0a0a0a',
  border: '#1a1a1a',
  primary: '#d1b18f',
  textPrimary: '#ffffff',
  textMuted: '#888888',
  danger: '#ff6b6b',
  success: '#4CAF50'
};

function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function TrashModal({ isOpen, onClose, onRestore, userId }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(null);
  const [emptying, setEmptying] = useState(false);
  const [expandedSections, setExpandedSections] = useState({ pages: true, sections: true, notes: true });

  useEffect(() => {
    if (isOpen) {
      loadItems();
    }
  }, [isOpen]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trash?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      setItems(data.error ? null : data);
    } catch (err) {
      console.error('Failed to load trash:', err);
      setItems(null);
    }
    setLoading(false);
  };

  const handleRestore = async (type, id) => {
    setRestoring(id);
    try {
      const res = await fetch('/api/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type, id })
      });
      const data = await res.json();
      if (data.success) {
        await loadItems();
        if (onRestore) onRestore();
      }
    } catch (err) {
      console.error('Failed to restore:', err);
    }
    setRestoring(null);
  };

  const handleEmptyTrash = async () => {
    if (!confirm('Permanently delete all items in trash? This cannot be undone.')) return;
    setEmptying(true);
    try {
      const res = await fetch('/api/trash', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        await loadItems();
      }
    } catch (err) {
      console.error('Failed to empty trash:', err);
    }
    setEmptying(false);
  };

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (!isOpen) return null;

  const totalCount = items
    ? (items.pages?.length || 0) + (items.sections?.length || 0) + (items.notes?.length || 0)
    : 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          width: '100%',
          maxWidth: 600,
          maxHeight: '95vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trash2 size={18} color={colors.textMuted} />
            <h2 style={{
              color: colors.textPrimary,
              fontSize: 18,
              fontWeight: 600,
              margin: 0,
              fontFamily: "'Manrope', sans-serif"
            }}>
              Recently Deleted
            </h2>
            {totalCount > 0 && (
              <span style={{
                padding: '2px 8px',
                background: `${colors.primary}20`,
                color: colors.primary,
                fontSize: 12,
                fontWeight: 600
              }}>
                {totalCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.textMuted,
              cursor: 'pointer',
              padding: 4
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading ? (
            <div style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', padding: 40 }}>
              Loading...
            </div>
          ) : totalCount === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Trash2 size={40} color={colors.border} style={{ marginBottom: 16 }} />
              <p style={{ color: colors.textMuted, fontSize: 14, margin: 0 }}>
                Trash is empty
              </p>
              <p style={{ color: colors.textMuted, fontSize: 12, margin: '8px 0 0', opacity: 0.7 }}>
                Deleted pages, sections, and notes will appear here
              </p>
            </div>
          ) : (
            <>
              {/* Pages */}
              {items.pages?.length > 0 && (
                <TrashGroup
                  icon={FileText}
                  label="Pages"
                  count={items.pages.length}
                  expanded={expandedSections.pages}
                  onToggle={() => toggleSection('pages')}
                >
                  {items.pages.map(item => (
                    <TrashItem
                      key={item.id}
                      name={item.name}
                      detail={timeAgo(item.deleted_at)}
                      restoring={restoring === item.id}
                      onRestore={() => handleRestore('page', item.id)}
                    />
                  ))}
                </TrashGroup>
              )}

              {/* Sections */}
              {items.sections?.length > 0 && (
                <TrashGroup
                  icon={FolderOpen}
                  label="Sections"
                  count={items.sections.length}
                  expanded={expandedSections.sections}
                  onToggle={() => toggleSection('sections')}
                >
                  {items.sections.map(item => (
                    <TrashItem
                      key={item.id}
                      name={item.name}
                      subtitle={`from "${item.pageName}"`}
                      detail={timeAgo(item.deleted_at)}
                      restoring={restoring === item.id}
                      onRestore={() => handleRestore('section', item.id)}
                    />
                  ))}
                </TrashGroup>
              )}

              {/* Notes */}
              {items.notes?.length > 0 && (
                <TrashGroup
                  icon={StickyNote}
                  label="Notes"
                  count={items.notes.length}
                  expanded={expandedSections.notes}
                  onToggle={() => toggleSection('notes')}
                >
                  {items.notes.map(item => (
                    <TrashItem
                      key={item.id}
                      name={item.content || '(empty note)'}
                      subtitle={`in "${item.pageName}/${item.sectionName}"`}
                      detail={timeAgo(item.deleted_at)}
                      restoring={restoring === item.id}
                      onRestore={() => handleRestore('note', item.id)}
                      truncate
                    />
                  ))}
                </TrashGroup>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {totalCount > 0 && (
          <div style={{
            padding: '16px 24px',
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ color: colors.textMuted, fontSize: 12 }}>
              {totalCount} item{totalCount !== 1 ? 's' : ''} in trash
            </span>
            <button
              onClick={handleEmptyTrash}
              disabled={emptying}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: `1px solid ${colors.danger}60`,
                color: colors.danger,
                fontSize: 13,
                cursor: emptying ? 'not-allowed' : 'pointer',
                opacity: emptying ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <AlertTriangle size={14} />
              {emptying ? 'Emptying...' : 'Empty Trash'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TrashGroup({ icon: Icon, label, count, expanded, onToggle, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 0',
          background: 'transparent',
          border: 'none',
          color: colors.textPrimary,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "'Manrope', sans-serif"
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Icon size={14} color={colors.primary} />
        {label}
        <span style={{
          color: colors.textMuted,
          fontWeight: 400,
          fontSize: 12,
          marginLeft: 4
        }}>
          ({count})
        </span>
      </button>
      {expanded && (
        <div style={{ marginLeft: 22 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function TrashItem({ name, subtitle, detail, restoring, onRestore, truncate }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 12px',
      borderBottom: `1px solid ${colors.border}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: colors.textPrimary,
          fontSize: 13,
          whiteSpace: truncate ? 'nowrap' : 'normal',
          overflow: truncate ? 'hidden' : 'visible',
          textOverflow: truncate ? 'ellipsis' : 'clip'
        }}>
          {name}
        </div>
        {subtitle && (
          <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      <span style={{ color: colors.textMuted, fontSize: 11, flexShrink: 0 }}>
        {detail}
      </span>
      <button
        onClick={onRestore}
        disabled={restoring}
        style={{
          padding: '4px 10px',
          background: 'transparent',
          border: `1px solid ${colors.primary}40`,
          color: colors.primary,
          fontSize: 12,
          cursor: restoring ? 'not-allowed' : 'pointer',
          opacity: restoring ? 0.5 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0
        }}
      >
        <RotateCcw size={12} />
        {restoring ? '...' : 'Restore'}
      </button>
    </div>
  );
}
