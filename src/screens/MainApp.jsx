import { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';

import { useTypewriter } from '../hooks/useTypewriter.js';
import { usePinchZoom } from '../hooks/usePinchZoom.js';
import usePlanState from '../hooks/usePlanState.js';
import { useMediaQuery, useOnlineStatus } from '../hooks/useMediaQuery.js';
import { useSettings } from '../hooks/useSettings.js';
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
  PlanModeInterface,
  ChatPanel,
} from '../components/index.js';
import { TableView } from '../components/TableView.jsx';
import ShareModal from '../components/ShareModal.jsx';
import SettingsModal from '../components/SettingsModal.jsx';
import TrashModal from '../components/TrashModal.jsx';
import CollaboratorBadge from '../components/CollaboratorBadge.jsx';
import MobileSidebar from '../components/MobileSidebar.jsx';
import MobileHeader from '../components/MobileHeader.jsx';
import MobileNoteCard from '../components/MobileNoteCard.jsx';

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
function generateId() {
  return crypto.randomUUID();
}

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

  // Navigation state
  const [currentPage, setCurrentPage] = useState(null);
  const [currentSection, setCurrentSection] = useState(null);
  const [viewingPageLevel, setViewingPageLevel] = useState(false);
  const [expandedPages, setExpandedPages] = useState([]);

  // Agent custom view state
  // { title: string, viewType: 'list'|'boxes'|'calendar', filter: object, groupBy?: string }
  const [agentView, setAgentView] = useState(null);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('list');
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [filterIncomplete, setFilterIncomplete] = useState(false);
  const [filterTag, setFilterTag] = useState([]);
  const [sortBy, setSortBy] = useState('status'); // Default: incomplete first
  const [customSortOrder, setCustomSortOrder] = useState({}); // { [contextKey]: { ids: string[], criteria: string } }
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [groupBy] = useState('status');
  const [compactMode, setCompactMode] = useState(false); // Hide tags, dates, avatars
  const [showCompleted, setShowCompleted] = useState(false); // Collapsible completed notes section

  // Pinch-to-zoom for notes area
  const { containerRef: zoomRef, scale: zoomScale, resetZoom, setScale: setZoomScale } = usePinchZoom({ minScale: 0.5, maxScale: 2.0 });

  // Swipe-right to cycle view modes
  const viewModes = ['list', 'boxes', 'calendar', 'table'];
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
      const [owned, shared, notesData, boxConfigsData] = await Promise.all([
        dataStore.getOwnedPages(),
        dataStore.getSharedPages(),
        dataStore.getNotes(),
        dataStore.getBoxConfigs(),
      ]);

      const allPages = [...owned, ...shared];

      setOwnedPages(owned || []);
      setSharedPages(shared || []);
      setPages(allPages);
      setNotes(notesData || []);
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

      // Check URL for page/section first, then fall back to settings default
      const urlParams = new URLSearchParams(window.location.search);
      const urlPageId = urlParams.get('page');
      const urlSectionId = urlParams.get('section');

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
    };
    load();
  }, []);

  // Sync navigation state to URL for reload persistence
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams();
    if (currentPage) {
      params.set('page', currentPage);
      if (currentSection && !viewingPageLevel) {
        params.set('section', currentSection);
      }
    }
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
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

  // Save data on changes (debounced to prevent stale saves from overwriting direct operations)
  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        dataStore.saveAll({ pages, tags, notes, boxConfigs });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [pages, tags, notes, boxConfigs, loading]);

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
          setPages(pg => [...pg, np]);
          setExpandedPages(ep => [...ep, np.id]);
          setCurrentPage(np.id);
          setViewingPageLevel(true);
        }
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
            setPages(pg =>
              pg.map(p =>
                p.id === currentPage
                  ? { ...p, sections: [...p.sections, ns] }
                  : p
              )
            );
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
          currentPageData?.sections.some(s => s.id === n.sectionId)
        )
      : notes.filter(n => n.sectionId === currentSection)
  )
    .filter(n => !filterIncomplete || !n.completed)
    .filter(
      n => filterTag.length === 0 || filterTag.some(t => n.tags?.includes(t))
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
            addNote(parsed, result.response);
          }
          break;
      }

    } catch (error) {
      console.error('Agent error:', error);
      setChatResponse({ message: 'Error processing command.', note: error.message });
    } finally {
      setProcessing(false);
      setInputValue('');
    }
  };

  const addNote = (parsed, response) => {
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
      const [owned, shared, notesData] = await Promise.all([
        dataStore.getOwnedPages(),
        dataStore.getSharedPages(),
        dataStore.getNotes()
      ]);

      if (owned) setOwnedPages(owned);
      if (shared) setSharedPages(shared);
      if (notesData) setNotes(notesData);

      // Also refresh tags
      const allTags = [...new Set(
        (notesData || []).flatMap(n => n.tags || []).filter(Boolean)
      )];
      setTags(allTags);
    } catch (err) {
      console.error('Failed to refresh data:', err);
    }
  };

  // Toggle note completion with direct Supabase persistence
  const handleNoteToggle = async (id) => {
    let updateData = null;
    // Use functional updater to read latest state (avoids stale closure)
    setNotes(prev => {
      const note = prev.find(n => n.id === id);
      if (!note) return prev;
      const newCompleted = !note.completed;
      const completed_by_user_id = newCompleted ? user.id : null;
      const completed_at = newCompleted ? new Date().toISOString() : null;
      updateData = { completed: newCompleted, completed_by_user_id, completed_at };
      return prev.map(n =>
        n.id === id ? { ...n, ...updateData } : n
      );
    });

    // Persist to Supabase - try update first, fall back to upsert
    if (updateData) {
      const { error, count } = await supabase
        .from('notes')
        .update(updateData)
        .eq('id', id)
        .select('id');
      if (error) {
        console.error('Toggle update failed, retrying with upsert:', error);
        // Retry: fetch the full note from state and upsert
        setNotes(prev => {
          const note = prev.find(n => n.id === id);
          if (note) {
            supabase.from('notes').upsert({
              id: note.id,
              section_id: note.sectionId,
              content: note.content,
              completed: note.completed,
              completed_by_user_id: note.completed_by_user_id,
              completed_at: note.completed_at,
              date: note.date || null,
              tags: note.tags || [],
              created_by_user_id: note.created_by_user_id || user.id,
            }, { onConflict: 'id' }).then(({ error: e2 }) => {
              if (e2) console.error('Toggle upsert also failed:', e2);
            });
          }
          return prev; // No state change
        });
      }
    }
  };

  // Complete all visible notes
  const handleCompleteAll = async () => {
    const visibleNotes = agentView ? agentFilteredNotes : filteredNotes;
    const incompleteNotes = visibleNotes.filter(n => !n.completed);
    if (!incompleteNotes.length) return;

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
    setNotes(prev => prev.filter(n => n.id !== id));
    supabase.from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      .then(({ error }) => { if (error) console.error('Delete persist failed:', error); });
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
        fontFamily: "'Inter', sans-serif",
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

                  {ownedPages.map(page => (
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
                          style={{ cursor: 'pointer' }}
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
                            onBlur={() => setEditingItem(null)}
                            onKeyDown={e =>
                              e.key === 'Enter' && setEditingItem(null)
                            }
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
                            style={{ marginLeft: 8, flex: 1, cursor: 'pointer' }}
                            onClick={() => {
                              setCurrentPage(page.id);
                              setViewingPageLevel(true);
                              setAgentView(null);
                            }}
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
                        page.sections.map(section => (
                          <div
                            key={section.id}
                            onClick={() => {
                              setCurrentPage(page.id);
                              setCurrentSection(section.id);
                              setViewingPageLevel(false);
                              setAgentView(null);
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
                            }}
                          >
                            {editingItem === section.id ? (
                              <input
                                autoFocus
                                value={section.name}
                                onClick={e => e.stopPropagation()}
                                onChange={e =>
                                  setPages(
                                    pages.map(p =>
                                      p.id === page.id
                                        ? {
                                            ...p,
                                            sections: p.sections.map(s =>
                                              s.id === section.id
                                                ? { ...s, name: e.target.value }
                                                : s
                                            ),
                                          }
                                        : p
                                    )
                                  )
                                }
                                onBlur={() => setEditingItem(null)}
                                onKeyDown={e =>
                                  e.key === 'Enter' && setEditingItem(null)
                                }
                                style={{
                                  flex: 1,
                                  background: 'transparent',
                                  border: 'none',
                                  color: colors.textPrimary,
                                  fontSize: 13,
                                  outline: 'none',
                                }}
                              />
                            ) : (
                              <span style={{ flex: 1 }}>
                                <TypewriterText
                                  text={section.name}
                                  animate={animatingItems.has(section.id)}
                                  onComplete={() => setAnimatingItems(prev => {
                                    const next = new Set(prev);
                                    next.delete(section.id);
                                    return next;
                                  })}
                                />
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
                            style={{ cursor: 'pointer' }}
                          >
                            {expandedPages.includes(page.id) ? (
                              <ChevronDown size={12} />
                            ) : (
                              <ChevronRight size={12} />
                            )}
                          </span>
                          <span
                            style={{ marginLeft: 8, flex: 1, cursor: 'pointer' }}
                            onClick={() => {
                              setCurrentPage(page.id);
                              setViewingPageLevel(true);
                              setAgentView(null);
                            }}
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
                  <p
                    style={{
                      color: colors.textMuted,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 1.5,
                      marginBottom: 12,
                    }}
                  >
                    TAGS
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(tagsExpanded ? tags : tags.slice(0, 4)).map(tag => (
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
                    {!tagsExpanded && tags.length > 4 && (
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
                          fontFamily: "'Inter', sans-serif",
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
                          fontFamily: "'Inter', sans-serif",
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
                      fontFamily: "'Inter', sans-serif",
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
                  <span
                    onClick={() => setViewingPageLevel(true)}
                    style={{
                      color: viewingPageLevel ? colors.textPrimary : colors.textMuted,
                      fontSize: viewingPageLevel ? 24 : 11,
                      fontWeight: viewingPageLevel ? 600 : 500,
                      letterSpacing: viewingPageLevel ? -1 : 1,
                      cursor: 'pointer',
                    }}
                  >
                    {currentPageData?.name?.toUpperCase()}
                  </span>
                  {!viewingPageLevel && (
                    <>
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
                        {title.displayed}
                        {!title.done && (
                          <span style={{ color: colors.primary }}>_</span>
                        )}
                      </h1>
                    </>
                  )}
                  <ChevronDown
                    size={14}
                    color={colors.textMuted}
                    style={{ cursor: 'pointer' }}
                    onClick={e => {
                      e.stopPropagation();
                      setShowHeaderMenu(!showHeaderMenu);
                    }}
                  />
                </div>
                {showHeaderMenu && (
                  <ContextMenu
                    position={{ top: 100, left: 40 }}
                    onClose={() => setShowHeaderMenu(false)}
                    items={[
                      {
                        label: 'Rename',
                        icon: Edit3,
                        action: () =>
                          setEditingItem(
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
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: isMobile ? '0 16px calc(240px + env(safe-area-inset-bottom))' : '0 40px 200px',
              opacity: contentVisible ? 1 : 0,
              transition: 'opacity 0.25s',
            }}
          >
          <div style={{
            transform: zoomScale !== 1 ? `scale(${zoomScale})` : undefined,
            transformOrigin: 'top left',
            width: zoomScale !== 1 ? `${100 / zoomScale}%` : '100%',
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
                          />
                        </div>
                      );
                    })
                  ) : (
                    <p
                      style={{
                        color: colors.textMuted,
                        fontSize: 13,
                        fontFamily: "'Inter', sans-serif",
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
            ) : (
              /* Normal view when no agent view is active */
              <>
            {viewMode === 'list' &&
              (viewingPageLevel
                ? currentPageData?.sections.map(section => {
                    const sn = filteredNotes.filter(
                      n => n.sectionId === section.id
                    );
                    if (!sn.length) return null;
                    const snIncomplete = sn.filter(n => !n.completed);
                    const snCompleted = sn.filter(n => n.completed);

                    const renderSectionNote = (note) => {
                      const isOwnNote = note.created_by_user_id === user.id;
                      const canEditNote = ['owner', 'team-admin'].includes(myRole) || (myRole === 'team' && isOwnNote);
                      const canDeleteNote = ['owner', 'team-admin'].includes(myRole) || (myRole === 'team' && isOwnNote);
                      const canToggleNote = ['owner', 'team-admin', 'team', 'team-limited'].includes(myRole);
                      return (
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
                          onToggle={handleNoteToggle}
                          onEdit={handleNoteEdit}
                          onDelete={handleNoteDelete}
                          onTagClick={(tag) => setFilterTag([tag])}
                        />
                      );
                    };

                    return (
                      <div key={section.id} style={{ marginBottom: 32 }}>
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
                            marginBottom: 12,
                            cursor: 'pointer',
                          }}
                        >
                          {section.name.toUpperCase()}
                        </p>
                        {snIncomplete.map(renderSectionNote)}
                        {snCompleted.length > 0 && (
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
                            {showCompleted && snCompleted.map(renderSectionNote)}
                          </>
                        )}
                      </div>
                    );
                  })
                : filteredNotes.length ? (() => {
                    const incompleteNotes = filteredNotes.filter(n => !n.completed);
                    const completedNotes = filteredNotes.filter(n => n.completed);

                    const renderNote = (note) => {
                      const isOwnNote = note.created_by_user_id === user.id;
                      const canEditNote = ['owner', 'team-admin'].includes(myRole) || (myRole === 'team' && isOwnNote);
                      const canDeleteNote = ['owner', 'team-admin'].includes(myRole) || (myRole === 'team' && isOwnNote);
                      const canToggleNote = ['owner', 'team-admin', 'team', 'team-limited'].includes(myRole);
                      return (
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
                          onToggle={handleNoteToggle}
                          onEdit={handleNoteEdit}
                          onDelete={handleNoteDelete}
                          onTagClick={(tag) => setFilterTag([tag])}
                        />
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
                            {showCompleted && completedNotes.map(renderNote)}
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
                        fontFamily: "'Inter', sans-serif",
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
                        currentPageData?.sections.some(s => s.id === n.sectionId)
                      )
                    : notes.filter(n => n.sectionId === currentSection)
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
                    ? (id, sid) =>
                        setNotes(
                          notes.map(n =>
                            n.id === id ? { ...n, sectionId: sid } : n
                          )
                        )
                    : null
                }
                onNoteToggle={handleNoteToggle}
                onNoteDelete={handleNoteDelete}
                contextId={getBoxContextId()}
                boxConfigs={boxConfigs}
                onSaveBoxConfigs={handleSaveBoxConfigs}
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
                onNavigate={(pageId, sectionId) => {
                  setCurrentPage(pageId);
                  setCurrentSection(sectionId);
                  setViewMode('list');
                  setViewingPageLevel(false);
                }}
                currentUserId={user?.id}
              />
            )}
              </>
            )}
          </div>{/* close zoom wrapper */}
          </div>{/* close content area */}
        </div>
      </div>

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
                  fontFamily: "'Inter', sans-serif",
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
                        fontFamily: "'Inter', sans-serif",
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
                fontFamily: "'Inter', sans-serif",
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
              { keys: 'Ctrl P', desc: 'New page' },
              { keys: 'Ctrl S', desc: 'New section' },
              { keys: 'Ctrl ?', desc: 'Show shortcuts' },
              { keys: 'Esc', desc: 'Close modal / blur' },
              { keys: 'Ctrl Scroll', desc: 'Zoom in / out' },
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
                    fontFamily: "'Inter', sans-serif",
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
            ...((() => {
              const contextKey = viewingPageLevel ? `page-${currentPage}` : `section-${currentSection}`;
              const savedSort = customSortOrder[contextKey];
              return savedSort ? [{ label: `Custom: ${savedSort.criteria}`, action: () => setSortBy('custom') }] : [];
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
                      setPages(prev =>
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
                        )
                      );
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
                      setPages(
                        pages.map(p =>
                          p.id === page.id
                            ? { ...p, sections: [...p.sections, ns] }
                            : p
                        )
                      );
                      setNotes([...notes, ...sn]);
                    },
                    visible: ['owner', 'team-admin', 'team'].includes(pageRoles[page.id]),
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
                        const newPages = pages.map(p =>
                          p.id === page.id
                            ? { ...p, sections: p.sections.filter(s => s.id !== section.id) }
                            : p
                        );
                        // Soft-delete section from Supabase
                        await supabase.from('sections').update({ deleted_at: new Date().toISOString() }).eq('id', section.id);
                        // Update local state
                        setNotes(newNotes);
                        setPages(newPages);
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

      {/* Plan Mode is now integrated into ChatPanel */}
    </div>
  );
}

export default MainApp;
