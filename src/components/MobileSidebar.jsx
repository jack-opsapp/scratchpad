import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, ChevronRight, Star, Users } from 'lucide-react';

const SWIPE_THRESHOLD = 50;

const colors = {
  bg: '#000000',
  surface: '#0a0a0a',
  border: '#1a1a1a',
  primary: '#d1b18f',
  textPrimary: '#ffffff',
  textMuted: '#888888'
};

export default function MobileSidebar({
  isOpen,
  onClose,
  pages = [],
  sharedPages = [],
  currentPage,
  currentSection,
  onNavigate,
  user
}) {
  const [dragging, setDragging] = useState(false);
  const [translateX, setTranslateX] = useState(-window.innerWidth);
  const [expandedPages, setExpandedPages] = useState({});
  const touchStartX = useRef(0);
  const touchStartTranslate = useRef(0);

  // Sync translateX with isOpen prop
  useEffect(() => {
    setTranslateX(isOpen ? 0 : -window.innerWidth);
  }, [isOpen]);

  // Toggle page expansion
  const togglePage = (pageId) => {
    setExpandedPages(prev => ({
      ...prev,
      [pageId]: !prev[pageId]
    }));
  };

  // Get user initials
  const getUserInitials = (u) => {
    if (!u) return '?';
    if (u.user_metadata?.full_name) {
      return u.user_metadata.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return (u.email || '?')[0].toUpperCase();
  };

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Touch handlers for swipe gesture
  const handleTouchStart = (e) => {
    setDragging(true);
    touchStartX.current = e.touches[0].clientX;
    touchStartTranslate.current = translateX;
  };

  const handleTouchMove = (e) => {
    if (!dragging) return;

    const currentX = e.touches[0].clientX;
    const deltaX = currentX - touchStartX.current;
    const newTranslate = Math.max(
      -window.innerWidth,
      Math.min(0, touchStartTranslate.current + deltaX)
    );

    setTranslateX(newTranslate);
  };

  const handleTouchEnd = () => {
    setDragging(false);

    // Snap based on position - close if swiped more than threshold
    if (translateX > -SWIPE_THRESHOLD * 2) {
      setTranslateX(0);
    } else {
      setTranslateX(-window.innerWidth);
      onClose();
    }
  };

  // Edge swipe to open (from left edge of screen)
  useEffect(() => {
    if (isOpen) return;

    let startX = 0;
    let tracking = false;

    const handleEdgeTouchStart = (e) => {
      if (e.touches[0].clientX < 20) {
        startX = e.touches[0].clientX;
        tracking = true;
      }
    };

    const handleEdgeTouchMove = (e) => {
      if (!tracking) return;

      const currentX = e.touches[0].clientX;
      const deltaX = currentX - startX;

      if (deltaX > SWIPE_THRESHOLD) {
        tracking = false;
        setTranslateX(0);
      }
    };

    const handleEdgeTouchEnd = () => {
      tracking = false;
    };

    document.addEventListener('touchstart', handleEdgeTouchStart, { passive: true });
    document.addEventListener('touchmove', handleEdgeTouchMove, { passive: true });
    document.addEventListener('touchend', handleEdgeTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleEdgeTouchStart);
      document.removeEventListener('touchmove', handleEdgeTouchMove);
      document.removeEventListener('touchend', handleEdgeTouchEnd);
    };
  }, [isOpen]);

  const isVisible = isOpen || dragging || translateX > -window.innerWidth;

  if (!isVisible) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          opacity: Math.min(1, (translateX + window.innerWidth) / window.innerWidth),
          transition: dragging ? 'none' : 'opacity 0.3s ease',
          zIndex: 998,
          WebkitTapHighlightColor: 'transparent'
        }}
      />

      {/* Full-screen Drawer */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: colors.bg,
          transform: `translateX(${translateX}px)`,
          transition: dragging ? 'none' : 'transform 0.3s ease',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          WebkitOverflowScrolling: 'touch',
          paddingTop: 'env(safe-area-inset-top)'
        }}
      >
        {/* Header with close button */}
        <div style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${colors.border}`,
          flexShrink: 0
        }}>
          <span style={{
            color: colors.primary,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: -0.5
          }}>
            Scratchpad
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.textMuted,
              cursor: 'pointer',
              padding: 8,
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 0'
        }}>
          {/* My Pages */}
          <div style={{ padding: '0 20px', marginBottom: 24 }}>
            <p style={{
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.5,
              margin: '0 0 12px 0',
              textTransform: 'uppercase'
            }}>
              MY PAGES
            </p>
            {pages.map(page => {
              const isExpanded = expandedPages[page.id];
              const hasSections = page.sections && page.sections.length > 0;
              const isCurrentPage = currentPage === page.id;

              return (
                <div key={page.id} style={{ marginBottom: 4 }}>
                  <button
                    onClick={() => {
                      if (hasSections) {
                        togglePage(page.id);
                      } else {
                        onNavigate(page.id, null, true);
                      }
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: isCurrentPage ? colors.surface : 'transparent',
                      border: 'none',
                      color: colors.textPrimary,
                      padding: '14px 16px',
                      fontSize: 16,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      borderRadius: 8
                    }}
                  >
                    {hasSections && (
                      isExpanded
                        ? <ChevronDown size={18} color={colors.textMuted} />
                        : <ChevronRight size={18} color={colors.textMuted} />
                    )}
                    {!hasSections && <div style={{ width: 18 }} />}
                    {page.starred && <Star size={14} color={colors.primary} fill={colors.primary} />}
                    <span style={{ flex: 1 }}>{page.name}</span>
                  </button>

                  {/* Sections - collapsible */}
                  {hasSections && isExpanded && (
                    <div style={{
                      marginLeft: 30,
                      borderLeft: `1px solid ${colors.border}`,
                      paddingLeft: 12,
                      marginTop: 4
                    }}>
                      {/* Page level option */}
                      <button
                        onClick={() => onNavigate(page.id, null, true)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          background: isCurrentPage && !currentSection ? colors.surface : 'transparent',
                          border: 'none',
                          color: isCurrentPage && !currentSection ? colors.textPrimary : colors.textMuted,
                          padding: '12px 16px',
                          fontSize: 14,
                          cursor: 'pointer',
                          borderRadius: 6
                        }}
                      >
                        All sections
                      </button>
                      {page.sections.map(section => (
                        <button
                          key={section.id}
                          onClick={() => onNavigate(page.id, section.id, false)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: currentSection === section.id ? colors.surface : 'transparent',
                            border: 'none',
                            color: currentSection === section.id ? colors.textPrimary : colors.textMuted,
                            padding: '12px 16px',
                            fontSize: 14,
                            cursor: 'pointer',
                            borderRadius: 6
                          }}
                        >
                          {section.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Shared Pages */}
          {sharedPages.length > 0 && (
            <div style={{ padding: '0 20px', marginBottom: 24 }}>
              <p style={{
                color: colors.textMuted,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1.5,
                margin: '0 0 12px 0',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <Users size={12} />
                SHARED WITH ME
              </p>
              {sharedPages.map(page => {
                const isExpanded = expandedPages[page.id];
                const hasSections = page.sections && page.sections.length > 0;
                const isCurrentPage = currentPage === page.id;

                return (
                  <div key={page.id} style={{ marginBottom: 4 }}>
                    <button
                      onClick={() => {
                        if (hasSections) {
                          togglePage(page.id);
                        } else {
                          onNavigate(page.id, null, true);
                        }
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: isCurrentPage ? colors.surface : 'transparent',
                        border: 'none',
                        color: colors.textPrimary,
                        padding: '14px 16px',
                        fontSize: 16,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        borderRadius: 8
                      }}
                    >
                      {hasSections && (
                        isExpanded
                          ? <ChevronDown size={18} color={colors.textMuted} />
                          : <ChevronRight size={18} color={colors.textMuted} />
                      )}
                      {!hasSections && <div style={{ width: 18 }} />}
                      <span style={{ flex: 1 }}>{page.name}</span>
                    </button>

                    {hasSections && isExpanded && (
                      <div style={{
                        marginLeft: 30,
                        borderLeft: `1px solid ${colors.border}`,
                        paddingLeft: 12,
                        marginTop: 4
                      }}>
                        <button
                          onClick={() => onNavigate(page.id, null, true)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: isCurrentPage && !currentSection ? colors.surface : 'transparent',
                            border: 'none',
                            color: isCurrentPage && !currentSection ? colors.textPrimary : colors.textMuted,
                            padding: '12px 16px',
                            fontSize: 14,
                            cursor: 'pointer',
                            borderRadius: 6
                          }}
                        >
                          All sections
                        </button>
                        {page.sections.map(section => (
                          <button
                            key={section.id}
                            onClick={() => onNavigate(page.id, section.id, false)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              background: currentSection === section.id ? colors.surface : 'transparent',
                              border: 'none',
                              color: currentSection === section.id ? colors.textPrimary : colors.textMuted,
                              padding: '12px 16px',
                              fontSize: 14,
                              cursor: 'pointer',
                              borderRadius: 6
                            }}
                          >
                            {section.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer with user info */}
        {user && (
          <div style={{
            borderTop: `1px solid ${colors.border}`,
            padding: '16px 20px',
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            flexShrink: 0
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: colors.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: colors.bg,
                fontWeight: 600,
                fontSize: 14
              }}>
                {getUserInitials(user)}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{
                  color: colors.textPrimary,
                  fontSize: 14,
                  fontWeight: 500,
                  margin: 0
                }}>
                  {user.user_metadata?.full_name || user.email}
                </p>
                {user.user_metadata?.full_name && (
                  <p style={{
                    color: colors.textMuted,
                    fontSize: 12,
                    margin: '2px 0 0 0'
                  }}>
                    {user.email}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
