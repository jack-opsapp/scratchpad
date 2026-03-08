import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Filter,
  ArrowUpDown,
  LayoutGrid,
  List,
  Calendar,
  Star,
  LogOut,
  Menu,
  Trash2,
  Send,
  X,
  Edit3,
  FolderPlus,
  Search,
  Settings,
  Keyboard,
  Share2,
  AlignJustify,
  Home,
  Copy,
  Check,
  Table2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Network,
  FileText,
  ListTree,
  Archive,
  ArchiveRestore,
} from 'lucide-react';

import { useTypewriter } from '../hooks/useTypewriter.js';
import { usePinchZoom } from '../hooks/usePinchZoom.js';
import usePlanState from '../hooks/usePlanState.js';
import { useMediaQuery, useOnlineStatus } from '../hooks/useMediaQuery.js';
import { useSettings } from '../hooks/useSettings.js';
import { useUndoRedo } from '../hooks/useUndoRedo.js';
import { syncOfflineQueue, getPendingSyncCount, offlineParser, queueChatMessage } from '../lib/offlineHandler.js';
import { getTheme, applyTheme, applyFontSize, applyChatStyling } from '../lib/themes.js';

// Typewriter text component for animated items
function TypewriterText({ text, animate, onComplete, style }) {
  const { displayed, done } = useTypewriter(text, 30, 0, animate);

  useEffect(() => {
    if (done && animate && onComplete) {
      onComplete();
    }
  }, [done, animate, onComplete]);

  return (
    <span style={style}>
      {animate ? displayed : text}
      {animate && !done && <span style={{ opacity: 0.5 }}>|</span>}
    </span>
  );
}

// API Error Badge component - shows when fallback parser is used
function ApiErrorBadge({ error, onDismiss }) {
  const [expanded, setExpanded] = useState(false);

  if (!error) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 52, // Just below the header
        right: 12,
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        onClick={onDismiss}
        style={{
          padding: '6px 12px',
          borderRadius: 2,
          border: '1px solid #8B0000',
          background: 'rgba(139, 0, 0, 0.15)',
          color: '#CD5C5C',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          maxWidth: expanded ? 400 : 100,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        {expanded ? `API FAILURE: ${error.message}` : 'API FAILURE'}
      </div>
    </div>
  );
}

import useChatState from '../hooks/useChatState.js';
import { dataStore } from '../lib/storage.js';
import { supabase } from '../config/supabase.js';
import { callAgent } from '../lib/agent.js';
import { executeGroup, summarizeResults } from '../lib/planExecutor.js';
import { executeViewChanges } from '../lib/viewController.js';
import { executeBulkOperation } from '../lib/bulkOperations.js';
import { colors } from '../styles/theme.js';
import {
  getPageRole,
  getPageCollaborators,
  leaveSharedPage,
  acceptPageShare,
  declinePageShare,
} from '../lib/permissions.js';

import {
  LoadingBars,
  ContextMenu,
  TagPill,
  NoteCard,
  HomeView,
  ChatResponseBox,
  CalendarView,
  BoxesView,
  GraphView,
  PlanModeInterface,
  ChatPanel,
  ConnectionsPopover,
  WelcomeOnboarding,
  RichTextEditor,
} from '../components/index.js';
import { TableView } from '../components/TableView.jsx';
import { parseWikilinks, buildWikilink } from '../lib/wikilinks.js';
import ShareModal from '../components/ShareModal.jsx';
import SettingsModal from '../components/SettingsModal.jsx';
import TrashModal from '../components/TrashModal.jsx';
import CollaboratorBadge from '../components/CollaboratorBadge.jsx';
import MobileSidebar from '../components/MobileSidebar.jsx';
import MobileHeader from '../components/MobileHeader.jsx';
import MobileNoteCard from '../components/MobileNoteCard.jsx';
import RichTextConvertModal from '../components/RichTextConvertModal.jsx';

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
function generateId() {
  return crypto.randomUUID();
}

// Track whether current drag is a section (can't read data during dragover)
let draggingSection = false;
// Track the dragged section's ID for same-page reorder
let draggingSectionId = null;
// Track whether current drag is a note reorder (can't read data during dragover)
let draggingNote = false;
let draggingNoteId = null;

/**
 * Get user display name from user object
 * @param {object} user - Supabase user object
 * @returns {string} Display name or email prefix
 */
function getUserDisplayName(user) {
  if (!user) return 'User';
  // Try to get name from user metadata (Google OAuth provides this)
  if (user.user_metadata?.full_name) return user.user_metadata.full_name;
  if (user.user_metadata?.name) return user.user_metadata.name;
  // Fall back to email prefix
  if (user.email) return user.email.split('@')[0];
  return 'User';
}

/**
 * Get user initials for avatar
 * @param {object} user - Supabase user object
 * @returns {string} Initials (1-2 characters)
 */
function getUserInitials(user) {
  if (!user) return '?';
  const name = getUserDisplayName(user);
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 1).toUpperCase();
}

/**
 * Main application screen
 *
 * @param {object} props
 * @param {object} props.user - Authenticated user object from Supabase
 * @param {function} props.onSignOut - Sign out handler
 */
export function MainApp({ user, onSignOut }) {
  // Mobile/responsive state
  const { isMobile, isTablet, isDesktop } = useMediaQuery();
  const isOnline = useOnlineStatus();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Data state
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState([]);
  const [ownedPages, setOwnedPages] = useState([]);
  const [sharedPages, setSharedPages] = useState([]);
  const [tags, setTags] = useState([]);
  const [notes, setNotes] = useState([]);
  const [boxConfigs, setBoxConfigs] = useState({});
  const [connections, setConnections] = useState([]);
  const [connectionsPopover, setConnectionsPopover] = useState(null); // { noteId, top, left }

  // Undo/redo for note operations
  const { pushUndo, undo, redo, canUndo, canRedo } = useUndoRedo({
    supabase,
    setNotes,
    setInputValue: (val) => chatPanelRef.current?.setInputValue(val),
    user,
  });

  // Animation state - track newly created items for typewriter effect
  const [animatingItems, setAnimatingItems] = useState(new Set());

  // API error state - track when fallback parser is used
  const [apiError, setApiError] = useState(null); // { message: string, timestamp: number }
  const [copiedNotes, setCopiedNotes] = useState(false);

  // Collaboration state
  const [pageRoles, setPageRoles] = useState({});
  const [collabCounts, setCollabCounts] = useState({});
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareModalPageId, setShareModalPageId] = useState(null);

  // Settings state
  const { settings } = useSettings();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [showRichTextConvertModal, setShowRichTextConvertModal] = useState(false);
  const [richTextConvertTarget, setRichTextConvertTarget] = useState(null); // { pageId, sectionId, sectionName }

  // Navigation state
  const [currentPage, setCurrentPage] = useState(null);
  const [currentSection, setCurrentSection] = useState(null);
  const [viewingPageLevel, setViewingPageLevel] = useState(false);
  const [expandedPages, setExpandedPages] = useState([]);
  const [sectionNavHistory, setSectionNavHistory] = useState([]); // Recently navigated page/section prefixes

  // Agent custom view state
  // { title: string, viewType: 'list'|'boxes'|'calendar', filter: object, groupBy?: string }
  const [agentView, setAgentView] = useState(null);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('list');
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [headerMenuPosition, setHeaderMenuPosition] = useState({ top: 0, left: 0 });
  const [editingHeaderItem, setEditingHeaderItem] = useState(null);
  const [filterIncomplete, setFilterIncomplete] = useState(false);
  const [filterTag, setFilterTag] = useState([]);
  const [tagScope, setTagScope] = useState('all'); // 'all' | 'page' | 'section'
  const [sortBy, setSortBy] = useState('status'); // Default: incomplete first
  const [customSortOrder, setCustomSortOrder] = useState({}); // { [contextKey]: { ids: string[], criteria: string } }
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [groupBy] = useState('status');
  const [compactMode, setCompactMode] = useState(false); // Hide tags, dates, avatars
  const [showCompleted, setShowCompleted] = useState(false); // Collapsible completed notes section
  const [collapsedSections, setCollapsedSections] = useState(new Set()); // Per-section collapse in page-level view
  const [completingNotes, setCompletingNotes] = useState(new Set()); // Notes currently animating completion

  // Default all sections collapsed when entering page-level view
  useEffect(() => {
    if (viewingPageLevel && currentPageData?.sections?.length) {
      setCollapsedSections(new Set(currentPageData.sections.map(s => s.id)));
    }
  }, [viewingPageLevel, currentPage]);

  // Track section navigation history for Shift+Up/Down cycling
  useEffect(() => {
    if (!currentSection || !currentPage) return;
    const page = pages.find(p => p.id === currentPage);
    const section = page?.sections?.find(s => s.id === currentSection);
    if (!page || !section) return;
    const prefix = `${page.name.toLowerCase()}/${section.name.toLowerCase()}: `;
    setSectionNavHistory(prev => {
      const filtered = prev.filter(p => p !== prefix);
      return [...filtered, prefix];
    });
  }, [currentSection]);

  // Pinch-to-zoom for notes area
  const { containerRef: zoomRef, scale: zoomScale, resetZoom, setScale: setZoomScale } = usePinchZoom({ minScale: 0.5, maxScale: 2.0 });

  // Swipe-right to cycle view modes
  const viewModes = ['list', 'boxes', 'calendar', 'table', 'graph'];
  const swipeStartRef = useRef(null);
  const handleContentTouchStart = (e) => {
    if (e.touches.length === 1) {
      swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };
  const handleContentTouchEnd = (e) => {
    if (!swipeStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - swipeStartRef.current.x;
    const dy = touch.clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;
    // Require horizontal swipe > 80px, mostly horizontal (not vertical scrolling)
    if (dx < -80 && Math.abs(dy) < Math.abs(dx) * 0.6) {
      // Swipe left (from right) → next view mode
      const currentMode = agentView ? agentView.viewType : viewMode;
      const idx = viewModes.indexOf(currentMode);
      const next = viewModes[(idx + 1) % viewModes.length];
      if (agentView) {
        setAgentView({ ...agentView, viewType: next });
      } else {
        setViewMode(next);
      }
    }
  };

  // Input state
  const [inputValue, setInputValue] = useState('');
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef(null);

  // Modal/menu state
  const [contextMenu, setContextMenu] = useState(null);
  const [contextMenuPosition, setContextMenuPosition] = useState(null);
  const [createPrompt, setCreatePrompt] = useState(null);
  const [pendingNote, setPendingNote] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Edit state
  const [editingItem, setEditingItem] = useState(null);
  const [newTagName, setNewTagName] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [tagManageMode, setTagManageMode] = useState(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [selectedTagsForManage, setSelectedTagsForManage] = useState([]);
  const [mergeTargetName, setMergeTargetName] = useState('');

  // Animation state
  const [newNoteId, setNewNoteId] = useState(null);
  const [chatResponse, setChatResponse] = useState(null);
  const [contentVisible, setContentVisible] = useState(false);

  // Plan mode state
  const planState = usePlanState();
  const [currentConfirmation, setCurrentConfirmation] = useState(null);
  const [revisionInput, setRevisionInput] = useState('');
  const [showRevisionInput, setShowRevisionInput] = useState(false);

  // Chat state
  const chatState = useChatState();
  const [awaitingResponse, setAwaitingResponse] = useState(null);
  const chatPanelRef = useRef(null);

  // Load data on mount
  useEffect(() => {
    const load = async () => {
      // Load owned and shared pages separately
      const [owned, shared, notesData, boxConfigsData, connectionsData] = await Promise.all([
        dataStore.getOwnedPages(),
        dataStore.getSharedPages(),
        dataStore.getNotes(),
        dataStore.getBoxConfigs(),
        dataStore.getConnections(),
      ]);

      const allPages = [...owned, ...shared];

      setOwnedPages(owned || []);
      setSharedPages(shared || []);
      setPages(allPages);
      setNotes(notesData || []);
      setConnections(connectionsData || []);
      // Derive tags from notes
      const allTags = [...new Set(
        (notesData || []).flatMap(n => n.tags || []).filter(Boolean)
      )];
      setTags(allTags);
      setBoxConfigs(boxConfigsData || {});

      // Set roles
      const roles = {};
      owned.forEach(p => { roles[p.id] = 'owner'; });
      shared.forEach(p => { roles[p.id] = p.myRole || 'team'; });
      setPageRoles(roles);

      // Load collaborator counts
      const counts = {};
      for (const page of allPages) {
        try {
          const collabs = await getPageCollaborators(page.id);
          counts[page.id] = collabs.length - 1; // Exclude self
        } catch (e) {
          counts[page.id] = 0;
        }
      }
      setCollabCounts(counts);

      setExpandedPages([]);

      // Check URL path for page/section first, then fall back to settings default
      const pathMatch = window.location.pathname.match(/\/p\/([^/]+)(?:\/s\/([^/]+))?/);
      const urlPageId = pathMatch?.[1] || null;
      const urlSectionId = pathMatch?.[2] || null;

      if (urlPageId) {
        const urlPage = allPages.find(p => p.id === urlPageId);
        if (urlPage) {
          setCurrentPage(urlPage.id);
          if (urlSectionId) {
            const urlSection = urlPage.sections?.find(s => s.id === urlSectionId);
            setCurrentSection(urlSection?.id || urlPage.sections?.[0]?.id || null);
          } else {
            setViewingPageLevel(true);
            setCurrentSection(urlPage.sections?.[0]?.id || null);
          }
        }
      } else if (settings?.defaultPageId) {
        const defaultPage = allPages.find(p => p.id === settings.defaultPageId);
        if (defaultPage) {
          setCurrentPage(defaultPage.id);
          if (settings.defaultSectionId) {
            const defaultSection = defaultPage.sections?.find(s => s.id === settings.defaultSectionId);
            setCurrentSection(defaultSection?.id || defaultPage.sections?.[0]?.id || null);
          } else {
            setCurrentSection(defaultPage.sections?.[0]?.id || null);
          }
        }
        // If default page not found, fall through to home view (currentPage stays null)
      }
      // If no default set, currentPage stays null = home view

      setLoading(false);

      // Backfill embeddings for notes that don't have them (async, non-blocking)
      dataStore.backfillEmbeddings().catch(() => {});
    };
    load();
  }, []);

  // Sync navigation state to URL path for reload persistence
  useEffect(() => {
    if (loading) return;
    let path = '/';
    if (currentPage) {
      path = `/p/${currentPage}`;
      if (currentSection && !viewingPageLevel) {
        path += `/s/${currentSection}`;
      }
    }
    window.history.replaceState(null, '', path);
  }, [currentPage, currentSection, viewingPageLevel, loading]);

  // Apply theme settings when they change
  useEffect(() => {
    if (settings) {
      const theme = getTheme(settings.theme, settings.accentColor, settings.customAccentColor);
      applyTheme(theme);
      applyFontSize(settings.fontSize);
      applyChatStyling(settings, theme, theme.primary);
    }
  }, [settings]);

  // Save data on changes (debounced). Notes are excluded because each note
  // mutation (create, toggle, edit, delete) already persists directly to Supabase.
  // Including notes here would cause stale local state to overwrite server-side changes.
  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        dataStore.saveAll({ pages, tags, boxConfigs });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [pages, tags, boxConfigs, loading]);

  // Sync offline queue when back online
  useEffect(() => {
    if (isOnline && pendingSyncCount > 0) {
      syncOfflineQueue().then(result => {
        if (result.success) {
          setPendingSyncCount(0);
        }
      });
    }
  }, [isOnline, pendingSyncCount]);

  // Update pending sync count periodically
  useEffect(() => {
    const updateCount = () => setPendingSyncCount(getPendingSyncCount());
    updateCount();
    const interval = setInterval(updateCount, 5000);
    return () => clearInterval(interval);
  }, []);

  // Content visibility animation
  useEffect(() => {
    setContentVisible(false);
    setTimeout(() => setContentVisible(true), 300);
  }, [currentSection, viewingPageLevel]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = e => {
      const isTyping = document.activeElement?.tagName === 'INPUT';
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
        setShowShortcuts(false);
      } else if (mod && e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (mod && e.key === '?') {
        e.preventDefault();
        setShowShortcuts(s => !s);
      } else if (mod && e.key === 'p') {
        e.preventDefault();
        const name = prompt('New page name:');
        if (name) {
          const np = {
            id: generateId(),
            name,
            starred: false,
            sections: [],
          };
          // Persist to Supabase
          supabase.from('pages').insert({
            id: np.id, name: np.name, starred: false, user_id: user?.id,
          });
          setPages(pg => [...pg, np]);
          setOwnedPages(pg => [...pg, np]);
          setExpandedPages(ep => [...ep, np.id]);
          setCurrentPage(np.id);
          setViewingPageLevel(true);
        }
      } else if (mod && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      } else if (mod && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (mod && e.key === 's') {
        e.preventDefault();
        if (currentPage) {
          const name = prompt('New section name:');
          if (name) {
            const ns = { id: generateId(), name };
            // Direct Supabase insert
            supabase.from('sections').insert({
              id: ns.id, page_id: currentPage, name: ns.name, position: currentPageData?.sections?.length || 0
            });
            const updatePageSections = pg =>
              pg.map(p =>
                p.id === currentPage
                  ? { ...p, sections: [...p.sections, ns] }
                  : p
              );
            setPages(updatePageSections);
            setOwnedPages(updatePageSections);
            setSharedPages(updatePageSections);
            setCurrentSection(ns.id);
            setViewingPageLevel(false);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [searchOpen, currentPage]);

  // Computed values
  const allPages = [...ownedPages, ...sharedPages];
  const allSections = allPages.flatMap(p =>
    p.sections.map(s => ({ ...s, pageId: p.id, pageName: p.name }))
  );
  const currentPageData = allPages.find(p => p.id === currentPage);
  const currentSectionData = currentPageData?.sections.find(
    s => s.id === currentSection
  );
  const myRole = pageRoles[currentPage] || 'owner';
  const canManageCurrentPage = ['owner', 'team-admin'].includes(myRole);

  const filteredNotes = (
    viewingPageLevel
      ? notes.filter(n =>
          currentPageData?.sections.some(s =>
            s.id === n.sectionId || n.sharedSectionIds?.includes(s.id)
          )
        )
      : notes.filter(n =>
          n.sectionId === currentSection || n.sharedSectionIds?.includes(currentSection)
        )
  )
    .filter(n => !filterIncomplete || !n.completed)
    .filter(
      n => filterTag.length === 0 || filterTag.every(t => n.tags?.includes(t))
    )
    .sort((a, b) => {
      if (sortBy === 'custom') {
        const contextKey = viewingPageLevel ? `page-${currentPage}` : `section-${currentSection}`;
        const sortOrder = customSortOrder[contextKey] || customSortOrder['current'];
        if (sortOrder?.ids) {
          const aIdx = sortOrder.ids.indexOf(a.id);
          const bIdx = sortOrder.ids.indexOf(b.id);
          // Notes not in the sort order go to the end
          if (aIdx === -1 && bIdx === -1) return 0;
          if (aIdx === -1) return 1;
          if (bIdx === -1) return -1;
          return aIdx - bIdx;
        }
        // Fall back to position-based ordering (drag-to-reorder)
        return (a.position || 0) - (b.position || 0);
      }
      if (sortBy === 'status') {
        // Incomplete first, then by created date
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      }
      if (sortBy === 'created') {
        return (b.createdAt || 0) - (a.createdAt || 0);
      }
      return (a.content || '').localeCompare(b.content || '');
    });

  // Agent-filtered notes for custom views
  const agentFilteredNotes = agentView ? notes.filter(note => {
    const filter = agentView.filter || {};

    // Tag filter from agent view - match any of the specified tags
    if (filter.tags?.length) {
      const hasMatchingTag = filter.tags.some(t =>
        note.tags?.some(nt => nt.toLowerCase().includes(t.toLowerCase()))
      );
      if (!hasMatchingTag && !filter.search) return false;
      if (hasMatchingTag) return true;
    }

    // Search filter - match content
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      if (!note.content?.toLowerCase().includes(searchLower) &&
          !note.tags?.some(t => t.toLowerCase().includes(searchLower))) {
        return false;
      }
    }

    // Page filter
    if (filter.page_name) {
      const page = allPages.find(p =>
        p.name.toLowerCase() === filter.page_name.toLowerCase()
      );
      if (!page || !page.sections?.some(s => s.id === note.sectionId)) {
        return false;
      }
    }

    // Section filter
    if (filter.section_name) {
      const section = allSections.find(s =>
        s.name.toLowerCase() === filter.section_name.toLowerCase()
      );
      if (!section || note.sectionId !== section.id) {
        return false;
      }
    }

    // Completed filter from agent view
    if (filter.completed !== undefined) {
      if (note.completed !== filter.completed) return false;
    }

    // Has no tags filter
    if (filter.has_no_tags) {
      if (note.tags?.length > 0) return false;
    }

    // If no agent filters, include all notes
    if (!filter.tags?.length && !filter.search && !filter.page_name &&
        !filter.section_name && filter.completed === undefined && !filter.has_no_tags) {
      return true;
    }

    return true;
  })
    // Apply UI filters (incomplete toggle, tag pills)
    .filter(n => !filterIncomplete || !n.completed)
    .filter(n => filterTag.length === 0 || filterTag.some(t => n.tags?.includes(t)))
    // Apply sort
    .sort((a, b) => {
      if (sortBy === 'status') {
        // Incomplete first, then by created date
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0);
      }
      if (sortBy === 'created') {
        return new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0);
      }
      return (a.content || '').localeCompare(b.content || '');
    }) : [];

  // Group notes for agent boxes view
  const groupAgentNotes = (notesToGroup, groupByField) => {
    if (!groupByField) return { 'All Notes': notesToGroup };

    const groups = {};
    notesToGroup.forEach(note => {
      let key;
      switch (groupByField) {
        case 'section': {
          const section = allSections.find(s => s.id === note.sectionId);
          key = section?.name || 'Unknown Section';
          break;
        }
        case 'page': {
          const section = allSections.find(s => s.id === note.sectionId);
          key = section?.pageName || 'Unknown Page';
          break;
        }
        case 'tag': {
          // Put note in each tag group it belongs to
          if (note.tags?.length) {
            note.tags.forEach(tag => {
              if (!groups[tag]) groups[tag] = [];
              groups[tag].push(note);
            });
            return; // Don't add to default group
          }
          key = 'Untagged';
          break;
        }
        case 'month': {
          const date = new Date(note.date || note.createdAt || note.created_at);
          key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          break;
        }
        case 'week': {
          const date = new Date(note.date || note.createdAt || note.created_at);
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
          break;
        }
        case 'day': {
          const date = new Date(note.date || note.createdAt || note.created_at);
          key = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
          break;
        }
        case 'completed':
          key = note.completed ? 'Completed' : 'Incomplete';
          break;
        default:
          key = 'All Notes';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(note);
    });
    return groups;
  };

  const searchResults = searchQuery.trim()
    ? notes
        .filter(
          n =>
            n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.tags?.some(t => t.includes(searchQuery.toLowerCase()))
        )
        .slice(0, 10)
    : [];

  // Context ID for box configs
  const getBoxContextId = () =>
    viewingPageLevel ? `page-${currentPage}` : `section-${currentSection}`;

  const handleSaveBoxConfigs = (contextId, config) => {
    setBoxConfigs(prev => ({
      ...prev,
      [contextId]: { ...prev[contextId], ...config },
    }));
  };

  // Context menu helpers
  const openContextMenu = (id, e) => {
    e.stopPropagation();
    setContextMenuPosition({
      top: e.currentTarget.getBoundingClientRect().bottom + 4,
      left: e.currentTarget.getBoundingClientRect().left,
    });
    setContextMenu(id);
  };

  // Tag management
  const handleDeleteTags = () => {
    if (selectedTagsForManage.length === 0) return;
    setNotes(
      notes.map(n => ({
        ...n,
        tags: n.tags?.filter(t => !selectedTagsForManage.includes(t)) || [],
      }))
    );
    setTags(tags.filter(t => !selectedTagsForManage.includes(t)));
    setFilterTag(filterTag.filter(t => !selectedTagsForManage.includes(t)));
    setSelectedTagsForManage([]);
    setTagManageMode(null);
  };

  const handleMergeTags = () => {
    if (selectedTagsForManage.length < 2) return;
    const targetName =
      mergeTargetName.trim().toLowerCase() || selectedTagsForManage[0];
    setNotes(
      notes.map(n => ({
        ...n,
        tags:
          n.tags
            ?.map(t => (selectedTagsForManage.includes(t) ? targetName : t))
            .filter((t, i, a) => a.indexOf(t) === i) || [],
      }))
    );
    setTags(
      [
        ...tags.filter(t => !selectedTagsForManage.includes(t)),
        targetName,
      ].filter((t, i, a) => a.indexOf(t) === i)
    );
    setSelectedTagsForManage([]);
    setMergeTargetName('');
    setTagManageMode(null);
  };

  // Note submission with plan mode support
  const handleSubmit = async () => {
    if (!inputValue.trim() || processing) return;
    const originalMessage = inputValue.trim();
    setProcessing(true);

    try {
      // Call agent with current plan state
      const result = await callAgent(
        inputValue,
        {
          pages,
          sections: allSections,
          tags,
          currentPage: currentPageData?.name || '',
          currentSection: currentSectionData?.name || '',
        },
        planState.isInPlanMode ? {
          mode: planState.mode,
          plan: planState.plan,
          currentGroupIndex: planState.currentGroupIndex,
          context: planState.context
        } : null
      );

      // Handle different response types
      switch (result.type) {
        case 'plan_proposal':
          // Start plan review mode
          planState.startPlan(result.plan);
          setChatResponse({
            message: result.message,
            note: `Plan has ${result.plan.totalGroups} groups. Review and approve in the panel.`
          });
          break;

        case 'cancel_plan':
          planState.cancelPlan();
          setChatResponse({ message: result.message, note: result.partialState || 'Plan cancelled.' });
          setCurrentConfirmation(null);
          break;

        case 'single_action':
        default:
          // Normal single-step execution (existing behavior)
          const parsed = result.parsed;

          if (parsed?.newPage && parsed?.page) {
            setPendingNote({ parsed, response: result.response });
            setCreatePrompt({ type: 'page', name: parsed.page });
            break;
          }

          if (parsed?.newSection && parsed?.section) {
            setPendingNote({ parsed, response: result.response });
            setCreatePrompt({ type: 'section', name: parsed.section });
            break;
          }

          if (parsed) {
            addNote(parsed, result.response, originalMessage);
          }
          break;
      }

    } catch (error) {
      console.error('Agent error:', error);
      setChatResponse({ message: 'Error processing command.', note: error.message });
    } finally {
      setProcessing(false);
      setInputValue('');
      // Refresh pages/sections/connections but NOT notes (addNote already handles note state)
      setTimeout(() => refreshDataWithoutNotes(), 500);
    }
  };

  const addNote = (parsed, response, originalMessage = '') => {
    let targetSection = currentSection;

    if (parsed.section) {
      const match = allSections.find(
        s => s.name.toLowerCase() === parsed.section.toLowerCase()
      );
      if (match) targetSection = match.id;
    }

    const newTags = parsed.tags?.filter(t => !tags.includes(t)) || [];
    if (newTags.length) setTags([...tags, ...newTags]);

    const sectionData = allSections.find(s => s.id === targetSection);
    setChatResponse({
      message: response?.message || 'Logged.',
      note: response?.note || parsed.content,
      location: sectionData
        ? `${sectionData.pageName}/${sectionData.name}`
        : null,
      options: response?.options,
    });
    setTimeout(() => setChatResponse(null), 5000);

    const noteId = generateId();
    setNewNoteId(noteId);
    setTimeout(() => setNewNoteId(null), 3000);

    const newNote = {
      id: noteId,
      sectionId: targetSection,
      content: parsed.content,
      tags: parsed.tags || [],
      completed: false,
      date: parsed.date,
      created_by_user_id: user?.id || null,
    };
    setNotes(prev => [...prev, newNote]);
    pushUndo({ type: 'create_note', noteId, note: newNote, inputMessage: originalMessage });

    // Direct Supabase persist
    supabase.from('notes').upsert({
      id: noteId,
      section_id: targetSection,
      content: parsed.content,
      tags: parsed.tags || [],
      completed: false,
      date: parsed.date || null,
      created_by_user_id: user?.id || null,
    }, { onConflict: 'id' })
      .then(({ error }) => { if (error) console.error('Note create persist failed:', error); });

    setInputValue('');
  };

  const handleCreateConfirm = () => {
    if (createPrompt.type === 'page') {
      const newPage = {
        id: generateId(),
        name: pendingNote.parsed.page,
        starred: false,
        sections: [],
      };
      if (pendingNote.parsed.section) {
        newPage.sections.push({
          id: `${newPage.id}-s1`,
          name: pendingNote.parsed.section,
        });
      }
      setPages([...pages, newPage]);
      setExpandedPages([...expandedPages, newPage.id]);
      setCurrentPage(newPage.id);
      if (newPage.sections[0]) {
        setCurrentSection(newPage.sections[0].id);
        setViewingPageLevel(false);
        addNote(
          { ...pendingNote.parsed, newPage: false, newSection: false },
          pendingNote.response
        );
      }
    } else {
      const newSection = {
        id: generateId(),
        name: pendingNote.parsed.section,
      };
      setPages(
        pages.map(p =>
          p.id === currentPage
            ? { ...p, sections: [...p.sections, newSection] }
            : p
        )
      );
      setCurrentSection(newSection.id);
      setViewingPageLevel(false);
      addNote(
        { ...pendingNote.parsed, newSection: false },
        pendingNote.response
      );
    }
    setCreatePrompt(null);
    setPendingNote(null);
  };

  // Plan mode - execute all approved groups
  const handleExecutePlan = async () => {
    if (!planState.plan || !planState.hasApprovedGroups()) return;

    planState.startExecution();
    setProcessing(true);

    let currentContext = { ...planState.context };
    const allAnimatingIds = new Set();

    try {
      // Execute each approved group in sequence
      for (let i = 0; i < planState.plan.groups.length; i++) {
        if (planState.groupStatuses[i] !== 'approved') continue;

        const group = planState.plan.groups[i];

        // Execute this group
        const { results, updatedContext } = await executeGroup(
          group.actions,
          currentContext,
          allPages,
          setOwnedPages,
          setNotes
        );

        // Update context for next group
        currentContext = { ...currentContext, ...updatedContext };

        // Record results
        const summary = summarizeResults(results);
        planState.recordGroupResult(i, { results, summary }, updatedContext);

        // Track newly created items for animation
        updatedContext.createdPages?.forEach(p => allAnimatingIds.add(p.id));
        updatedContext.createdSections?.forEach(s => allAnimatingIds.add(s.id));
      }

      // All done
      planState.completeExecution();

      // Refresh data to pick up server-side mutations
      await refreshData();

      // Animate new items
      if (allAnimatingIds.size > 0) {
        setAnimatingItems(prev => new Set([...prev, ...allAnimatingIds]));
      }

      // Trigger success animation and collapse
      chatPanelRef.current?.closePlanUI(true);

      // Build execution summary for agent
      const counts = planState.getCounts();
      const executionSummary = {
        totalSteps: counts.total,
        executedSteps: counts.approved,
        skippedSteps: counts.skipped,
        createdPages: currentContext.createdPages?.map(p => p.name) || [],
        createdSections: currentContext.createdSections?.map(s => s.name) || [],
        createdNotes: currentContext.createdNotes?.length || 0
      };

      // Ask agent to generate success message
      try {
        const result = await callAgent(
          `Plan execution complete. Summarize: ${JSON.stringify(executionSummary)}`,
          user?.id,
          [],
          null,
          {
            currentPage: currentPageData?.name || null,
            currentSection: currentSectionData?.name || null
          }
        );
        chatState.addAgentMessage(result.message || 'Done.', 'execution_result');
      } catch (e) {
        chatState.addAgentMessage('Done.', 'execution_result');
      }

      // Reset plan state after animation completes
      setTimeout(() => {
        planState.resetToIdle();
      }, 4000); // Allow time for animation

    } catch (error) {
      console.error('Execution error:', error);
      chatState.addAgentMessage(`Error executing plan: ${error.message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handlePlanCancel = () => {
    planState.cancelPlan();
    chatState.addAgentMessage('Plan cancelled.', 'text_response');
  };

  // Build conversation history from chat messages
  const getConversationHistory = () => {
    return chatState.messages
      .slice(-10)
      .filter(msg => msg.content && typeof msg.content === 'string')
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
  };

  // Execute frontend actions returned by agent
  const executeFrontendActions = (actions) => {
    if (!actions?.length) return;

    for (const action of actions) {
      switch (action.function) {
        case 'navigate':
          // Navigation is now handled via clickable "Go to..." links in chat messages.
          // View only changes when user explicitly clicks the navigation link.
          break;

        case 'apply_filter':
          if (action.tags?.length) {
            setFilterTag(action.tags[0]);
          }
          if (action.completed !== undefined) {
            setFilterIncomplete(!action.completed);
          }
          if (action.search) {
            // Could implement search filter
          }
          break;

        case 'clear_filters':
          setFilterTag(null);
          setFilterIncomplete(false);
          setAgentView(null);
          break;

        case 'create_custom_view':
          // Create a custom agent view
          setAgentView({
            title: action.title || 'AGENT VIEW',
            viewType: action.view_type || 'list',
            filter: action.filter || {},
            groupBy: action.group_by || null
          });
          // Clear regular navigation when showing agent view
          setCurrentPage(null);
          setCurrentSection(null);
          setViewingPageLevel(false);
          break;

        case 'sort_notes':
          // Apply custom sort order from AI
          if (action.sorted_ids?.length) {
            const contextKey = viewingPageLevel ? `page-${currentPage}` : `section-${currentSection}`;
            setCustomSortOrder(prev => ({
              ...prev,
              [contextKey]: { ids: action.sorted_ids, criteria: action.criteria || 'custom' }
            }));
            setSortBy('custom');
          }
          break;
      }
    }
  };

  // Refresh data from database after agent makes changes
  const refreshData = async () => {
    try {
      const [owned, shared, notesData, connectionsData] = await Promise.all([
        dataStore.getOwnedPages(),
        dataStore.getSharedPages(),
        dataStore.getNotes(),
        dataStore.getConnections()
      ]);

      if (owned) setOwnedPages(owned);
      if (shared) setSharedPages(shared);
      if (notesData) setNotes(notesData);
      if (connectionsData) setConnections(connectionsData);

      // Also refresh tags
      const allTags = [...new Set(
        (notesData || []).flatMap(n => n.tags || []).filter(Boolean)
      )];
      setTags(allTags);
    } catch (err) {
      console.error('Failed to refresh data:', err);
    }
  };

  // Refresh pages/sections/connections only (skip notes to avoid duplicating optimistic updates)
  const refreshDataWithoutNotes = async () => {
    try {
      const [owned, shared, connectionsData] = await Promise.all([
        dataStore.getOwnedPages(),
        dataStore.getSharedPages(),
        dataStore.getConnections()
      ]);

      if (owned) setOwnedPages(owned);
      if (shared) setSharedPages(shared);
      if (connectionsData) setConnections(connectionsData);
    } catch (err) {
      console.error('Failed to refresh data (without notes):', err);
    }
  };

  // Onboarding: create first page + section + note for new users
  const handleFirstNote = async (content) => {
    const pageId = generateId();
    const sectionId = generateId();
    const noteId = generateId();

    const newPage = {
      id: pageId,
      name: 'General',
      starred: false,
      sections: [{ id: sectionId, name: 'General' }],
    };
    const newNote = {
      id: noteId,
      sectionId,
      content,
      tags: [],
      completed: false,
      date: null,
      created_by_user_id: user?.id || null,
    };

    // Optimistic UI
    setPages(pg => [...pg, newPage]);
    setOwnedPages(pg => [...pg, newPage]);
    setNotes(prev => [...prev, newNote]);
    setExpandedPages(ep => [...ep, pageId]);
    setCurrentPage(pageId);
    setCurrentSection(sectionId);
    setViewingPageLevel(false);

    // Persist to Supabase
    await supabase.from('pages').insert({
      id: pageId, name: 'General', starred: false, user_id: user?.id,
    });
    await supabase.from('sections').insert({
      id: sectionId, page_id: pageId, name: 'General', position: 0,
    });
    await supabase.from('notes').insert({
      id: noteId, section_id: sectionId, content, tags: [], completed: false,
      date: null, created_by_user_id: user?.id || null,
    });
  };

  // Toggle note completion with direct Supabase persistence
  const handleNoteToggle = (id) => {
    // Record previous state for undo before toggling
    const prevNote = notes.find(n => n.id === id);
    if (prevNote) pushUndo({ type: 'toggle_note', noteId: id, previousCompleted: prevNote.completed });

    // Compute update data outside setNotes to guarantee it's available for Supabase call
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const newCompleted = !note.completed;
    const updateData = {
      completed: newCompleted,
      completed_by_user_id: newCompleted ? user.id : null,
      completed_at: newCompleted ? new Date().toISOString() : null,
    };

    if (newCompleted) {
      // Animate: strikethrough + collapse, then update state
      setCompletingNotes(prev => new Set(prev).add(id));
      setTimeout(() => {
        setCompletingNotes(prev => { const next = new Set(prev); next.delete(id); return next; });
        setNotes(prev => prev.map(n =>
          n.id === id ? { ...n, ...updateData } : n
        ));
      }, 650);
    } else {
      // Uncompleting: instant
      setNotes(prev => prev.map(n =>
        n.id === id ? { ...n, ...updateData } : n
      ));
    }

    // Persist to Supabase
    supabase.from('notes').update(updateData).eq('id', id)
      .then(({ error }) => {
        if (error) console.error('Toggle persist failed:', error);
      });
  };

  // Complete all visible notes
  const handleCompleteAll = async () => {
    const visibleNotes = agentView ? agentFilteredNotes : filteredNotes;
    const incompleteNotes = visibleNotes.filter(n => !n.completed);
    if (!incompleteNotes.length) return;

    if (!window.confirm(`Are you sure?\n\nThis will mark ${incompleteNotes.length} note${incompleteNotes.length === 1 ? '' : 's'} as completed.`)) return;

    const now = new Date().toISOString();
    const ids = incompleteNotes.map(n => n.id);

    // Optimistic UI update
    setNotes(prev => prev.map(n =>
      ids.includes(n.id)
        ? { ...n, completed: true, completed_by_user_id: user.id, completed_at: now }
        : n
    ));

    // Persist to Supabase
    const { error } = await supabase
      .from('notes')
      .update({ completed: true, completed_by_user_id: user.id, completed_at: now })
      .in('id', ids);
    if (error) console.error('Complete all failed:', error);
  };

  // Edit note content with direct Supabase persistence
  const handleNoteEdit = (id, content) => {
    const prevNote = notes.find(n => n.id === id);
    if (prevNote && prevNote.content !== content) {
      pushUndo({ type: 'edit_note', noteId: id, previousContent: prevNote.content, newContent: content });
    }
    // Optimistic UI update
    setNotes(prev => prev.map(n =>
      n.id === id ? { ...n, content } : n
    ));

    // Direct Supabase persist
    supabase.from('notes').update({ content }).eq('id', id)
      .then(({ error }) => { if (error) console.error('Edit persist failed:', error); });
  };

  // Delete note with direct Supabase persistence (soft delete)
  const handleNoteDelete = (id) => {
    const deletedNote = notes.find(n => n.id === id);
    if (deletedNote) pushUndo({ type: 'delete_note', noteId: id, note: { ...deletedNote } });
    setNotes(prev => prev.filter(n => n.id !== id));
    supabase.from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      .then(({ error }) => { if (error) console.error('Delete persist failed:', error); });
  };

  // Update note date with direct Supabase persistence
  const handleNoteDate = (id, date) => {
    setNotes(prev => prev.map(n =>
      n.id === id ? { ...n, date: date || null } : n
    ));
    supabase.from('notes').update({ date: date || null }).eq('id', id)
      .then(({ error }) => { if (error) console.error('Date update persist failed:', error); });
  };

  // Update note tags with direct Supabase persistence
  const handleNoteTags = (noteId, newTags) => {
    setNotes(prev => prev.map(n =>
      n.id === noteId ? { ...n, tags: newTags } : n
    ));
    supabase.from('notes').update({ tags: newTags }).eq('id', noteId)
      .then(({ error }) => { if (error) console.error('Tags update persist failed:', error); });
    // Add any new tags to global tag list
    const newGlobalTags = newTags.filter(t => !tags.includes(t));
    if (newGlobalTags.length) setTags(prev => [...prev, ...newGlobalTags]);
  };

  const handleAddTag = async (noteId) => {
    const tag = window.prompt('Tag name:')?.trim().toLowerCase();
    if (!tag) return;

    const note = notes.find(n => n.id === noteId);
    const newTags = [...new Set([...(note?.tags || []), tag])];

    setNotes(prev => prev.map(n =>
      n.id === noteId ? { ...n, tags: newTags } : n
    ));

    await supabase.from('notes').update({ tags: newTags }).eq('id', noteId)
      .then(({ error }) => { if (error) console.error('Add tag persist failed:', error); });

    if (!tags.includes(tag)) setTags(prev => [...prev, tag]);
  };

  // Note reorder handler (drag-to-reorder within a section)
  const handleNoteReorder = (sectionId, draggedId, targetId, insertAfter) => {
    const sectionNotes = notes.filter(n => n.sectionId === sectionId);
    const otherNotes = notes.filter(n => n.sectionId !== sectionId);
    const reordered = sectionNotes.filter(n => n.id !== draggedId);
    const targetIdx = reordered.findIndex(n => n.id === targetId);
    const insertIdx = insertAfter ? targetIdx + 1 : targetIdx;
    const draggedNote = sectionNotes.find(n => n.id === draggedId);
    if (!draggedNote) return;
    reordered.splice(insertIdx, 0, draggedNote);
    const withPositions = reordered.map((n, i) => ({ ...n, position: i }));
    setNotes([...otherNotes, ...withPositions]);
    // Update customSortOrder to reflect manual ordering
    const contextKey = `section-${sectionId}`;
    setCustomSortOrder(prev => ({
      ...prev,
      [contextKey]: { ids: withPositions.map(n => n.id), criteria: 'manual' },
    }));
    // Persist each note's position to Supabase
    withPositions.forEach(n => {
      supabase.from('notes').update({ position: n.position }).eq('id', n.id);
    });
  };

  // Connection handlers
  const handleCreateConnection = async (sourceNoteId, targetNoteId, type = 'related', label = null) => {
    const sourceNote = notes.find(n => n.id === sourceNoteId);
    const targetNote = notes.find(n => n.id === targetNoteId);
    if (!sourceNote || !targetNote) return;

    const tempId = generateId();
    const optimistic = {
      connection_id: tempId,
      source_note_id: sourceNoteId,
      source_content: sourceNote.content,
      target_note_id: targetNoteId,
      target_content: targetNote.content,
      connection_type: type,
      label,
    };
    setConnections(prev => [...prev, optimistic]);

    const result = await dataStore.createConnection(sourceNoteId, targetNoteId, type, label);
    if (result) {
      setConnections(prev => prev.map(c => c.connection_id === tempId ? { ...c, connection_id: result.id } : c));
    } else {
      setConnections(prev => prev.filter(c => c.connection_id !== tempId));
    }
  };

  const handleDeleteConnection = async (connectionId) => {
    setConnections(prev => prev.filter(c => c.connection_id !== connectionId));
    const ok = await dataStore.deleteConnection(connectionId);
    if (!ok) {
      const fresh = await dataStore.getConnections();
      setConnections(fresh || []);
    }
  };

  // Process a single message (internal)
  const processMessage = async (message, confirmedValue = null) => {
    try {
      // Call the new agent endpoint with current context
      const result = await callAgent(
        message,
        user?.id,
        getConversationHistory(),
        confirmedValue,
        {
          currentPage: currentPageData?.name || null,
          currentSection: currentSectionData?.name || null
        }
      );

      // Clear any previous API error on success
      if (result._source === 'api') {
        setApiError(null);
      }

      // Execute any frontend actions (navigate, filter, etc.)
      if (result.actions?.length) {
        executeFrontendActions(result.actions);
      }

      // Check if agent created a custom view - store it for clickable restoration
      const createdView = result.actions?.find(a => a.function === 'create_custom_view');
      const viewConfig = createdView ? {
        title: createdView.title,
        viewType: createdView.view_type || 'list',
        filter: createdView.filter || {},
        groupBy: createdView.group_by || null
      } : null;

      // Check if agent navigated - store for clickable link
      const navigateAction = result.actions?.find(a => a.function === 'navigate');
      const navConfig = navigateAction ? {
        pageName: navigateAction.page_name,
        sectionName: navigateAction.section_name
      } : null;

      // Handle response based on type
      switch (result.type) {
        case 'response':
          // Normal response - agent has completed the operation
          chatState.addAgentMessage(result.message || 'Done.', 'text_response', {
            viewConfig, // Store view config if one was created
            navConfig   // Store navigation config if agent navigated
          });
          // Capture current note IDs before refresh to detect new ones
          let prevNoteIds;
          setNotes(prev => { prevNoteIds = new Set(prev.map(n => n.id)); return prev; });
          // Refresh data in case agent made changes
          await refreshData();
          // Trigger typewriter animation on any newly created note
          if (prevNoteIds) {
            setNotes(prev => {
              const newNote = prev.find(n => !prevNoteIds.has(n.id));
              if (newNote) {
                setNewNoteId(newNote.id);
                setTimeout(() => setNewNoteId(null), 3000);
              }
              return prev;
            });
          }
          break;

        case 'clarification':
          // Agent needs more information
          chatState.addAgentMessage(result.question || 'Could you clarify?', 'clarification', {
            options: result.options
          });
          setAwaitingResponse({ type: 'clarification', data: result });
          break;

        case 'confirmation':
          // Agent wants user to confirm before proceeding
          chatState.addAgentMessage(result.message || 'Confirm?', 'bulk_confirmation', {
            confirmValue: result.confirmValue
          });
          setAwaitingResponse({ type: 'confirmation', data: result });
          break;

        case 'plan_proposal':
          // Agent proposed a multi-step plan - start review mode
          planState.startPlan(result.plan);
          chatState.addAgentMessage(result.message || result.plan?.summary || 'Review the plan.', 'plan_proposal', {
            plan: result.plan
          });
          // Plan panel will show on right side for review
          break;

        case 'step_revision':
          // Agent revised a single step in the existing plan
          if (planState.isInPlanMode && planState.plan) {
            planState.updateGroup(result.stepIndex, result.revisedGroup);
            // Reset the group status back to pending so user can re-approve
            planState.resetGroup(result.stepIndex);
            // Navigate to the revised step so user can review
            planState.goToGroup(result.stepIndex);
            chatState.addAgentMessage(result.message, 'text_response');
          } else {
            // No active plan - show error
            chatState.addAgentMessage('No active plan to revise.', 'error');
          }
          break;

        case 'error':
          const errorMsg = result.details
            ? `${result.message || 'Error'}: ${result.details}`
            : (result.message || 'An error occurred.');
          chatState.addAgentMessage(errorMsg, 'error');
          break;

        default:
          // Unknown type - just show the message
          if (result.message) {
            chatState.addAgentMessage(result.message, 'text_response');
          }
          break;
      }

      chatState.checkCompact();

    } catch (error) {
      console.error('Chat error:', error);
      chatState.addAgentMessage(`Error: ${error.message}`, 'error');
    }
  };

  // Process next message from queue
  const processNextInQueue = async () => {
    const next = chatState.getNextFromQueue();
    if (next) {
      await processMessage(next.message, next.confirmedValue);
      // Check for more in queue
      await processNextInQueue();
    } else {
      chatState.setProcessing(false);
    }
  };

  // Chat message handler - queues messages if already processing
  const handleChatMessage = async (message, confirmedValue = null) => {
    // Always show user message immediately
    if (!confirmedValue) {
      chatState.addUserMessage(message);
    }

    // If already processing, add to queue
    if (chatState.isProcessing()) {
      chatState.addToQueue(message, confirmedValue);
      console.log('Message queued, queue length:', chatState.queueLength + 1);
      return;
    }

    // Start processing
    chatState.setProcessing(true);
    await processMessage(message, confirmedValue);

    // Process any queued messages
    await processNextInQueue();
  };

  // Handle user response for confirmations/clarifications
  const handleUserResponse = async (response, messageIndex) => {
    if (!awaitingResponse) return;

    chatState.markMessageResponded(messageIndex);

    const { type, data } = awaitingResponse;
    setAwaitingResponse(null);

    if (type === 'clarification') {
      // For clarifications, send the response as a new message
      chatState.addUserMessage(response);
      handleChatMessage(response);
    }
    else if (type === 'confirmation') {
      // For confirmations, send back to agent with the confirmed value
      if (response.toLowerCase() === 'yes') {
        chatState.addUserMessage('Yes, proceed.');
        handleChatMessage('proceed with the confirmed action', data.confirmValue);
      } else {
        chatState.addUserMessage('No, cancel.');
        chatState.addAgentMessage('Operation cancelled.', 'text_response');
      }
    }
    else {
      // Default: treat as a new message
      chatState.addUserMessage(response);
      handleChatMessage(response);
    }
  };

  // Header title animation
  const title = useTypewriter(
    viewingPageLevel
      ? currentPageData?.name?.toUpperCase()
      : currentSectionData?.name?.toUpperCase() || '',
    40
  );

  // Loading state
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: colors.bg,
        }}
      >
        <LoadingBars />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        maxWidth: '100vw',
        overflow: 'hidden',
        background: colors.bg,
        fontFamily: "'Manrope', sans-serif",
      }}
      onClick={() => {
        setContextMenu(null);
        setShowHeaderMenu(false);
      }}
    >
      {/* Offline Banner */}
      {!isOnline && (
        <div style={{
          background: '#7a5c1a',
          color: '#000',
          padding: '8px 16px',
          fontSize: 12,
          textAlign: 'center',
          fontWeight: 600,
          zIndex: 1000
        }}>
          You're offline - viewing cached data
          {pendingSyncCount > 0 && ` • ${pendingSyncCount} pending`}
        </div>
      )}

      {/* Mobile Header */}
      {isMobile && (
        <MobileHeader
          currentPage={currentPageData?.name}
          currentSection={currentSectionData?.name}
          onMenuClick={() => setMobileSidebarOpen(true)}
          onMoreClick={() => setShowHeaderMenu(true)}
          agentViewTitle={agentView?.title}
          onCloseAgentView={() => setAgentView(null)}
        />
      )}

      {/* API Error Badge */}
      <ApiErrorBadge error={apiError} onDismiss={() => setApiError(null)} />

      {/* Mobile Sidebar Drawer */}
      {isMobile && (
        <MobileSidebar
          isOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          pages={ownedPages}
          sharedPages={sharedPages}
          currentPage={currentPage}
          currentSection={currentSection}
          user={user}
          onNavigate={(pageId, sectionId, isPageLevel) => {
            setCurrentPage(pageId);
            if (sectionId) {
              setCurrentSection(sectionId);
            }
            setViewingPageLevel(isPageLevel);
            setMobileSidebarOpen(false);
          }}
        />
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Desktop Sidebar - hide on mobile */}
        {!isMobile && (
          <div
            style={{
              width: sidebarOpen ? 240 : 56,
              background: `${colors.surface}ee`,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRight: `1px solid ${colors.border}`,
              transition: 'width 0.2s',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
          {!sidebarOpen ? (
            // Collapsed sidebar
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                padding: '12px 0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 4,
                  marginBottom: 8,
                }}
              >
                <button
                  onClick={() => setSidebarOpen(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: colors.textMuted,
                    cursor: 'pointer',
                    padding: 8,
                  }}
                >
                  <Menu size={16} />
                </button>
              </div>
              <button
                onClick={e => openContextMenu('collapsed-plus', e)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: colors.textMuted,
                  cursor: 'pointer',
                  padding: 8,
                  margin: '0 auto',
                }}
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => setShowShortcuts(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: colors.textMuted,
                  cursor: 'pointer',
                  padding: 8,
                  margin: '4px auto 0',
                }}
              >
                <Keyboard size={16} />
              </button>
              <div style={{ flex: 1 }} />
              <span
                style={{
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  color: colors.textPrimary,
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: -0.5,
                  margin: '0 auto 16px',
                }}
              >
                SLATE
              </span>
              <div
                onClick={e => openContextMenu('collapsed-user', e)}
                style={{ margin: '0 auto', cursor: 'pointer' }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    background: colors.textMuted,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: colors.bg,
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {getUserInitials(user)}
                </div>
              </div>
            </div>
          ) : (
            // Expanded sidebar
            <>
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: `1px solid ${colors.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <button
                  onClick={() => setSidebarOpen(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: colors.textMuted,
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  <Menu size={16} />
                </button>
                <button
                  onClick={() => setShowShortcuts(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: colors.textMuted,
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  <Keyboard size={16} />
                </button>
              </div>

              <div
                style={{ flex: 1, overflow: 'auto', padding: '20px 16px' }}
              >
                {/* Home button */}
                <div
                  onClick={() => {
                    setCurrentPage(null);
                    setCurrentSection(null);
                    setViewingPageLevel(false);
                    setAgentView(null);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 0',
                    marginBottom: 16,
                    cursor: 'pointer',
                    color: !currentPage && !agentView ? colors.textPrimary : colors.textMuted,
                    fontSize: 13,
                    fontWeight: !currentPage && !agentView ? 600 : 400,
                  }}
                >
                  <Home size={14} />
                  <span>Home</span>
                </div>

                {/* MY PAGES section */}
                <div style={{ marginBottom: 32 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12,
                    }}
                  >
                    <p
                      style={{
                        color: colors.textMuted,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: 1.5,
                        margin: 0,
                      }}
                    >
                      MY PAGES
                    </p>
                    <button
                      onClick={() => {
                        const name = prompt('New page name:');
                        if (name) {
                          const np = {
                            id: generateId(),
                            name,
                            starred: false,
                            sections: [],
                          };
                          setPages([...pages, np]);
                          setOwnedPages([...ownedPages, np]);
                          setExpandedPages([...expandedPages, np.id]);
                          setPageRoles({ ...pageRoles, [np.id]: 'owner' });
                        }
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: colors.textMuted,
                        cursor: 'pointer',
                        padding: 2,
                      }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {[...ownedPages].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0)).map(page => (
                    <div key={page.id}>
                      <div
                        onDragOver={e => {
                          if (draggingSection && e.dataTransfer.types.includes('text/plain')) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            e.currentTarget.style.borderBottom = `2px solid ${colors.primary}`;
                          }
                        }}
                        onDragLeave={e => {
                          e.currentTarget.style.borderBottom = '2px solid transparent';
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          e.currentTarget.style.borderBottom = '2px solid transparent';
                          const data = e.dataTransfer.getData('text/plain');
                          const sectionMatch = data.match(/^section:(.+)$/);
                          if (!sectionMatch) return;
                          const sectionId = sectionMatch[1];
                          // Find the source page that contains this section
                          const sourcePage = pages.find(p => p.sections.some(s => s.id === sectionId));
                          if (!sourcePage || sourcePage.id === page.id) return; // same page = no-op
                          const section = sourcePage.sections.find(s => s.id === sectionId);
                          if (!section) return;
                          // Move section in local state
                          setPages(prev => prev.map(p => {
                            if (p.id === sourcePage.id) {
                              return { ...p, sections: p.sections.filter(s => s.id !== sectionId) };
                            }
                            if (p.id === page.id) {
                              return { ...p, sections: [...p.sections, section] };
                            }
                            return p;
                          }));
                          // Update Supabase
                          supabase.from('sections').update({ page_id: page.id }).eq('id', sectionId);
                          // Auto-expand the target page
                          setExpandedPages(prev =>
                            prev.includes(page.id) ? prev : [...prev, page.id]
                          );
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px 0',
                          color: colors.textPrimary,
                          fontSize: 13,
                          fontWeight: 500,
                          borderBottom: '2px solid transparent',
                          transition: 'border-color 0.15s ease',
                        }}
                      >
                        <span
                          onClick={() =>
                            setExpandedPages(
                              expandedPages.includes(page.id)
                                ? expandedPages.filter(id => id !== page.id)
                                : [...expandedPages, page.id]
                            )
                          }
                          style={{ cursor: 'pointer', transition: 'color 0.15s ease' }}
                          onMouseOver={e => { e.currentTarget.style.color = colors.primary; }}
                          onMouseOut={e => { e.currentTarget.style.color = ''; }}
                        >
                          {expandedPages.includes(page.id) ? (
                            <ChevronDown size={12} />
                          ) : (
                            <ChevronRight size={12} />
                          )}
                        </span>
                        {editingItem === page.id ? (
                          <input
                            autoFocus
                            value={page.name}
                            onChange={e =>
                              setPages(
                                pages.map(p =>
                                  p.id === page.id
                                    ? { ...p, name: e.target.value }
                                    : p
                                )
                              )
                            }
                            onBlur={() => {
                              const updatedName = pages.find(p => p.id === page.id)?.name;
                              if (updatedName?.trim()) {
                                supabase.from('pages').update({ name: updatedName.trim() }).eq('id', page.id);
                              }
                              setEditingItem(null);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') e.target.blur();
                            }}
                            style={{
                              marginLeft: 8,
                              flex: 1,
                              background: 'transparent',
                              border: 'none',
                              color: colors.textPrimary,
                              fontSize: 13,
                              outline: 'none',
                            }}
                          />
                        ) : (
                          <span
                            style={{ marginLeft: 8, flex: 1, cursor: 'pointer', transition: 'color 0.15s ease' }}
                            onClick={() => {
                              setCurrentPage(page.id);
                              setViewingPageLevel(true);
                              setAgentView(null);
                            }}
                            onMouseOver={e => { e.currentTarget.style.color = colors.primary; }}
                            onMouseOut={e => { e.currentTarget.style.color = ''; }}
                          >
                            <TypewriterText
                              text={page.name}
                              animate={animatingItems.has(page.id)}
                              onComplete={() => setAnimatingItems(prev => {
                                const next = new Set(prev);
                                next.delete(page.id);
                                return next;
                              })}
                            />
                          </span>
                        )}
                        {page.starred && (
                          <Star
                            size={10}
                            fill={colors.primary}
                            color={colors.primary}
                            style={{ marginRight: 4 }}
                          />
                        )}
                        <CollaboratorBadge count={collabCounts[page.id]} type="owned" />
                        <button
                          onClick={e => openContextMenu(`page-${page.id}`, e)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: colors.textMuted,
                            cursor: 'pointer',
                            padding: 2,
                            opacity: 0.5,
                          }}
                        >
                          <MoreHorizontal size={12} />
                        </button>
                      </div>

                      {expandedPages.includes(page.id) &&
                        [...page.sections].sort((a, b) => {
                          // Closed sections go to the bottom
                          if (a.closed_at && !b.closed_at) return 1;
                          if (!a.closed_at && b.closed_at) return -1;
                          return (a.position ?? 0) - (b.position ?? 0);
                        }).map(section => (
                          <div
                            key={section.id}
                            data-section-item="true"
                            draggable
                            onDragStart={e => {
                              e.dataTransfer.setData('text/plain', `section:${section.id}`);
                              e.dataTransfer.effectAllowed = 'move';
                              e.currentTarget.style.opacity = '0.4';
                              draggingSection = true;
                              draggingSectionId = section.id;
                            }}
                            onDragEnd={e => {
                              e.currentTarget.style.opacity = '1';
                              draggingSection = false;
                              draggingSectionId = null;
                              // Clear any drop indicators left on sibling items
                              const parent = e.currentTarget.parentElement;
                              if (parent) {
                                parent.querySelectorAll('[data-section-item]').forEach(el => {
                                  el.style.borderTop = '';
                                  el.style.borderBottom = '';
                                });
                              }
                            }}
                            onClick={() => {
                              setCurrentPage(page.id);
                              setCurrentSection(section.id);
                              setViewingPageLevel(false);
                              setAgentView(null);
                            }}
                            onDragOver={e => {
                              if (!e.dataTransfer.types.includes('text/plain')) return;
                              e.preventDefault();
                              if (draggingSection && draggingSectionId !== section.id && page.sections.some(s => s.id === draggingSectionId)) {
                                // Section-to-section reorder within same page: show top/bottom drop line
                                e.dataTransfer.dropEffect = 'move';
                                const rect = e.currentTarget.getBoundingClientRect();
                                const midY = rect.top + rect.height / 2;
                                if (e.clientY < midY) {
                                  e.currentTarget.style.borderTop = `2px solid ${colors.primary}`;
                                  e.currentTarget.style.borderBottom = '';
                                } else {
                                  e.currentTarget.style.borderTop = '';
                                  e.currentTarget.style.borderBottom = `2px solid ${colors.primary}`;
                                }
                              } else if (!draggingSection) {
                                // Note drop: show left highlight
                                e.currentTarget.style.borderLeft = `1px solid ${colors.primary}`;
                                e.currentTarget.style.color = colors.primary;
                              }
                            }}
                            onDragLeave={e => {
                              e.currentTarget.style.borderTop = '';
                              e.currentTarget.style.borderBottom = '';
                              e.currentTarget.style.borderLeft = currentSection === section.id
                                ? `1px solid ${colors.textPrimary}` : '1px solid transparent';
                              e.currentTarget.style.color = currentSection === section.id
                                ? colors.textPrimary : colors.textMuted;
                            }}
                            onDrop={e => {
                              e.preventDefault();
                              // Clear all drop indicators
                              e.currentTarget.style.borderTop = '';
                              e.currentTarget.style.borderBottom = '';
                              e.currentTarget.style.borderLeft = currentSection === section.id
                                ? `1px solid ${colors.textPrimary}` : '1px solid transparent';
                              e.currentTarget.style.color = currentSection === section.id
                                ? colors.textPrimary : colors.textMuted;

                              const data = e.dataTransfer.getData('text/plain');

                              // Section-to-section reorder within same page
                              const sectionMatch = data.match(/^section:(.+)$/);
                              if (sectionMatch) {
                                const draggedId = sectionMatch[1];
                                if (draggedId === section.id) return;
                                if (!page.sections.some(s => s.id === draggedId)) return; // cross-page move handled by page header
                                const rect = e.currentTarget.getBoundingClientRect();
                                const insertAfter = e.clientY >= rect.top + rect.height / 2;
                                const reordered = page.sections.filter(s => s.id !== draggedId);
                                const targetIdx = reordered.findIndex(s => s.id === section.id);
                                const insertIdx = insertAfter ? targetIdx + 1 : targetIdx;
                                const draggedSection = page.sections.find(s => s.id === draggedId);
                                reordered.splice(insertIdx, 0, draggedSection);
                                const withPositions = reordered.map((s, i) => ({ ...s, position: i }));
                                const updateSections = pg =>
                                  pg.map(p => p.id === page.id ? { ...p, sections: withPositions } : p);
                                setPages(updateSections);
                                setOwnedPages(updateSections);
                                withPositions.forEach(s => {
                                  supabase.from('sections').update({ position: s.position }).eq('id', s.id);
                                });
                                return;
                              }

                              const noteMatch = data.match(/^note:(.+)$/);
                              if (noteMatch) {
                                const noteId = noteMatch[1];
                                if (e.ctrlKey || e.metaKey) {
                                  // Ctrl/Cmd+drop: share note to this section (same note, reference)
                                  setNotes(prev => prev.map(n =>
                                    n.id === noteId
                                      ? { ...n, sharedSectionIds: [...(n.sharedSectionIds || []), section.id] }
                                      : n
                                  ));
                                  supabase.from('note_sections').insert({
                                    note_id: noteId,
                                    section_id: section.id,
                                  }).then(({ error }) => { if (error) console.error('Note share failed:', error); });
                                } else if (e.altKey) {
                                  // Alt+drop: duplicate note to this section (new copy)
                                  const note = notes.find(n => n.id === noteId);
                                  if (note) {
                                    const newId = generateId();
                                    const newNote = {
                                      id: newId,
                                      sectionId: section.id,
                                      content: note.content,
                                      tags: note.tags || [],
                                      completed: false,
                                      date: note.date || null,
                                      created_by_user_id: user?.id || null,
                                    };
                                    setNotes(prev => [...prev, newNote]);
                                    pushUndo({ type: 'copy_note', noteId: newId, note: newNote });
                                    supabase.from('notes').insert({
                                      id: newId,
                                      section_id: section.id,
                                      content: note.content,
                                      tags: note.tags || [],
                                      completed: false,
                                      date: note.date || null,
                                      created_by_user_id: user?.id || null,
                                    });
                                  }
                                } else {
                                  // Plain drop: move note to this section
                                  const movedNote = notes.find(n => n.id === noteId);
                                  if (movedNote) pushUndo({ type: 'move_note', noteId, previousSectionId: movedNote.sectionId, newSectionId: section.id });
                                  setNotes(notes.map(n => n.id === noteId ? { ...n, sectionId: section.id } : n));
                                  supabase.from('notes').update({ section_id: section.id }).eq('id', noteId);
                                }
                              }
                            }}
                            onMouseEnter={e => {
                              if (currentSection !== section.id) {
                                e.currentTarget.style.color = colors.primary;
                              }
                            }}
                            onMouseLeave={e => {
                              if (currentSection !== section.id) {
                                e.currentTarget.style.color = colors.textMuted;
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '8px 0 8px 20px',
                              cursor: 'grab',
                              color:
                                currentSection === section.id
                                  ? colors.textPrimary
                                  : colors.textMuted,
                              fontSize: 13,
                              borderLeft:
                                currentSection === section.id
                                  ? `1px solid ${colors.textPrimary}`
                                  : '1px solid transparent',
                              transition: 'border-color 0.15s ease, color 0.15s ease',
                              opacity: section.closed_at ? 0.4 : 1,
                              textDecoration: section.closed_at ? 'line-through' : 'none',
                            }}
                          >
                            {editingItem === section.id ? (
                              <input
                                autoFocus
                                value={section.name}
                                onClick={e => e.stopPropagation()}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPages(
                                    pages.map(p =>
                                      p.id === page.id
                                        ? {
                                            ...p,
                                            sections: p.sections.map(s =>
                                              s.id === section.id
                                                ? { ...s, name: val }
                                                : s
                                            ),
                                          }
                                        : p
                                    )
                                  );
                                }}
                                onBlur={e => {
                                  const newName = e.target.value.trim();
                                  if (newName) {
                                    supabase.from('sections').update({ name: newName }).eq('id', section.id);
                                  }
                                  setEditingItem(null);
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') e.target.blur();
                                  if (e.key === 'Escape') setEditingItem(null);
                                }}
                                style={{
                                  flex: 1,
                                  background: 'transparent',
                                  border: 'none',
                                  color: colors.textPrimary,
                                  fontSize: 13,
                                  outline: 'none',
                                  fontFamily: 'inherit',
                                }}
                              />
                            ) : (
                              <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <TypewriterText
                                  text={section.name}
                                  animate={animatingItems.has(section.id)}
                                  onComplete={() => setAnimatingItems(prev => {
                                    const next = new Set(prev);
                                    next.delete(section.id);
                                    return next;
                                  })}
                                />
                                <span style={{
                                  fontSize: 10,
                                  color: colors.textMuted,
                                  opacity: 0.6,
                                }}>
                                  {notes.filter(n => (n.sectionId === section.id || n.sharedSectionIds?.includes(section.id)) && !n.completed).length || ''}
                                </span>
                              </span>
                            )}
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                openContextMenu(`section-${section.id}`, e);
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: colors.textMuted,
                                cursor: 'pointer',
                                padding: 2,
                                opacity: 0.3,
                              }}
                            >
                              <MoreHorizontal size={12} />
                            </button>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>

                {/* SHARED WITH ME section */}
                {sharedPages.length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    <p
                      style={{
                        color: colors.textMuted,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: 1.5,
                        marginBottom: 12,
                      }}
                    >
                      SHARED WITH ME
                    </p>

                    {sharedPages.map(page => (
                      <div key={page.id}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px 0',
                            color: colors.textPrimary,
                            fontSize: 13,
                            fontWeight: 500,
                          }}
                        >
                          <span
                            onClick={() =>
                              setExpandedPages(
                                expandedPages.includes(page.id)
                                  ? expandedPages.filter(id => id !== page.id)
                                  : [...expandedPages, page.id]
                              )
                            }
                            style={{ cursor: 'pointer', transition: 'color 0.15s ease' }}
                            onMouseOver={e => { e.currentTarget.style.color = colors.primary; }}
                            onMouseOut={e => { e.currentTarget.style.color = ''; }}
                          >
                            {expandedPages.includes(page.id) ? (
                              <ChevronDown size={12} />
                            ) : (
                              <ChevronRight size={12} />
                            )}
                          </span>
                          <span
                            style={{ marginLeft: 8, flex: 1, cursor: 'pointer', transition: 'color 0.15s ease' }}
                            onClick={() => {
                              setCurrentPage(page.id);
                              setViewingPageLevel(true);
                              setAgentView(null);
                            }}
                            onMouseOver={e => { e.currentTarget.style.color = colors.primary; }}
                            onMouseOut={e => { e.currentTarget.style.color = ''; }}
                          >
                            {page.name}
                          </span>
                          {page.permissionStatus === 'pending' && (
                            <span style={{
                              background: colors.primary,
                              color: colors.bg,
                              fontSize: 9,
                              fontWeight: 600,
                              padding: '2px 6px',
                              marginRight: 4,
                              letterSpacing: 0.5,
                            }}>NEW</span>
                          )}
                          {page.starred && (
                            <Star
                              size={10}
                              fill={colors.primary}
                              color={colors.primary}
                              style={{ marginRight: 4 }}
                            />
                          )}
                          <CollaboratorBadge count={collabCounts[page.id]} type="shared" />
                          <button
                            onClick={e => openContextMenu(`page-${page.id}`, e)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: colors.textMuted,
                              cursor: 'pointer',
                              padding: 2,
                              opacity: 0.5,
                            }}
                          >
                            <MoreHorizontal size={12} />
                          </button>
                        </div>

                        {expandedPages.includes(page.id) &&
                          page.sections.map(section => (
                            <div
                              key={section.id}
                              onClick={() => {
                                setCurrentPage(page.id);
                                setCurrentSection(section.id);
                                setViewingPageLevel(false);
                              }}
                              onMouseEnter={e => {
                                if (currentSection !== section.id) {
                                  e.currentTarget.style.color = colors.primary;
                                }
                              }}
                              onMouseLeave={e => {
                                if (currentSection !== section.id) {
                                  e.currentTarget.style.color = colors.textMuted;
                                }
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '8px 0 8px 20px',
                                cursor: 'pointer',
                                color:
                                  currentSection === section.id
                                    ? colors.textPrimary
                                    : colors.textMuted,
                                fontSize: 13,
                                borderLeft:
                                  currentSection === section.id
                                    ? `1px solid ${colors.textPrimary}`
                                    : '1px solid transparent',
                                transition: 'border-color 0.15s ease, color 0.15s ease',
                              }}
                            >
                              <span style={{ flex: 1 }}>{section.name}</span>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  openContextMenu(`section-${section.id}`, e);
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: colors.textMuted,
                                  cursor: 'pointer',
                                  padding: 2,
                                  opacity: 0.3,
                                }}
                              >
                                <MoreHorizontal size={12} />
                              </button>
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* Tags section */}
                <div style={{ marginBottom: 32 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <p
                      style={{
                        color: colors.textMuted,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: 1.5,
                        margin: 0,
                      }}
                    >
                      TAGS
                    </p>
                    {(currentPage || currentSection) && (() => {
                      const scopes = ['all', 'page', 'section'].filter(s => s !== 'section' || (currentSection && !viewingPageLevel));
                      const activeIndex = scopes.indexOf(tagScope);
                      return (
                      <div style={{ display: 'flex', gap: 0, position: 'relative', borderBottom: `1px solid ${colors.border}` }}>
                        {scopes.map((scope, i) => (
                          <button
                            key={scope}
                            onClick={() => setTagScope(scope)}
                            style={{
                              padding: '2px 8px 6px',
                              background: 'transparent',
                              border: 'none',
                              color: tagScope === scope ? colors.textPrimary : colors.textMuted,
                              fontSize: 9,
                              fontWeight: 600,
                              letterSpacing: 0.5,
                              cursor: 'pointer',
                              transition: 'color 0.15s ease',
                            }}
                          >
                            {scope === 'all' ? 'ALL' : scope === 'page' ? 'PAGE' : 'SECTION'}
                          </button>
                        ))}
                        <div style={{
                          position: 'absolute',
                          bottom: -1,
                          left: `${(activeIndex >= 0 ? activeIndex : 0) * (100 / scopes.length)}%`,
                          width: `${100 / scopes.length}%`,
                          height: 2,
                          background: colors.primary,
                          transition: 'left 0.2s ease',
                        }} />
                      </div>
                      );
                    })()}
                  </div>
                  {(() => {
                    const scopedNotes = tagScope === 'section' && currentSection && !viewingPageLevel
                      ? notes.filter(n => n.sectionId === currentSection)
                      : tagScope === 'page' && currentPage
                        ? notes.filter(n => currentPageData?.sections?.some(s => s.id === n.sectionId))
                        : notes;
                    const scopedTags = tagScope === 'all' ? tags : [...new Set(scopedNotes.flatMap(n => n.tags || []).filter(Boolean))];
                    return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {filterTag.length > 0 && !tagManageMode && (
                      <button
                        onClick={() => setFilterTag([])}
                        style={{
                          padding: '2px 6px',
                          background: 'transparent',
                          border: `1px solid ${colors.border}`,
                          color: colors.textMuted,
                          fontSize: 9,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          transition: 'color 0.15s ease',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = colors.primary}
                        onMouseLeave={e => e.currentTarget.style.color = colors.textMuted}
                      >
                        <X size={8} /> CLEAR
                      </button>
                    )}
                    {(tagsExpanded ? scopedTags : scopedTags.slice(0, 4)).map(tag => (
                      <TagPill
                        key={tag}
                        tag={tag}
                        selected={
                          tagManageMode
                            ? selectedTagsForManage.includes(tag)
                            : filterTag.includes(tag)
                        }
                        onClick={() =>
                          tagManageMode
                            ? setSelectedTagsForManage(
                                selectedTagsForManage.includes(tag)
                                  ? selectedTagsForManage.filter(t => t !== tag)
                                  : [...selectedTagsForManage, tag]
                              )
                            : setFilterTag(
                                filterTag.includes(tag)
                                  ? filterTag.filter(t => t !== tag)
                                  : [...filterTag, tag]
                              )
                        }
                      />
                    ))}
                    {!tagsExpanded && scopedTags.length > 4 && (
                      <button
                        onClick={() => setTagsExpanded(true)}
                        style={{
                          padding: '3px 8px',
                          background: 'transparent',
                          border: `1px solid ${colors.border}`,
                          color: colors.primary,
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        MORE...
                      </button>
                    )}
                    {addingTag ? (
                      <input
                        autoFocus
                        value={newTagName}
                        onChange={e => setNewTagName(e.target.value)}
                        onBlur={() => {
                          if (newTagName.trim())
                            setTags([...tags, newTagName.trim().toLowerCase()]);
                          setNewTagName('');
                          setAddingTag(false);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (newTagName.trim())
                              setTags([
                                ...tags,
                                newTagName.trim().toLowerCase(),
                              ]);
                            setNewTagName('');
                            setAddingTag(false);
                          }
                        }}
                        style={{
                          padding: '3px 8px',
                          background: 'transparent',
                          border: `1px solid ${colors.border}`,
                          color: colors.textPrimary,
                          fontSize: 11,
                          width: 60,
                          outline: 'none',
                        }}
                      />
                    ) : (
                      !tagManageMode && (
                        <button
                          onClick={() => setAddingTag(true)}
                          style={{
                            padding: '3px 8px',
                            background: 'transparent',
                            border: `1px solid ${colors.border}`,
                            color: colors.textMuted,
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          <Plus size={10} />
                        </button>
                      )
                    )}
                  </div>
                    );
                  })()}

                  {/* Tag management UI */}
                  {!tagManageMode ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        onClick={() => setTagManageMode('merge')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: colors.textMuted,
                          fontSize: 11,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        Merge
                      </button>
                      <button
                        onClick={() => setTagManageMode('delete')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: colors.textMuted,
                          fontSize: 11,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        Delete
                      </button>
                      {filterTag.length > 0 && (
                        <button
                          onClick={() => setFilterTag([])}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: colors.primary,
                            fontSize: 11,
                            cursor: 'pointer',
                            padding: 0,
                            marginLeft: 'auto',
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  ) : tagManageMode === 'delete' ? (
                    <div style={{ marginTop: 10 }}>
                      <p
                        style={{
                          color: colors.textMuted,
                          fontSize: 11,
                          marginBottom: 8,
                        }}
                      >
                        Select tags to delete:
                      </p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={handleDeleteTags}
                          disabled={!selectedTagsForManage.length}
                          style={{
                            padding: '4px 10px',
                            background: selectedTagsForManage.length
                              ? '#b83c2a'
                              : 'transparent',
                            border: `1px solid ${selectedTagsForManage.length ? '#b83c2a' : colors.border}`,
                            color: selectedTagsForManage.length
                              ? '#fff'
                              : colors.textMuted,
                            fontSize: 11,
                            cursor: selectedTagsForManage.length
                              ? 'pointer'
                              : 'not-allowed',
                          }}
                        >
                          Delete ({selectedTagsForManage.length})
                        </button>
                        <button
                          onClick={() => {
                            setTagManageMode(null);
                            setSelectedTagsForManage([]);
                          }}
                          style={{
                            padding: '4px 10px',
                            background: 'transparent',
                            border: `1px solid ${colors.border}`,
                            color: colors.textMuted,
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      <p
                        style={{
                          color: colors.textMuted,
                          fontSize: 11,
                          marginBottom: 8,
                        }}
                      >
                        Select tags to merge (2+):
                      </p>
                      {selectedTagsForManage.length >= 2 && (
                        <input
                          value={mergeTargetName}
                          onChange={e => setMergeTargetName(e.target.value)}
                          placeholder={`New name (default: ${selectedTagsForManage[0]})`}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            background: 'transparent',
                            border: `1px solid ${colors.border}`,
                            color: colors.textPrimary,
                            fontSize: 11,
                            marginBottom: 8,
                            outline: 'none',
                          }}
                        />
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={handleMergeTags}
                          disabled={selectedTagsForManage.length < 2}
                          style={{
                            padding: '4px 10px',
                            background:
                              selectedTagsForManage.length >= 2
                                ? colors.primary
                                : 'transparent',
                            border: `1px solid ${selectedTagsForManage.length >= 2 ? colors.primary : colors.border}`,
                            color:
                              selectedTagsForManage.length >= 2
                                ? colors.bg
                                : colors.textMuted,
                            fontSize: 11,
                            cursor:
                              selectedTagsForManage.length >= 2
                                ? 'pointer'
                                : 'not-allowed',
                          }}
                        >
                          Merge ({selectedTagsForManage.length})
                        </button>
                        <button
                          onClick={() => {
                            setTagManageMode(null);
                            setSelectedTagsForManage([]);
                            setMergeTargetName('');
                          }}
                          style={{
                            padding: '4px 10px',
                            background: 'transparent',
                            border: `1px solid ${colors.border}`,
                            color: colors.textMuted,
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Recent section */}
                <div style={{ marginBottom: 32 }}>
                  <p
                    style={{
                      color: colors.textMuted,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 1.5,
                      marginBottom: 12,
                    }}
                  >
                    RECENT
                  </p>
                  {[...notes]
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .slice(0, 4)
                    .map(note => (
                      <p
                        key={note.id}
                        onClick={() => {
                          const s = allSections.find(
                            x => x.id === note.sectionId
                          );
                          if (s) {
                            setCurrentPage(s.pageId);
                            setCurrentSection(s.id);
                            setViewingPageLevel(false);
                          }
                        }}
                        style={{
                          color: colors.textMuted,
                          fontSize: 12,
                          fontFamily: "'Manrope', sans-serif",
                          margin: '6px 0',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}
                      >
                        {note.content}
                      </p>
                    ))}
                </div>

                {/* Starred section */}
                <div>
                  <p
                    style={{
                      color: colors.textMuted,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 1.5,
                      marginBottom: 12,
                    }}
                  >
                    STARRED
                  </p>
                  {pages
                    .filter(p => p.starred)
                    .map(p => (
                      <p
                        key={p.id}
                        onClick={() => {
                          setCurrentPage(p.id);
                          setViewingPageLevel(true);
                        }}
                        style={{
                          color: colors.textMuted,
                          fontSize: 12,
                          fontFamily: "'Manrope', sans-serif",
                          margin: '6px 0',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                        }}
                      >
                        <Star
                          size={10}
                          fill={colors.primary}
                          color={colors.primary}
                        />
                        {p.name}
                      </p>
                    ))}
                  {/* Starred sections */}
                  {pages.flatMap(p =>
                    (p.sections || [])
                      .filter(s => s.starred)
                      .map(s => (
                        <p
                          key={s.id}
                          onClick={() => {
                            setCurrentPage(p.id);
                            setCurrentSection(s.id);
                            setViewingPageLevel(false);
                          }}
                          style={{
                            color: colors.textMuted,
                            fontSize: 12,
                            fontFamily: "'Manrope', sans-serif",
                            margin: '6px 0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            cursor: 'pointer',
                            paddingLeft: 4,
                          }}
                        >
                          <Star
                            size={10}
                            fill={colors.primary}
                            color={colors.primary}
                          />
                          <span style={{ opacity: 0.5 }}>{p.name} /</span> {s.name}
                        </p>
                      ))
                  )}
                </div>
              </div>

              {/* Sidebar footer */}
              <div
                style={{ borderTop: `1px solid ${colors.border}`, padding: 16 }}
              >
                <p
                  style={{
                    color: colors.textPrimary,
                    fontSize: 24,
                    fontWeight: 600,
                    letterSpacing: -1,
                    marginBottom: 16,
                  }}
                >
                  SLATE
                </p>
                <div
                  onClick={e => openContextMenu('user-menu', e)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      background: colors.textMuted,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: colors.bg,
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    {getUserInitials(user)}
                  </div>
                  <span
                    style={{
                      color: colors.textMuted,
                      fontSize: 12,
                      fontFamily: "'Manrope', sans-serif",
                      flex: 1,
                    }}
                  >
                    {getUserDisplayName(user)}
                  </span>
                  <ChevronDown size={12} color={colors.textMuted} />
                </div>
              </div>
            </>
          )}
          </div>
        )}

        {/* Main content */}
        <div
          onTouchStart={handleContentTouchStart}
          onTouchEnd={handleContentTouchEnd}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Toolbar - hide on mobile and home view, MobileHeader handles navigation */}
          {!isMobile && (currentPage || agentView) && (
          <div
            style={{
              height: 48,
              display: 'flex',
              alignItems: 'center',
              padding: '0 20px',
              gap: 16,
            }}
          >
            <button
              onClick={() => setSearchOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                background: 'transparent',
                border: `1px solid ${colors.border}`,
                color: colors.textMuted,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <Search size={12} />
              <span>Search</span>
              <span style={{ opacity: 0.5, fontSize: 10 }}>⌘K</span>
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setFilterIncomplete(!filterIncomplete)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'transparent',
                border: `1px solid ${filterIncomplete ? colors.textMuted : colors.border}`,
                color: filterIncomplete ? colors.textPrimary : colors.textMuted,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              <Filter size={12} />
              {filterIncomplete ? 'INCOMPLETE' : 'FILTER'}
            </button>
            <button
              onClick={e => openContextMenu('sort', e)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'transparent',
                border: `1px solid ${colors.border}`,
                color: colors.textMuted,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              <ArrowUpDown size={12} />
              {sortBy === 'custom' ? 'CUSTOM SORT' : 'SORT'}
            </button>
            <button
              onClick={() => setCompactMode(!compactMode)}
              title={compactMode ? 'Show details' : 'Hide details (for easy copy)'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'transparent',
                border: `1px solid ${compactMode ? colors.textMuted : colors.border}`,
                color: compactMode ? colors.textPrimary : colors.textMuted,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              <AlignJustify size={12} />
              {compactMode ? 'COMPACT' : 'COMPACT'}
            </button>
            <button
              onClick={() => {
                const visibleNotes = agentView ? agentFilteredNotes : filteredNotes;
                const text = visibleNotes.map(n => n.content).join('\n');
                navigator.clipboard.writeText(text);
                setCopiedNotes(true);
                setTimeout(() => setCopiedNotes(false), 1500);
              }}
              title="Copy all visible notes"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'transparent',
                border: `1px solid ${copiedNotes ? '#2d6b3a' : colors.border}`,
                color: copiedNotes ? '#2d6b3a' : colors.textMuted,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.15s',
              }}
            >
              {copiedNotes ? <Check size={12} /> : <Copy size={12} />}
              {copiedNotes ? 'COPIED' : 'COPY ALL'}
            </button>
            <button
              onClick={handleCompleteAll}
              title="Mark all visible notes as complete"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'transparent',
                border: `1px solid ${colors.border}`,
                color: colors.textMuted,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              <Check size={12} />
              COMPLETE ALL
            </button>
            <div style={{ display: 'flex', border: `1px solid ${colors.border}` }}>
              {[
                { m: 'list', I: List },
                { m: 'boxes', I: LayoutGrid },
                { m: 'calendar', I: Calendar },
                { m: 'table', I: Table2 },
                { m: 'graph', I: Network },
              ].map(({ m, I }) => {
                const currentMode = agentView ? agentView.viewType : viewMode;
                return (
                  <button
                    key={m}
                    onClick={() => {
                      if (agentView) {
                        setAgentView({ ...agentView, viewType: m });
                      } else {
                        setViewMode(m);
                      }
                    }}
                    style={{
                      padding: '6px 10px',
                      background: currentMode === m ? colors.textPrimary : 'transparent',
                      border: 'none',
                      color: currentMode === m ? colors.bg : colors.textMuted,
                      cursor: 'pointer',
                    }}
                  >
                    <I size={12} />
                  </button>
                );
              })}
            </div>
            {/* Zoom controls */}
            {zoomScale !== 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                <button
                  onClick={() => setZoomScale(s => Math.max(0.5, s - 0.1))}
                  style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer', padding: 4 }}
                >
                  <ZoomOut size={12} />
                </button>
                <span style={{ color: colors.textMuted, fontSize: 11, minWidth: 36, textAlign: 'center' }}>
                  {Math.round(zoomScale * 100)}%
                </span>
                <button
                  onClick={() => setZoomScale(s => Math.min(2.0, s + 0.1))}
                  style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer', padding: 4 }}
                >
                  <ZoomIn size={12} />
                </button>
                <button
                  onClick={resetZoom}
                  title="Reset zoom"
                  style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer', padding: 4 }}
                >
                  <RotateCcw size={10} />
                </button>
              </div>
            )}
          </div>
          )}

          {/* Header - hide on mobile since MobileHeader shows the title */}
          {!isMobile && (
          <div style={{ padding: '32px 40px 16px' }}>
            {!currentPage && !agentView ? (
              /* Home View Header */
              <h1 style={{
                color: colors.textPrimary,
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: -1,
                margin: 0,
              }}>
                HOME
              </h1>
            ) : agentView ? (
              /* Agent View Header */
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: 1,
                    }}
                  >
                    AGENT
                  </span>
                  <span style={{ color: colors.textMuted }}>/</span>
                  <h1
                    style={{
                      color: colors.textPrimary,
                      fontSize: 24,
                      fontWeight: 600,
                      letterSpacing: -1,
                      margin: 0,
                    }}
                  >
                    {agentView.title}
                  </h1>
                  <button
                    onClick={() => setAgentView(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 20,
                      height: 20,
                      background: 'transparent',
                      border: `1px solid ${colors.border}`,
                      borderRadius: 2,
                      color: colors.textMuted,
                      cursor: 'pointer',
                      marginLeft: 8,
                    }}
                    title="Close view"
                  >
                    <X size={12} />
                  </button>
                </div>
                <p style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  marginTop: 4,
                  marginBottom: 0
                }}>
                  {agentFilteredNotes.length} notes
                  {agentView.filter?.tags?.length > 0 && ` • Tags: ${agentView.filter.tags.join(', ')}`}
                  {agentView.filter?.search && ` • Search: "${agentView.filter.search}"`}
                  {agentView.filter?.page_name && ` • Page: ${agentView.filter.page_name}`}
                  {agentView.groupBy && ` • Grouped by: ${agentView.groupBy}`}
                </p>
              </div>
            ) : (
              /* Normal Page/Section Header */
              <>
                {/* Pending share accept/decline banner */}
                {sharedPages.find(p => p.id === currentPage)?.permissionStatus === 'pending' && (() => {
                  const pendingPage = sharedPages.find(p => p.id === currentPage);
                  return (
                    <div style={{
                      background: colors.surface || '#0a0a0a',
                      borderBottom: `1px solid ${colors.border}`,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 16,
                    }}>
                      <div>
                        <div style={{ fontSize: 13, color: colors.textSecondary || '#ccc' }}>
                          {pendingPage?.ownerEmail} shared this page
                        </div>
                        <span style={{
                          border: `1px solid ${colors.primary}`,
                          padding: '2px 8px',
                          fontSize: 10,
                          fontWeight: 600,
                          color: colors.primary,
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                          marginTop: 4,
                          display: 'inline-block',
                        }}>
                          {(pageRoles[currentPage] || '').replace('-', ' ').toUpperCase()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={async () => {
                          try {
                            await acceptPageShare(currentPage, user.id);
                            await refreshData();
                          } catch (e) {
                            alert(e.message);
                          }
                        }} style={{
                          background: colors.primary,
                          color: colors.bg,
                          border: 'none',
                          padding: '8px 16px',
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}>Accept</button>
                        <button onClick={async () => {
                          try {
                            await declinePageShare(currentPage, user.id);
                            window.location.reload();
                          } catch (e) {
                            alert(e.message);
                          }
                        }} style={{
                          background: 'transparent',
                          border: `1px solid ${colors.border}`,
                          color: colors.textMuted,
                          padding: '8px 16px',
                          fontSize: 13,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}>Decline</button>
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {viewingPageLevel && editingHeaderItem === currentPage ? (
                    <input
                      autoFocus
                      defaultValue={currentPageData?.name || ''}
                      onClick={e => e.stopPropagation()}
                      onBlur={e => {
                        const newName = e.target.value.trim();
                        if (newName) {
                          const updateName = pg => pg.map(p => p.id === currentPage ? { ...p, name: newName } : p);
                          setPages(updateName);
                          setOwnedPages(updateName);
                          setSharedPages(updateName);
                          supabase.from('pages').update({ name: newName }).eq('id', currentPage);
                        }
                        setEditingHeaderItem(null);
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingHeaderItem(null); }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderBottom: `2px solid ${colors.primary}`,
                        color: colors.textPrimary,
                        fontSize: 24,
                        fontWeight: 600,
                        letterSpacing: -1,
                        outline: 'none',
                        padding: 0,
                        margin: 0,
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => setViewingPageLevel(true)}
                      style={{
                        color: viewingPageLevel ? colors.textPrimary : colors.textMuted,
                        fontSize: viewingPageLevel ? 24 : 11,
                        fontWeight: viewingPageLevel ? 600 : 500,
                        letterSpacing: viewingPageLevel ? -1 : 1,
                        cursor: 'pointer',
                        transition: 'color 0.15s ease',
                      }}
                      onMouseOver={e => { if (!viewingPageLevel) e.currentTarget.style.color = colors.primary; }}
                      onMouseOut={e => { if (!viewingPageLevel) e.currentTarget.style.color = colors.textMuted; }}
                    >
                      {currentPageData?.name?.toUpperCase()}
                    </span>
                  )}
                  {!viewingPageLevel && (
                    <>
                      <span style={{ color: colors.textMuted }}>/</span>
                      {editingHeaderItem === currentSection ? (
                        <input
                          autoFocus
                          defaultValue={currentPageData?.sections?.find(s => s.id === currentSection)?.name || ''}
                          onClick={e => e.stopPropagation()}
                          onBlur={e => {
                            const newName = e.target.value.trim();
                            if (newName) {
                              const updateSections = pg => pg.map(p =>
                                p.id === currentPage
                                  ? { ...p, sections: p.sections.map(s => s.id === currentSection ? { ...s, name: newName } : s) }
                                  : p
                              );
                              setPages(updateSections);
                              setOwnedPages(updateSections);
                              setSharedPages(updateSections);
                              supabase.from('sections').update({ name: newName }).eq('id', currentSection);
                            }
                            setEditingHeaderItem(null);
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingHeaderItem(null); }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: `2px solid ${colors.primary}`,
                            color: colors.textPrimary,
                            fontSize: 24,
                            fontWeight: 600,
                            letterSpacing: -1,
                            outline: 'none',
                            padding: 0,
                            margin: 0,
                          }}
                        />
                      ) : (
                        <h1
                          style={{
                            color: colors.textPrimary,
                            fontSize: 24,
                            fontWeight: 600,
                            letterSpacing: -1,
                            margin: 0,
                          }}
                        >
                          {title.displayed}
                          {!title.done && (
                            <span style={{ color: colors.primary }}>_</span>
                          )}
                        </h1>
                      )}
                    </>
                  )}
                  <ChevronDown
                    size={14}
                    color={colors.textMuted}
                    style={{ cursor: 'pointer' }}
                    onClick={e => {
                      e.stopPropagation();
                      if (!showHeaderMenu) {
                        setHeaderMenuPosition({
                          top: e.currentTarget.getBoundingClientRect().bottom + 4,
                          left: e.currentTarget.getBoundingClientRect().left,
                        });
                      }
                      setShowHeaderMenu(!showHeaderMenu);
                    }}
                  />
                  {currentSection && !viewingPageLevel && currentSectionData?.section_type === 'richtext' && (
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      color: colors.textMuted,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 1,
                      marginLeft: 8,
                      padding: '2px 6px',
                      border: `1px solid ${colors.border}`,
                      textTransform: 'uppercase',
                    }}>
                      <FileText size={10} /> Doc
                    </span>
                  )}
                  {currentSection && !viewingPageLevel && currentSectionData?.section_type !== 'richtext' && (
                    <span style={{
                      color: colors.textMuted,
                      fontSize: 12,
                      fontWeight: 400,
                      marginLeft: 4,
                    }}>
                      {filteredNotes.filter(n => !n.completed).length}
                    </span>
                  )}
                  {currentSection && !viewingPageLevel && currentSectionData?.section_type !== 'richtext' && filteredNotes.some(n => !n.completed) && (
                    <button
                      onClick={handleCompleteAll}
                      title="Complete all notes in this section"
                      style={{
                        background: 'transparent',
                        border: `1px solid ${colors.border}`,
                        color: colors.textMuted,
                        cursor: 'pointer',
                        padding: '4px 8px',
                        fontSize: 11,
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        marginLeft: 8,
                      }}
                    >
                      <Check size={12} /> All
                    </button>
                  )}
                </div>
                {showHeaderMenu && (
                  <ContextMenu
                    position={headerMenuPosition}
                    onClose={() => setShowHeaderMenu(false)}
                    items={[
                      {
                        label: 'Rename',
                        icon: Edit3,
                        action: () =>
                          setEditingHeaderItem(
                            viewingPageLevel ? currentPage : currentSection
                          ),
                        visible: myRole === 'owner' || (!viewingPageLevel && ['owner', 'team-admin', 'team'].includes(myRole)),
                      },
                      {
                        label: 'Share page',
                        icon: Share2,
                        action: () => {
                          setShareModalPageId(currentPage);
                          setShowShareModal(true);
                        },
                        visible: canManageCurrentPage,
                      },
                      {
                        label: currentPageData?.starred
                          ? 'Unstar page'
                          : 'Star page',
                        icon: Star,
                        action: () =>
                          setPages(
                            pages.map(p =>
                              p.id === currentPage
                                ? { ...p, starred: !p.starred }
                                : p
                            )
                          ),
                      },
                    ].filter(item => item.visible !== false)}
                  />
                )}
              </>
            )}
          </div>
          )}

          {/* Mobile Header Menu - triggered by ellipsis in MobileHeader */}
          {isMobile && showHeaderMenu && (
            <ContextMenu
              position={{ top: 64, right: 16 }}
              onClose={() => setShowHeaderMenu(false)}
              items={[
                {
                  label: 'Rename',
                  icon: Edit3,
                  action: () => {
                    setEditingItem(viewingPageLevel ? currentPage : currentSection);
                    setShowHeaderMenu(false);
                  },
                  visible: myRole === 'owner' || (!viewingPageLevel && ['owner', 'team-admin', 'team'].includes(myRole)),
                },
                {
                  label: 'Share page',
                  icon: Share2,
                  action: () => {
                    setShareModalPageId(currentPage);
                    setShowShareModal(true);
                    setShowHeaderMenu(false);
                  },
                  visible: canManageCurrentPage,
                },
                {
                  label: currentPageData?.starred ? 'Unstar page' : 'Star page',
                  icon: Star,
                  action: () => {
                    setPages(
                      pages.map(p =>
                        p.id === currentPage
                          ? { ...p, starred: !p.starred }
                          : p
                      )
                    );
                    setShowHeaderMenu(false);
                  },
                },
              ].filter(item => item.visible !== false)}
            />
          )}

          {/* Content area */}
          <div
            ref={zoomRef}
            style={{
              flex: 1,
              display: viewMode === 'graph' ? 'flex' : undefined,
              flexDirection: viewMode === 'graph' ? 'column' : undefined,
              overflowY: viewMode === 'graph' ? 'hidden' : 'auto',
              overflowX: 'hidden',
              padding: viewMode === 'graph' ? 0 : (isMobile ? '0 16px calc(240px + env(safe-area-inset-bottom))' : '0 40px 200px'),
              opacity: contentVisible ? 1 : 0,
              transition: 'opacity 0.25s',
            }}
          >
          <div style={{
            transform: zoomScale !== 1 ? `scale(${zoomScale})` : undefined,
            transformOrigin: 'top left',
            width: zoomScale !== 1 ? `${100 / zoomScale}%` : '100%',
            flex: viewMode === 'graph' ? 1 : undefined,
            minHeight: viewMode === 'graph' ? 0 : undefined,
            transition: 'transform 0.1s ease',
          }}>
            {/* Agent View - when active, takes over the content area */}
            {agentView ? (
              <>
                {/* Agent View: List Mode */}
                {agentView.viewType === 'list' && (
                  agentFilteredNotes.length ? (
                    agentFilteredNotes.map(note => {
                      const section = allSections.find(s => s.id === note.sectionId);
                      return (
                        <div key={note.id} style={{ marginBottom: 4 }}>
                          {section && (
                            <p
                              onClick={() => {
                                setCurrentPage(section.pageId);
                                setCurrentSection(section.id);
                                setAgentView(null);
                                setViewingPageLevel(false);
                              }}
                              style={{
                                color: colors.textMuted,
                                fontSize: 9,
                                fontWeight: 500,
                                letterSpacing: 1,
                                marginBottom: 4,
                                cursor: 'pointer',
                              }}
                            >
                              {section.pageName?.toUpperCase()} / {section.name?.toUpperCase()}
                            </p>
                          )}
                          <NoteCard
                            note={note}
                            isNew={note.id === newNoteId}
                            currentUserId={user.id}
                            canEdit={true}
                            canDelete={true}
                            canToggle={true}
                            compact={compactMode}
                            draggable={true}
                            onToggle={handleNoteToggle}
                            onEdit={handleNoteEdit}
                            onDelete={handleNoteDelete}
                            onTagClick={(tag) => setFilterTag([tag])}
                            onAddTag={handleAddTag}
                            sharedSectionNames={(note.sharedSectionIds || [])
                              .filter(sid => sid !== note.sectionId)
                              .map(sid => allSections.find(s => s.id === sid)?.name)
                              .filter(Boolean)}
                          />
                        </div>
                      );
                    })
                  ) : (
                    <p
                      style={{
                        color: colors.textMuted,
                        fontSize: 13,
                        fontFamily: "'Manrope', sans-serif",
                      }}
                    >
                      No notes match this view.
                    </p>
                  )
                )}

                {/* Agent View: Boxes Mode */}
                {agentView.viewType === 'boxes' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                    {Object.entries(groupAgentNotes(agentFilteredNotes, agentView.groupBy)).map(([groupName, groupNotes]) => (
                      <div
                        key={groupName}
                        style={{
                          background: colors.surface,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 2,
                          padding: 16,
                          minWidth: 280,
                          maxWidth: 400,
                          flex: '1 1 280px',
                        }}
                      >
                        <p
                          style={{
                            color: colors.textPrimary,
                            fontSize: 12,
                            fontWeight: 600,
                            letterSpacing: 1,
                            marginBottom: 12,
                            textTransform: 'uppercase',
                          }}
                        >
                          {groupName} ({groupNotes.length})
                        </p>
                        {groupNotes.map(note => (
                          <div
                            key={note.id}
                            style={{
                              padding: '8px 0',
                              borderBottom: `1px solid ${colors.border}`,
                            }}
                          >
                            <p
                              style={{
                                color: note.completed ? colors.textMuted : colors.textPrimary,
                                fontSize: 13,
                                textDecoration: note.completed ? 'line-through' : 'none',
                                margin: 0,
                              }}
                            >
                              {note.content}
                            </p>
                            {note.tags?.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                                {note.tags.map(tag => (
                                  <TagPill key={tag} tag={tag} small />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* Agent View: Calendar Mode */}
                {agentView.viewType === 'calendar' && (
                  <CalendarView
                    notes={agentFilteredNotes}
                    currentMonth={currentMonth}
                    onMonthChange={d =>
                      setCurrentMonth(
                        new Date(
                          currentMonth.getFullYear(),
                          currentMonth.getMonth() + d,
                          1
                        )
                      )
                    }
                    onNoteClick={n => {
                      const s = allSections.find(x => x.id === n.sectionId);
                      if (s) {
                        setCurrentPage(s.pageId);
                        setCurrentSection(s.id);
                        setAgentView(null);
                        setViewMode('list');
                        setViewingPageLevel(false);
                      }
                    }}
                    onNoteMove={(id, date) =>
                      setNotes(notes.map(n => (n.id === id ? { ...n, date } : n)))
                    }
                  />
                )}

                {/* Agent View: Table Mode */}
                {agentView.viewType === 'table' && (
                  <TableView
                    notes={agentFilteredNotes}
                    allSections={allSections}
                    pages={allPages}
                    onToggle={handleNoteToggle}
                    onEdit={handleNoteEdit}
                    onDelete={handleNoteDelete}
                    onTagClick={(tag) => setFilterTag([tag])}
                    onDateChange={handleNoteDate}
                    onTagsChange={handleNoteTags}
                    allTags={tags}
                    onNavigate={(pageId, sectionId) => {
                      setCurrentPage(pageId);
                      setCurrentSection(sectionId);
                      setAgentView(null);
                      setViewMode('list');
                      setViewingPageLevel(false);
                    }}
                    currentUserId={user?.id}
                  />
                )}
              </>
            ) : !currentPage ? (
              allPages.length === 0 ? (
                /* First-time user onboarding */
                <WelcomeOnboarding
                  onCreateFirst={handleFirstNote}
                  userName={getUserDisplayName(user)}
                />
              ) : (
                /* Home view when no page is selected */
                <HomeView
                  notes={notes}
                  pages={[...ownedPages, ...sharedPages]}
                  allSections={allSections}
                  user={user}
                  newNoteId={newNoteId}
                  onNavigate={(pageId, sectionId) => {
                    setCurrentPage(pageId);
                    setCurrentSection(sectionId);
                    setViewingPageLevel(false);
                  }}
                  onToggle={handleNoteToggle}
                  onEdit={handleNoteEdit}
                  onDelete={handleNoteDelete}
                  onTagClick={(tag) => setFilterTag([tag])}
                />
              )
            ) : (
              /* Normal view when no agent view is active */
              <>
            {viewMode === 'list' &&
              (viewingPageLevel
                ? [...(currentPageData?.sections || [])].sort((a, b) => {
                    // Closed sections go to bottom, then sort by starred
                    if (a.closed_at && !b.closed_at) return 1;
                    if (!a.closed_at && b.closed_at) return -1;
                    return (b.starred ? 1 : 0) - (a.starred ? 1 : 0);
                  }).map(section => {
                    const sn = filteredNotes.filter(
                      n => n.sectionId === section.id || n.sharedSectionIds?.includes(section.id)
                    );
                    if (!sn.length) return null;
                    const snIncomplete = sn.filter(n => !n.completed);
                    const snCompleted = sn.filter(n => n.completed);

                    const renderSectionNote = (note) => {
                      // Section break: notes starting with "---" render as labeled dividers
                      if (note.content?.startsWith('---')) {
                        const label = note.content.replace(/^-{3,}\s*/, '').trim();
                        return (
                          <div
                            key={note.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              margin: '20px 0 8px',
                            }}
                          >
                            <div style={{ flex: 1, height: 1, background: colors.border }} />
                            {label && (
                              <span style={{
                                color: colors.textMuted,
                                fontSize: 10,
                                fontWeight: 600,
                                letterSpacing: 1.5,
                                textTransform: 'uppercase',
                                fontFamily: "'Manrope', sans-serif",
                                flexShrink: 0,
                              }}>
                                {label}
                              </span>
                            )}
                            <div style={{ flex: 1, height: 1, background: colors.border }} />
                            {['owner', 'team-admin'].includes(myRole) && (
                              <button
                                onClick={() => handleNoteDelete(note.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: colors.textMuted,
                                  cursor: 'pointer',
                                  padding: 2,
                                  display: 'flex',
                                  opacity: 0,
                                  transition: 'opacity 0.15s ease',
                                }}
                                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                                title="Remove break"
                              >
                                <X size={10} />
                              </button>
                            )}
                          </div>
                        );
                      }

                      const isOwnNote = note.created_by_user_id === user.id;
                      const canEditNote = ['owner', 'team-admin'].includes(myRole) || (myRole === 'team' && isOwnNote);
                      const canDeleteNote = ['owner', 'team-admin'].includes(myRole) || (myRole === 'team' && isOwnNote);
                      const canToggleNote = ['owner', 'team-admin', 'team', 'team-limited'].includes(myRole);
                      const noteConns = connections.filter(
                        c => c.source_note_id === note.id || c.target_note_id === note.id
                      ).length;
                      const isCustomSort = sortBy === 'custom';
                      const noteCard = (
                        <NoteCard
                          key={note.id}
                          note={note}
                          isNew={note.id === newNoteId}
                          currentUserId={user.id}
                          canEdit={canEditNote}
                          canDelete={canDeleteNote}
                          canToggle={canToggleNote}
                          compact={compactMode}
                          draggable={true}
                          reorderDraggable={isCustomSort}
                          onReorderDragStart={(id) => { draggingNote = true; draggingNoteId = id; }}
                          onToggle={handleNoteToggle}
                          onEdit={handleNoteEdit}
                          onDelete={handleNoteDelete}
                          onTagClick={(tag) => setFilterTag([tag])}
                          onAddTag={handleAddTag}
                          connectionCount={noteConns}
                          allNotes={notes.map(n => {
                            const pg = pages.find(p => p.sections?.some(s => s.id === n.sectionId));
                            const sec = pg?.sections?.find(s => s.id === n.sectionId);
                            return { ...n, pageName: pg?.name, sectionName: sec?.name };
                          })}
                          onLinkClick={(targetNoteId) => {
                            const targetNote = notes.find(n => n.id === targetNoteId);
                            if (targetNote) {
                              const targetPage = pages.find(p => p.sections?.some(s => s.id === targetNote.sectionId));
                              if (targetPage) {
                                setCurrentPage(targetPage.id);
                                setCurrentSection(targetNote.sectionId);
                              }
                            }
                          }}
                          onConnectionBadgeClick={(noteId, e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setConnectionsPopover({ noteId, top: rect.bottom + 4, left: rect.left });
                          }}
                          sharedSectionNames={(note.sharedSectionIds || [])
                            .filter(sid => sid !== section.id)
                            .map(sid => {
                              const sec = page.sections?.find(s => s.id === sid);
                              return sec?.name;
                            })
                            .filter(Boolean)}
                          onCreateConnection={(sourceId, targetId) => handleCreateConnection(sourceId, targetId)}
                        />
                      );
                      const isCompleting = completingNotes.has(note.id); const animatedCard = isCompleting ? React.createElement("div", { key: `completing-${note.id}`, className: "note-completing" }, noteCard) : noteCard; if (!isCustomSort) return animatedCard;
                      return (
                        <div
                          key={note.id}
                          onDragOver={e => {
                            if (!draggingNote || draggingNoteId === note.id) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            const rect = e.currentTarget.getBoundingClientRect();
                            const midY = rect.top + rect.height / 2;
                            if (e.clientY < midY) {
                              e.currentTarget.style.borderTop = `2px solid ${colors.primary}`;
                              e.currentTarget.style.borderBottom = '';
                            } else {
                              e.currentTarget.style.borderTop = '';
                              e.currentTarget.style.borderBottom = `2px solid ${colors.primary}`;
                            }
                          }}
                          onDragLeave={e => {
                            e.currentTarget.style.borderTop = '';
                            e.currentTarget.style.borderBottom = '';
                          }}
                          onDragEnd={() => {
                            draggingNote = false;
                            draggingNoteId = null;
                          }}
                          onDrop={e => {
                            e.preventDefault();
                            e.currentTarget.style.borderTop = '';
                            e.currentTarget.style.borderBottom = '';
                            const data = e.dataTransfer.getData('text/plain');
                            const match = data.match(/^reorder-note:(.+)$/);
                            if (!match) return;
                            const draggedId = match[1];
                            if (draggedId === note.id) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const insertAfter = e.clientY >= rect.top + rect.height / 2;
                            handleNoteReorder(note.sectionId, draggedId, note.id, insertAfter);
                            draggingNote = false;
                            draggingNoteId = null;
                          }}
                        >
                          {animatedCard}
                        </div>
                      );
                    };

                    const isSectionCollapsed = collapsedSections.has(section.id);

                    return (
                      <div key={section.id} style={{ marginBottom: 32 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: isSectionCollapsed ? 0 : 12,
                            cursor: 'pointer',
                          }}
                        >
                          <ChevronRight
                            size={12}
                            color={colors.textMuted}
                            style={{
                              transform: isSectionCollapsed ? 'none' : 'rotate(90deg)',
                              transition: 'transform 0.15s ease',
                              flexShrink: 0,
                            }}
                            onClick={() => {
                              setCollapsedSections(prev => {
                                const next = new Set(prev);
                                if (next.has(section.id)) next.delete(section.id);
                                else next.add(section.id);
                                return next;
                              });
                            }}
                          />
                          <p
                            onClick={() => {
                              setCurrentSection(section.id);
                              setViewingPageLevel(false);
                            }}
                            style={{
                              color: colors.textMuted,
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: 1.5,
                              margin: 0,
                              opacity: section.closed_at ? 0.5 : 1,
                              textDecoration: section.closed_at ? 'line-through' : 'none',
                            }}
                          >
                            {section.name.toUpperCase()}
                          </p>
                          {section.closed_at && (
                            <span style={{ color: colors.textMuted, fontSize: 9, opacity: 0.5, fontWeight: 600 }}>CLOSED</span>
                          )}
                          <span style={{
                            color: colors.textMuted,
                            fontSize: 10,
                            opacity: 0.6,
                          }}>
                            {snIncomplete.length}
                          </span>
                        </div>
                        {!isSectionCollapsed && snIncomplete.map(renderSectionNote)}
                        {!isSectionCollapsed && snCompleted.length > 0 && (
                          <>
                            <button
                              onClick={() => setShowCompleted(!showCompleted)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                width: '100%',
                                padding: '12px 0',
                                background: 'transparent',
                                border: 'none',
                                borderTop: `1px solid ${colors.border}`,
                                color: colors.textMuted,
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: 1,
                                cursor: 'pointer',
                              }}
                            >
                              <ChevronRight
                                size={12}
                                style={{
                                  transform: showCompleted ? 'rotate(90deg)' : 'none',
                                  transition: 'transform 0.15s ease',
                                }}
                              />
                              COMPLETED ({snCompleted.length})
                            </button>
                            {showCompleted && [...snCompleted].sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0)).map(renderSectionNote)}
                          </>
                        )}
                      </div>
                    );
                  })
                : currentSectionData?.section_type === 'richtext' ? (
                  /* Rich text editor for richtext sections */
                  <RichTextEditor
                    key={currentSection}
                    content={currentSectionData?.rich_content || ''}
                    readOnly={!canManageCurrentPage}
                    onChange={(newContent) => {
                      // Optimistic local update
                      const updateSectionContent = pg => pg.map(p =>
                        p.id === currentPage
                          ? { ...p, sections: p.sections.map(s =>
                              s.id === currentSection ? { ...s, rich_content: newContent } : s
                            )}
                          : p
                      );
                      setPages(updateSectionContent);
                      setOwnedPages(updateSectionContent);
                      setSharedPages(updateSectionContent);
                      // Persist to Supabase
                      supabase.from('sections')
                        .update({ rich_content: newContent })
                        .eq('id', currentSection)
                        .then(({ error }) => { if (error) console.error('rich_content save error:', error); });
                    }}
                  />
                ) : filteredNotes.length ? (() => {
                    const incompleteNotes = filteredNotes.filter(n => !n.completed);
                    const completedNotes = filteredNotes.filter(n => n.completed);

                    const renderNote = (note) => {
                      // Section break: notes starting with "---" render as labeled dividers
                      if (note.content?.startsWith('---')) {
                        const label = note.content.replace(/^-{3,}\s*/, '').trim();
                        return (
                          <div
                            key={note.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              margin: '20px 0 8px',
                            }}
                          >
                            <div style={{ flex: 1, height: 1, background: colors.border }} />
                            {label && (
                              <span style={{
                                color: colors.textMuted,
                                fontSize: 10,
                                fontWeight: 600,
                                letterSpacing: 1.5,
                                textTransform: 'uppercase',
                                fontFamily: "'Manrope', sans-serif",
                                flexShrink: 0,
                              }}>
                                {label}
                              </span>
                            )}
                            <div style={{ flex: 1, height: 1, background: colors.border }} />
                            {canManageCurrentPage && (
                              <button
                                onClick={() => handleNoteDelete(note.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: colors.textMuted,
                                  cursor: 'pointer',
                                  padding: 2,
                                  display: 'flex',
                                  opacity: 0,
                                  transition: 'opacity 0.15s ease',
                                }}
                                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                                title="Remove break"
                              >
                                <X size={10} />
                              </button>
                            )}
                          </div>
                        );
                      }

                      const isOwnNote = note.created_by_user_id === user.id;
                      const canEditNote = ['owner', 'team-admin'].includes(myRole) || (myRole === 'team' && isOwnNote);
                      const canDeleteNote = ['owner', 'team-admin'].includes(myRole) || (myRole === 'team' && isOwnNote);
                      const canToggleNote = ['owner', 'team-admin', 'team', 'team-limited'].includes(myRole);
                      const noteConnectionCount = connections.filter(
                        c => c.source_note_id === note.id || c.target_note_id === note.id
                      ).length;
                      const isCustomSort = sortBy === 'custom';
                      const noteCard = (
                        <NoteCard
                          key={note.id}
                          note={note}
                          isNew={note.id === newNoteId}
                          currentUserId={user.id}
                          canEdit={canEditNote}
                          canDelete={canDeleteNote}
                          canToggle={canToggleNote}
                          compact={compactMode}
                          draggable={true}
                          reorderDraggable={isCustomSort}
                          onReorderDragStart={(id) => { draggingNote = true; draggingNoteId = id; }}
                          onToggle={handleNoteToggle}
                          onEdit={handleNoteEdit}
                          onDelete={handleNoteDelete}
                          onTagClick={(tag) => setFilterTag([tag])}
                          onAddTag={handleAddTag}
                          connectionCount={noteConnectionCount}
                          allNotes={notes.map(n => {
                            const pg = pages.find(p => p.sections?.some(s => s.id === n.sectionId));
                            const sec = pg?.sections?.find(s => s.id === n.sectionId);
                            return { ...n, pageName: pg?.name, sectionName: sec?.name };
                          })}
                          onLinkClick={(targetNoteId) => {
                            const targetNote = notes.find(n => n.id === targetNoteId);
                            if (targetNote) {
                              const targetPage = pages.find(p => p.sections?.some(s => s.id === targetNote.sectionId));
                              if (targetPage) {
                                setCurrentPage(targetPage.id);
                                setCurrentSection(targetNote.sectionId);
                              }
                            }
                          }}
                          onConnectionBadgeClick={(noteId, e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setConnectionsPopover({ noteId, top: rect.bottom + 4, left: rect.left });
                          }}
                          sharedSectionNames={(note.sharedSectionIds || [])
                            .filter(sid => sid !== currentSection)
                            .map(sid => allSections.find(s => s.id === sid)?.name)
                            .filter(Boolean)}
                          onCreateConnection={(sourceId, targetId) => handleCreateConnection(sourceId, targetId)}
                        />
                      );
                      const isCompleting2 = completingNotes.has(note.id); const animatedCard2 = isCompleting2 ? React.createElement("div", { key: `completing-${note.id}`, className: "note-completing" }, noteCard) : noteCard; if (!isCustomSort) return animatedCard2;
                      return (
                        <div
                          key={note.id}
                          onDragOver={e => {
                            if (!draggingNote || draggingNoteId === note.id) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            const rect = e.currentTarget.getBoundingClientRect();
                            const midY = rect.top + rect.height / 2;
                            if (e.clientY < midY) {
                              e.currentTarget.style.borderTop = `2px solid ${colors.primary}`;
                              e.currentTarget.style.borderBottom = '';
                            } else {
                              e.currentTarget.style.borderTop = '';
                              e.currentTarget.style.borderBottom = `2px solid ${colors.primary}`;
                            }
                          }}
                          onDragLeave={e => {
                            e.currentTarget.style.borderTop = '';
                            e.currentTarget.style.borderBottom = '';
                          }}
                          onDragEnd={() => {
                            draggingNote = false;
                            draggingNoteId = null;
                          }}
                          onDrop={e => {
                            e.preventDefault();
                            e.currentTarget.style.borderTop = '';
                            e.currentTarget.style.borderBottom = '';
                            const data = e.dataTransfer.getData('text/plain');
                            const match = data.match(/^reorder-note:(.+)$/);
                            if (!match) return;
                            const draggedId = match[1];
                            if (draggedId === note.id) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const insertAfter = e.clientY >= rect.top + rect.height / 2;
                            handleNoteReorder(note.sectionId, draggedId, note.id, insertAfter);
                            draggingNote = false;
                            draggingNoteId = null;
                          }}
                        >
                          {animatedCard2}
                        </div>
                      );
                    };

                    return (
                      <>
                        {incompleteNotes.map(renderNote)}
                        {completedNotes.length > 0 && (
                          <>
                            <button
                              onClick={() => setShowCompleted(!showCompleted)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                width: '100%',
                                padding: '12px 0',
                                background: 'transparent',
                                border: 'none',
                                borderTop: `1px solid ${colors.border}`,
                                color: colors.textMuted,
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: 1,
                                cursor: 'pointer',
                              }}
                            >
                              <ChevronRight
                                size={12}
                                style={{
                                  transform: showCompleted ? 'rotate(90deg)' : 'none',
                                  transition: 'transform 0.15s ease',
                                }}
                              />
                              COMPLETED ({completedNotes.length})
                            </button>
                            {showCompleted && [...completedNotes].sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0)).map(renderNote)}
                          </>
                        )}
                      </>
                    );
                  })()
                  : (
                    <p
                      style={{
                        color: colors.textMuted,
                        fontSize: 13,
                        fontFamily: "'Manrope', sans-serif",
                      }}
                    >
                      No notes yet.
                    </p>
                  ))}

            {viewMode === 'calendar' && (
              <CalendarView
                notes={
                  viewingPageLevel
                    ? notes.filter(n =>
                        currentPageData?.sections.some(s => s.id === n.sectionId || n.sharedSectionIds?.includes(s.id))
                      )
                    : notes.filter(n => n.sectionId === currentSection || n.sharedSectionIds?.includes(currentSection))
                }
                currentMonth={currentMonth}
                onMonthChange={d =>
                  setCurrentMonth(
                    new Date(
                      currentMonth.getFullYear(),
                      currentMonth.getMonth() + d,
                      1
                    )
                  )
                }
                onNoteClick={n => {
                  const s = allSections.find(x => x.id === n.sectionId);
                  if (s) {
                    setCurrentPage(s.pageId);
                    setCurrentSection(s.id);
                    setViewMode('list');
                    setViewingPageLevel(false);
                  }
                }}
                onNoteMove={(id, date) =>
                  setNotes(notes.map(n => (n.id === id ? { ...n, date } : n)))
                }
              />
            )}

            {viewMode === 'boxes' && (
              <BoxesView
                notes={filteredNotes}
                sections={viewingPageLevel ? currentPageData?.sections : null}
                groupBy={groupBy}
                onNoteMove={
                  viewingPageLevel
                    ? (id, sid) => {
                        const movedNote = notes.find(n => n.id === id);
                        if (movedNote) pushUndo({ type: 'move_note', noteId: id, previousSectionId: movedNote.sectionId, newSectionId: sid });
                        setNotes(
                          notes.map(n =>
                            n.id === id ? { ...n, sectionId: sid } : n
                          )
                        );
                        supabase.from('notes').update({ section_id: sid }).eq('id', id)
                          .then(({ error }) => { if (error) console.error('Note move persist failed:', error); });
                      }
                    : null
                }
                onNoteCopy={
                  viewingPageLevel
                    ? (note, targetSectionId) => {
                        const newId = generateId();
                        const newNote = {
                          id: newId,
                          sectionId: targetSectionId,
                          content: note.content,
                          tags: note.tags || [],
                          completed: false,
                          date: note.date || null,
                          created_by_user_id: user?.id || null,
                        };
                        setNotes(prev => [...prev, newNote]);
                        pushUndo({ type: 'copy_note', noteId: newId, note: newNote });
                        supabase.from('notes').insert({
                          id: newId,
                          section_id: targetSectionId,
                          content: note.content,
                          tags: note.tags || [],
                          completed: false,
                          date: note.date || null,
                          created_by_user_id: user?.id || null,
                        }).then(({ error }) => { if (error) console.error('Note copy persist failed:', error); });
                      }
                    : null
                }
                onNoteShare={
                  viewingPageLevel
                    ? (note, targetSectionId) => {
                        // Share: add note_sections reference (same note in multiple sections)
                        setNotes(prev => prev.map(n =>
                          n.id === note.id
                            ? { ...n, sharedSectionIds: [...(n.sharedSectionIds || []), targetSectionId] }
                            : n
                        ));
                        supabase.from('note_sections').insert({
                          note_id: note.id,
                          section_id: targetSectionId,
                        }).then(({ error }) => { if (error) console.error('Note share failed:', error); });
                      }
                    : null
                }
                onNoteToggle={handleNoteToggle}
                onNoteDelete={handleNoteDelete}
                contextId={getBoxContextId()}
                boxConfigs={boxConfigs}
                onSaveBoxConfigs={handleSaveBoxConfigs}
                compact={compactMode}
              />
            )}

            {viewMode === 'table' && (
              <TableView
                notes={filteredNotes}
                allSections={allSections}
                pages={allPages}
                onToggle={handleNoteToggle}
                onEdit={handleNoteEdit}
                onDelete={handleNoteDelete}
                onTagClick={(tag) => setFilterTag([tag])}
                onDateChange={handleNoteDate}
                onTagsChange={handleNoteTags}
                allTags={tags}
                onNavigate={(pageId, sectionId) => {
                  setCurrentPage(pageId);
                  setCurrentSection(sectionId);
                  setViewMode('list');
                  setViewingPageLevel(false);
                }}
                currentUserId={user?.id}
              />
            )}

            {viewMode === 'graph' && (
              <GraphView
                connections={connections}
                notes={notes}
                pages={allPages}
                sections={allSections}
                currentPageId={currentPage}
                currentSectionId={currentSection}
                onNavigate={(pageId, sectionId) => {
                  setCurrentPage(pageId);
                  setCurrentSection(sectionId);
                  setViewingPageLevel(!sectionId);
                  setViewMode('list');
                }}
              />
            )}
              </>
            )}
          </div>{/* close zoom wrapper */}
          </div>{/* close content area */}
        </div>
      </div>

      {/* Connections Popover */}
      {connectionsPopover && (
        <ConnectionsPopover
          noteId={connectionsPopover.noteId}
          position={{ top: connectionsPopover.top, left: connectionsPopover.left }}
          userId={user?.id}
          onClose={() => setConnectionsPopover(null)}
          onNavigate={(noteId, sectionId, pageId) => {
            setCurrentPage(pageId);
            setCurrentSection(sectionId);
            setViewingPageLevel(false);
            setConnectionsPopover(null);
          }}
          onDelete={(connId) => handleDeleteConnection(connId)}
          onCreateConnection={(sourceId, targetId) => handleCreateConnection(sourceId, targetId)}
        />
      )}

      {/* Chat Panel - replaces floating input */}
      {['owner', 'team-admin', 'team'].includes(myRole) && (
        <ChatPanel
          ref={chatPanelRef}
          messages={chatState.messages}
          onSendMessage={handleChatMessage}
          processing={chatState.processing}
          queueLength={chatState.queueLength}
          onUserResponse={handleUserResponse}
          onViewClick={(viewConfig) => setAgentView(viewConfig)}
          onNavigate={(pageName, sectionName) => {
            const page = allPages.find(p => p.name.toLowerCase() === pageName?.toLowerCase());
            if (page) {
              setCurrentPage(page.id);
              setAgentView(null);
              if (sectionName) {
                const section = page.sections?.find(s => s.name.toLowerCase() === sectionName.toLowerCase());
                if (section) {
                  setCurrentSection(section.id);
                  setViewingPageLevel(false);
                } else {
                  setViewingPageLevel(true);
                }
              } else {
                setViewingPageLevel(true);
              }
            }
          }}
          planState={planState}
          onExecutePlan={handleExecutePlan}
          onCancelPlan={handlePlanCancel}
          sidebarWidth={isMobile ? 0 : (sidebarOpen ? 240 : 0)}
          isMobile={isMobile}
          isOnline={isOnline}
          allNotes={notes.map(n => {
            const pg = pages.find(p => p.sections?.some(s => s.id === n.sectionId));
            const sec = pg?.sections?.find(s => s.id === n.sectionId);
            return { ...n, pageName: pg?.name, sectionName: sec?.name };
          })}
          pages={allPages}
          sectionNavHistory={sectionNavHistory}
          onCreateConnection={(targetNoteId) => {
            // Connection will be created when the note is saved and parsed
            // For now this is a no-op placeholder; connections are created on note edit
          }}
        />
      )}


      {/* Search modal */}
      {searchOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: 120,
            zIndex: 99999,
          }}
          onClick={() => {
            setSearchOpen(false);
            setSearchQuery('');
          }}
        >
          <div
            style={{
              width: 'min(500px, 90%)',
              background: colors.surface,
              border: `1px solid ${colors.border}`,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: `1px solid ${colors.border}`,
                gap: 12,
              }}
            >
              <Search size={16} color={colors.textMuted} />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search notes..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  color: colors.textPrimary,
                  fontSize: 14,
                  fontFamily: "'Manrope', sans-serif",
                  outline: 'none',
                }}
              />
              <span
                style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  padding: '2px 6px',
                  border: `1px solid ${colors.border}`,
                }}
              >
                ESC
              </span>
            </div>
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              {searchQuery.trim() && !searchResults.length && (
                <p style={{ color: colors.textMuted, fontSize: 13, padding: 16 }}>
                  No results.
                </p>
              )}
              {searchResults.map(note => {
                const s = allSections.find(x => x.id === note.sectionId);
                return (
                  <div
                    key={note.id}
                    onClick={() => {
                      if (s) {
                        setCurrentPage(s.pageId);
                        setCurrentSection(s.id);
                        setViewingPageLevel(false);
                      }
                      setSearchOpen(false);
                      setSearchQuery('');
                    }}
                    style={{
                      padding: '12px 16px',
                      borderBottom: `1px solid ${colors.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    <p
                      style={{
                        color: colors.textPrimary,
                        fontSize: 13,
                        fontFamily: "'Manrope', sans-serif",
                        margin: 0,
                      }}
                    >
                      {note.content}
                    </p>
                    <p
                      style={{
                        color: colors.textMuted,
                        fontSize: 11,
                        margin: '4px 0 0 0',
                      }}
                    >
                      {s ? `${s.pageName} / ${s.name}` : ''}{' '}
                      {note.date && `• ${note.date}`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Create prompt modal */}
      {createPrompt && (
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
            zIndex: 99999,
          }}
        >
          <div
            style={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              padding: 24,
              maxWidth: 400,
              width: '90%',
            }}
          >
            <p
              style={{
                color: colors.textPrimary,
                fontSize: 14,
                fontFamily: "'Manrope', sans-serif",
                marginBottom: 16,
              }}
            >
              Create new {createPrompt.type}:{' '}
              <strong style={{ color: colors.primary }}>
                {createPrompt.name}
              </strong>
              ?
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleCreateConfirm}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: colors.textPrimary,
                  border: 'none',
                  color: colors.bg,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Yes, create
              </button>
              <button
                onClick={() => {
                  setCreatePrompt(null);
                  setPendingNote(null);
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  color: colors.textMuted,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shortcuts modal */}
      {showShortcuts && (
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
            zIndex: 99999,
          }}
          onClick={() => setShowShortcuts(false)}
        >
          <div
            style={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              padding: 24,
              maxWidth: 400,
              width: '90%',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <p
                style={{
                  color: colors.textPrimary,
                  fontSize: 16,
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                Keyboard Shortcuts
              </p>
              <button
                onClick={() => setShowShortcuts(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: colors.textMuted,
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>
            {[
              { keys: 'Ctrl /', desc: 'Focus input' },
              { keys: 'Ctrl K', desc: 'Search' },
              { keys: 'Ctrl Z', desc: 'Undo' },
              { keys: 'Ctrl Shift Z', desc: 'Redo' },
              { keys: 'Ctrl P', desc: 'New page' },
              { keys: 'Ctrl S', desc: 'New section' },
              { keys: 'Ctrl ?', desc: 'Show shortcuts' },
              { keys: 'Esc', desc: 'Close modal / blur' },
              { keys: 'Ctrl Scroll', desc: 'Zoom in / out' },
              { keys: 'Enter', desc: 'Submit message' },
              { keys: 'Shift Enter', desc: 'New line in input' },
              { keys: 'Tab', desc: 'Accept autocomplete suggestion' },
              { keys: '↑ / ↓', desc: 'Navigate message history' },
              { keys: 'Shift ↑ / ↓', desc: 'Cycle context prefix' },
              { keys: 'Alt ↑ / ↓', desc: 'Browse recent notes into input' },
              { keys: '← / →', desc: 'Navigate action buttons' },
            ].map(({ keys, desc }) => (
              <div
                key={keys}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <span
                  style={{
                    color: colors.textMuted,
                    fontSize: 13,
                    fontFamily: "'Manrope', sans-serif",
                  }}
                >
                  {desc}
                </span>
                <span
                  style={{
                    color: colors.textPrimary,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    background: colors.bg,
                    padding: '4px 8px',
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  {keys}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context menus */}
      {contextMenu === 'sort' && (
        <ContextMenu
          position={contextMenuPosition}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'Incomplete first', action: () => setSortBy('status') },
            { label: 'Date created', action: () => setSortBy('created') },
            { label: 'Alphabetical', action: () => setSortBy('alpha') },
            { label: 'Custom order', action: () => setSortBy('custom') },
            ...((() => {
              const contextKey = viewingPageLevel ? `page-${currentPage}` : `section-${currentSection}`;
              const savedSort = customSortOrder[contextKey];
              return savedSort ? [{ label: `AI: ${savedSort.criteria}`, action: () => setSortBy('custom') }] : [];
            })()),
          ]}
        />
      )}

      {contextMenu === 'user-menu' && (
        <ContextMenu
          position={contextMenuPosition}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'Settings', icon: Settings, action: () => { setContextMenu(null); setShowSettingsModal(true); } },
            { label: 'Sign out', icon: LogOut, action: onSignOut },
          ]}
        />
      )}

      {contextMenu === 'collapsed-user' && (
        <ContextMenu
          position={contextMenuPosition}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'Settings', icon: Settings, action: () => { setContextMenu(null); setShowSettingsModal(true); } },
            { label: 'Sign out', icon: LogOut, action: onSignOut },
          ]}
        />
      )}

      {contextMenu === 'collapsed-plus' && (
        <ContextMenu
          position={contextMenuPosition}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: 'New page',
              icon: FolderPlus,
              action: () => {
                const name = prompt('New page name:');
                if (name) {
                  const np = {
                    id: generateId(),
                    name,
                    starred: false,
                    sections: [],
                  };
                  setPages([...pages, np]);
                  setExpandedPages([...expandedPages, np.id]);
                  setCurrentPage(np.id);
                  setViewingPageLevel(true);
                }
              },
            },
            {
              label: `New section in ${currentPageData?.name || 'page'}`,
              icon: Plus,
              action: () => {
                const name = prompt('Section name:');
                if (name && currentPage) {
                  const ns = { id: generateId(), name };
                  const currentPageSections = currentPageData?.sections?.length || 0;
                  setPages(prev =>
                    prev.map(p =>
                      p.id === currentPage
                        ? { ...p, sections: [...p.sections, ns] }
                        : p
                    )
                  );
                  setCurrentSection(ns.id);
                  setViewingPageLevel(false);
                  // Direct Supabase persist
                  supabase.from('sections').upsert({
                    id: ns.id,
                    page_id: currentPage,
                    name: ns.name,
                    position: currentPageSections,
                  }, { onConflict: 'id' })
                    .then(({ error }) => { if (error) console.error('Section create persist failed:', error); });
                }
              },
            },
          ]}
        />
      )}

      {allPages.map(
        page =>
          contextMenu === `page-${page.id}` && (
            <ContextMenu
              key={page.id}
              position={contextMenuPosition}
              onClose={() => setContextMenu(null)}
              items={[
                {
                  label: 'Rename',
                  icon: Edit3,
                  action: () => setEditingItem(page.id),
                  visible: pageRoles[page.id] === 'owner',
                },
                {
                  label: 'Share',
                  icon: Share2,
                  action: () => {
                    setShareModalPageId(page.id);
                    setShowShareModal(true);
                  },
                  visible: ['owner', 'team-admin'].includes(pageRoles[page.id]),
                },
                {
                  label: page.starred ? 'Unstar' : 'Star',
                  icon: Star,
                  action: () =>
                    setPages(
                      pages.map(p =>
                        p.id === page.id ? { ...p, starred: !p.starred } : p
                      )
                    ),
                },
                {
                  label: 'Add section',
                  icon: FolderPlus,
                  action: () => {
                    const name = prompt('Section name:');
                    if (name) {
                      const newSection = { id: generateId(), name };
                      const updatePageSections = prev =>
                        prev.map(p =>
                          p.id === page.id
                            ? {
                                ...p,
                                sections: [
                                  ...p.sections,
                                  newSection,
                                ],
                              }
                            : p
                        );
                      setPages(updatePageSections);
                      setOwnedPages(updatePageSections);
                      setSharedPages(updatePageSections);
                      // Direct Supabase persist
                      supabase.from('sections').upsert({
                        id: newSection.id,
                        page_id: page.id,
                        name: newSection.name,
                        position: page.sections.length,
                      }, { onConflict: 'id' })
                        .then(({ error }) => { if (error) console.error('Section create persist failed:', error); });
                    }
                  },
                  visible: ['owner', 'team-admin', 'team'].includes(pageRoles[page.id]),
                },
                { divider: true },
                {
                  label: 'Leave page',
                  icon: LogOut,
                  action: async () => {
                    if (confirm('Leave this page? You will lose access.')) {
                      try {
                        await leaveSharedPage(page.id, user.id);
                        window.location.reload();
                      } catch (e) {
                        alert(e.message);
                      }
                    }
                  },
                  visible: pageRoles[page.id] !== 'owner',
                },
                {
                  label: 'Delete page',
                  icon: Trash2,
                  danger: true,
                  action: async () => {
                    if (confirm(`Delete "${page.name}"?`)) {
                      // Soft-delete from Supabase first
                      const { error: delErr } = await supabase
                        .from('pages').update({ deleted_at: new Date().toISOString() }).eq('id', page.id);
                      if (delErr) console.error('Soft-delete page error:', delErr);
                      // Update local state
                      const sids = page.sections.map(s => s.id);
                      setNotes(prev => prev.filter(n => !sids.includes(n.sectionId)));
                      setPages(prev => prev.filter(p => p.id !== page.id));
                      setOwnedPages(prev => prev.filter(p => p.id !== page.id));
                      if (currentPage === page.id && allPages.length > 1) {
                        const rem = allPages.filter(p => p.id !== page.id);
                        setCurrentPage(rem[0].id);
                        setViewingPageLevel(true);
                      }
                    }
                  },
                  visible: pageRoles[page.id] === 'owner',
                },
              ].filter(item => item.visible !== false)}
            />
          )
      )}

      {allPages.flatMap(page =>
        page.sections.map(
          section =>
            contextMenu === `section-${section.id}` && (
              <ContextMenu
                key={section.id}
                position={contextMenuPosition}
                onClose={() => setContextMenu(null)}
                items={[
                  {
                    label: 'Rename',
                    icon: Edit3,
                    action: () => setEditingItem(section.id),
                    visible: ['owner', 'team-admin', 'team'].includes(pageRoles[page.id]),
                  },
                  {
                    label: 'Duplicate',
                    icon: Plus,
                    action: () => {
                      const ns = {
                        id: generateId(),
                        name: `${section.name} (copy)`,
                      };
                      const sn = notes
                        .filter(n => n.sectionId === section.id)
                        .map(n => ({
                          ...n,
                          id: `${Date.now()}-${Math.random()}`,
                          sectionId: ns.id,
                          createdAt: Date.now(),
                        }));
                      const addSection = pg => pg.map(p =>
                        p.id === page.id
                          ? { ...p, sections: [...p.sections, ns] }
                          : p
                      );
                      setPages(addSection);
                      setOwnedPages(addSection);
                      setSharedPages(addSection);
                      setNotes([...notes, ...sn]);
                    },
                    visible: ['owner', 'team-admin', 'team'].includes(pageRoles[page.id]),
                  },
                  {
                    label: section.starred ? 'Unstar section' : 'Star section',
                    icon: Star,
                    action: async () => {
                      const newStarred = !section.starred;
                      const updateSections = pg => pg.map(p =>
                        p.id === page.id
                          ? { ...p, sections: p.sections.map(s => s.id === section.id ? { ...s, starred: newStarred } : s) }
                          : p
                      );
                      setPages(updateSections);
                      setOwnedPages(updateSections);
                      setSharedPages(updateSections);
                      await supabase.from('sections').update({ starred: newStarred }).eq('id', section.id);
                    },
                    visible: ['owner', 'team-admin', 'team'].includes(pageRoles[page.id]),
                  },
                  {
                    label: section.closed_at ? 'Reopen section' : 'Close section',
                    icon: section.closed_at ? ArchiveRestore : Archive,
                    action: async () => {
                      const newClosedAt = section.closed_at ? null : new Date().toISOString();
                      const updateSections = pg => pg.map(p =>
                        p.id === page.id
                          ? { ...p, sections: p.sections.map(s => s.id === section.id ? { ...s, closed_at: newClosedAt } : s) }
                          : p
                      );
                      setPages(updateSections);
                      setOwnedPages(updateSections);
                      setSharedPages(updateSections);
                      await supabase.from('sections').update({ closed_at: newClosedAt }).eq('id', section.id);
                    },
                    visible: ['owner', 'team-admin'].includes(pageRoles[page.id]),
                  },
                  { divider: true },
                  {
                    label: 'Convert to Rich Text',
                    icon: FileText,
                    action: async () => {
                      const sectionNotes = notes.filter(n => n.sectionId === section.id);
                      if (sectionNotes.length > 0) {
                        // Has notes — open tag-mapping modal
                        setRichTextConvertTarget({ pageId: page.id, sectionId: section.id, sectionName: section.name });
                        setShowRichTextConvertModal(true);
                        setContextMenu(null);
                        return;
                      }
                      // No notes — convert directly
                      if (!confirm(`Convert "${section.name}" to a rich text document?`)) return;
                      const updateSections = pg => pg.map(p =>
                        p.id === page.id
                          ? { ...p, sections: p.sections.map(s => s.id === section.id ? { ...s, section_type: 'richtext' } : s) }
                          : p
                      );
                      setPages(updateSections);
                      setOwnedPages(updateSections);
                      setSharedPages(updateSections);
                      await supabase.from('sections').update({ section_type: 'richtext' }).eq('id', section.id);
                    },
                    visible: ['owner', 'team-admin'].includes(pageRoles[page.id]) && (section.section_type || 'notes') === 'notes',
                  },
                  {
                    label: 'Convert to Notes',
                    icon: ListTree,
                    action: async () => {
                      if (!confirm(`Convert "${section.name}" back to a notes list? The rich text content will be preserved in the document but notes will be shown instead.`)) return;
                      const updateSections = pg => pg.map(p =>
                        p.id === page.id
                          ? { ...p, sections: p.sections.map(s => s.id === section.id ? { ...s, section_type: 'notes' } : s) }
                          : p
                      );
                      setPages(updateSections);
                      setOwnedPages(updateSections);
                      setSharedPages(updateSections);
                      await supabase.from('sections').update({ section_type: 'notes' }).eq('id', section.id);
                    },
                    visible: ['owner', 'team-admin'].includes(pageRoles[page.id]) && (section.section_type || 'notes') === 'richtext',
                  },
                  { divider: true },
                  {
                    label: 'Delete section',
                    icon: Trash2,
                    danger: true,
                    action: async () => {
                      const nc = notes.filter(
                        n => n.sectionId === section.id
                      ).length;
                      if (
                        confirm(
                          `Delete "${section.name}"${nc ? ` and ${nc} note(s)` : ''}?`
                        )
                      ) {
                        const newNotes = notes.filter(n => n.sectionId !== section.id);
                        const updateSections = pg => pg.map(p =>
                          p.id === page.id
                            ? { ...p, sections: p.sections.filter(s => s.id !== section.id) }
                            : p
                        );
                        // Soft-delete section from Supabase
                        await supabase.from('sections').update({ deleted_at: new Date().toISOString() }).eq('id', section.id);
                        // Update local state (all three page arrays so sidebar updates)
                        setNotes(newNotes);
                        setPages(updateSections);
                        setOwnedPages(updateSections);
                        setSharedPages(updateSections);
                        if (currentSection === section.id)
                          setViewingPageLevel(true);
                      }
                    },
                    visible: ['owner', 'team-admin'].includes(pageRoles[page.id]),
                  },
                ].filter(item => item.visible !== false)}
              />
            )
        )
      )}

      {/* Share Modal */}
      {showShareModal && shareModalPageId && (
        <ShareModal
          pageId={shareModalPageId}
          pageName={allPages.find(p => p.id === shareModalPageId)?.name || ''}
          currentUserId={user.id}
          myRole={pageRoles[shareModalPageId] || 'owner'}
          onClose={async () => {
            setShowShareModal(false);
            setShareModalPageId(null);
            // Refresh collab counts after sharing changes
            refreshData();
            try {
              const counts = {};
              for (const page of allPages) {
                const collabs = await getPageCollaborators(page.id);
                counts[page.id] = collabs.length - 1;
              }
              setCollabCounts(counts);
            } catch (e) {
              console.error('Failed to refresh collab counts:', e);
            }
          }}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          pages={allPages}
          user={user}
          onOpenTrash={() => {
            setShowSettingsModal(false);
            setShowTrashModal(true);
          }}
        />
      )}

      {/* Trash Modal */}
      {showTrashModal && (
        <TrashModal
          isOpen={showTrashModal}
          onClose={() => setShowTrashModal(false)}
          onRestore={() => refreshData()}
          userId={user?.id}
        />
      )}

      {/* Rich Text Convert Modal */}
      {showRichTextConvertModal && richTextConvertTarget && (
        <RichTextConvertModal
          sectionName={richTextConvertTarget.sectionName}
          notes={notes.filter(n => n.sectionId === richTextConvertTarget.sectionId)}
          onClose={() => { setShowRichTextConvertModal(false); setRichTextConvertTarget(null); }}
          onConvert={async (markdown) => {
            const { pageId, sectionId } = richTextConvertTarget;
            const updateSections = pg => pg.map(p =>
              p.id === pageId
                ? { ...p, sections: p.sections.map(s => s.id === sectionId ? { ...s, section_type: 'richtext', rich_content: markdown } : s) }
                : p
            );
            setPages(updateSections);
            setOwnedPages(updateSections);
            setSharedPages(updateSections);
            setShowRichTextConvertModal(false);
            setRichTextConvertTarget(null);
            await supabase.from('sections').update({ section_type: 'richtext', rich_content: markdown }).eq('id', sectionId);
          }}
        />
      )}

      {/* Plan Mode is now integrated into ChatPanel */}
    </div>
  );
}

export default MainApp;
