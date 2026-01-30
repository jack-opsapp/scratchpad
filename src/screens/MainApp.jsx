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
} from 'lucide-react';

import { useTypewriter } from '../hooks/useTypewriter.js';
import usePlanState from '../hooks/usePlanState.js';
import useChatState from '../hooks/useChatState.js';
import { dataStore } from '../lib/storage.js';
import { callAgent } from '../lib/agent.js';
import { executeGroup, summarizeResults } from '../lib/planExecutor.js';
import { executeViewChanges } from '../lib/viewController.js';
import { executeBulkOperation } from '../lib/bulkOperations.js';
import { colors } from '../styles/theme.js';
import {
  getPageRole,
  getPageCollaborators,
  leaveSharedPage,
} from '../lib/permissions.js';

import {
  LoadingBars,
  ContextMenu,
  TagPill,
  NoteCard,
  ChatResponseBox,
  CalendarView,
  BoxesView,
  PlanModeInterface,
  ChatPanel,
} from '../components/index.js';
import ShareModal from '../components/ShareModal.jsx';
import CollaboratorBadge from '../components/CollaboratorBadge.jsx';

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
  // Data state
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState([]);
  const [ownedPages, setOwnedPages] = useState([]);
  const [sharedPages, setSharedPages] = useState([]);
  const [tags, setTags] = useState([]);
  const [notes, setNotes] = useState([]);
  const [boxConfigs, setBoxConfigs] = useState({});

  // Collaboration state
  const [pageRoles, setPageRoles] = useState({});
  const [collabCounts, setCollabCounts] = useState({});
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareModalPageId, setShareModalPageId] = useState(null);

  // Navigation state
  const [currentPage, setCurrentPage] = useState(null);
  const [currentSection, setCurrentSection] = useState(null);
  const [viewingPageLevel, setViewingPageLevel] = useState(false);
  const [expandedPages, setExpandedPages] = useState([]);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('list');
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [filterIncomplete, setFilterIncomplete] = useState(false);
  const [filterTag, setFilterTag] = useState([]);
  const [sortBy, setSortBy] = useState('created');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [groupBy] = useState('status');

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
      setTags([]); // Tags derived from notes
      setNotes(notesData || []);
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

      setExpandedPages(allPages.map(p => p.id));
      if (owned.length > 0) {
        setCurrentPage(owned[0].id);
        setCurrentSection(owned[0].sections?.[0]?.id || null);
      } else if (shared.length > 0) {
        setCurrentPage(shared[0].id);
        setCurrentSection(shared[0].sections?.[0]?.id || null);
      }
      setLoading(false);
    };
    load();
  }, []);

  // Save data on changes
  useEffect(() => {
    if (!loading) {
      dataStore.saveAll({ pages, tags, notes, boxConfigs });
    }
  }, [pages, tags, notes, boxConfigs, loading]);

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
      } else if (e.key === '/' && !isTyping && !searchOpen) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === '?' && !isTyping) {
        e.preventDefault();
        setShowShortcuts(s => !s);
      } else if (e.key === 'p' && !isTyping && !searchOpen) {
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
      } else if (e.key === 's' && !isTyping && !searchOpen) {
        e.preventDefault();
        if (currentPage) {
          const name = prompt('New section name:');
          if (name) {
            const ns = { id: generateId(), name };
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
    .sort((a, b) =>
      sortBy === 'created'
        ? b.createdAt - a.createdAt
        : a.content.localeCompare(b.content)
    );

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
          // Start plan mode
          planState.startPlan(result.plan);
          setChatResponse({
            message: result.message,
            note: `Plan has ${result.plan.totalGroups} groups with ${result.plan.totalActions} total actions.`
          });
          // Move to first group and set confirmation
          planState.nextGroup();
          if (result.plan.groups[0]) {
            setCurrentConfirmation({
              type: 'group_confirmation',
              group: result.plan.groups[0],
              message: result.plan.groups[0].description,
              progress: `1/${result.plan.totalGroups}`
            });
          }
          break;

        case 'group_confirmation':
          setCurrentConfirmation(result);
          break;

        case 'skip_group':
          planState.skipGroup();
          if (planState.isPlanComplete()) {
            planState.completePlan();
            setChatResponse({ message: 'Plan complete!', note: 'Skipped remaining groups.' });
            setCurrentConfirmation(null);
          }
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

    setNotes([
      ...notes,
      {
        id: noteId,
        sectionId: targetSection,
        content: parsed.content,
        tags: parsed.tags || [],
        completed: false,
        date: parsed.date,
        createdAt: Date.now(),
        createdBy: 'Jackson',
      },
    ]);
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

  // Plan mode action handlers
  const handlePlanYes = async () => {
    if (!currentConfirmation || !currentConfirmation.group) return;

    setProcessing(true);

    try {
      // Execute current group
      const { results, updatedContext } = await executeGroup(
        currentConfirmation.group.actions,
        planState.context,
        pages,
        setPages,
        setNotes
      );

      // Record results
      const summary = summarizeResults(results);
      planState.recordResults({ results, summary }, updatedContext);

      // Show execution result
      setChatResponse({
        message: `${summary.succeeded} succeeded${summary.failed > 0 ? `, ${summary.failed} failed` : ''}`,
        note: currentConfirmation.group.description
      });

      // Check if plan is done
      if (planState.isPlanComplete()) {
        planState.completePlan();
        setCurrentConfirmation(null);

        // Show final summary
        setChatResponse({
          message: 'Plan complete!',
          note: `Created ${updatedContext.createdPages.length} pages, ${updatedContext.createdSections.length} sections, ${updatedContext.createdNotes.length} notes.`
        });
      } else {
        // Move to next group
        planState.nextGroup();

        // Set next group confirmation
        const nextIndex = planState.currentGroupIndex + 1;
        const nextGroup = planState.plan.groups[nextIndex];
        if (nextGroup) {
          setCurrentConfirmation({
            type: 'group_confirmation',
            group: nextGroup,
            message: nextGroup.description,
            progress: `${nextIndex + 1}/${planState.plan.totalGroups}`
          });
        }
      }

    } catch (error) {
      console.error('Execution error:', error);
      setChatResponse({ message: 'Error executing group.', note: error.message });
    } finally {
      setProcessing(false);
    }
  };

  const handlePlanRevise = () => {
    setShowRevisionInput(true);
  };

  const handleRevisionSubmit = async () => {
    if (!revisionInput.trim()) return;

    setProcessing(true);

    try {
      const revised = await callAgent(`revise ${revisionInput}`, {
        pages,
        sections: allSections,
        tags,
        currentPage: currentPageData?.name,
        currentSection: currentSectionData?.name
      }, {
        mode: planState.PLAN_STATES.CONFIRMING,
        plan: planState.plan,
        currentGroupIndex: planState.currentGroupIndex,
        context: planState.context
      });

      if (revised.group) {
        setCurrentConfirmation(revised);
      }
      setRevisionInput('');
      setShowRevisionInput(false);

    } catch (error) {
      console.error('Revision error:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handlePlanSkip = () => {
    planState.skipGroup();

    if (planState.isPlanComplete()) {
      planState.completePlan();
      setCurrentConfirmation(null);
      setChatResponse({ message: 'Plan complete (with skips).', note: '' });
    } else {
      // Move to next group
      const nextIndex = planState.currentGroupIndex + 1;
      const nextGroup = planState.plan.groups[nextIndex];
      if (nextGroup) {
        setCurrentConfirmation({
          type: 'group_confirmation',
          group: nextGroup,
          message: nextGroup.description,
          progress: `${nextIndex + 1}/${planState.plan.totalGroups}`
        });
      }
    }
  };

  const handlePlanCancel = () => {
    const completed = planState.currentGroupIndex;
    const total = planState.plan?.totalGroups || 0;
    planState.cancelPlan();
    setCurrentConfirmation(null);
    setChatResponse({
      message: 'Plan cancelled.',
      note: completed > 0 ? `Completed ${completed} of ${total} groups.` : ''
    });
  };

  // Chat message handler
  const handleChatMessage = async (message) => {
    chatState.setProcessing(true);
    chatState.addUserMessage(message);

    try {
      // Build context for agent
      const context = {
        pages: allPages,
        allSections,
        tags,
        currentPage: currentPageData?.name || '',
        currentSection: currentSectionData?.name || '',
        currentFilters: {
          tags: filterTag,
          incomplete: filterIncomplete
        },
        viewMode,
        recentHistory: chatState.getRecentContext(5)
      };

      // Call agent
      const result = await callAgent(
        message,
        context,
        planState.isInPlanMode ? {
          mode: planState.mode,
          plan: planState.plan,
          currentGroupIndex: planState.currentGroupIndex,
          context: planState.context
        } : null
      );

      // Handle response based on type
      switch (result.type) {
        case 'text_response':
          chatState.addAgentMessage(result.message, 'text_response', { data: result.data });
          break;

        case 'view_change':
          // Execute view changes
          if (result.actions) {
            executeViewChanges(
              result.actions,
              { allPages, currentPage, currentSection },
              {
                setCurrentPage,
                setCurrentSection,
                setViewingPageLevel,
                setFilterTag,
                setFilterIncomplete,
                setViewMode,
                setSortBy,
                setExpandedPages
              }
            );
          }
          chatState.addAgentMessage(result.message, 'view_change', { actions: result.actions });
          break;

        case 'clarification':
          chatState.addAgentMessage(result.message, 'clarification', {
            options: result.options,
            context: result.context
          });
          setAwaitingResponse({ type: 'clarification', data: result });
          break;

        case 'bulk_confirmation':
          chatState.addAgentMessage(result.message, 'bulk_confirmation', {
            operation: result.operation,
            affectedCount: result.affectedCount,
            preview: result.preview
          });
          setAwaitingResponse({ type: 'bulk_confirmation', data: result });
          break;

        case 'plan_proposal':
          planState.startPlan(result.plan);
          chatState.addAgentMessage(result.message, 'plan_proposal', { plan: result.plan });
          chatPanelRef.current?.openPlanUI(); // Show plan UI
          planState.nextGroup();
          if (result.plan.groups[0]) {
            chatState.addAgentMessage(
              `Step 1/${result.plan.totalGroups}: ${result.plan.groups[0].description}?`,
              'group_confirmation',
              { group: result.plan.groups[0] }
            );
            setAwaitingResponse({ type: 'group_confirmation', data: { group: result.plan.groups[0] } });
          }
          break;

        case 'group_confirmation':
          chatState.addAgentMessage(result.message, 'group_confirmation', { group: result.group });
          setAwaitingResponse({ type: 'group_confirmation', data: result });
          break;

        case 'skip_group':
          planState.skipGroup();
          chatState.addAgentMessage(result.message, 'text_response');
          if (planState.isPlanComplete()) {
            planState.completePlan();
            chatPanelRef.current?.closePlanUI(true); // Close with success animation
            chatState.addAgentMessage('Plan complete (with skips).', 'text_response');
          }
          break;

        case 'cancel_plan':
          planState.cancelPlan();
          chatPanelRef.current?.closePlanUI(false); // Close without success animation
          chatState.addAgentMessage(result.message, 'text_response');
          setAwaitingResponse(null);
          break;

        case 'single_action':
        default:
          // Normal single-step execution
          const parsed = result.parsed;
          if (parsed?.newPage && parsed?.page) {
            setPendingNote({ parsed, response: result.response });
            setCreatePrompt({ type: 'page', name: parsed.page });
            chatState.addAgentMessage(`Create new page "${parsed.page}"?`, 'text_response');
          } else if (parsed?.newSection && parsed?.section) {
            setPendingNote({ parsed, response: result.response });
            setCreatePrompt({ type: 'section', name: parsed.section });
            chatState.addAgentMessage(`Create new section "${parsed.section}"?`, 'text_response');
          } else if (parsed) {
            addNote(parsed, result.response);
            chatState.addAgentMessage(result.response?.message || 'Logged.', 'text_response');
          }
          break;
      }

      chatState.checkCompact();

    } catch (error) {
      console.error('Chat error:', error);
      chatState.addAgentMessage('Sorry, I encountered an error processing that command.', 'error');
    } finally {
      chatState.setProcessing(false);
    }
  };

  // Handle user response for confirmations/clarifications
  const handleUserResponse = async (response, messageIndex) => {
    if (!awaitingResponse) return;

    chatState.markMessageResponded(messageIndex);
    chatState.addUserMessage(response);

    const { type, data } = awaitingResponse;

    if (type === 'clarification') {
      handleChatMessage(response);
    }
    else if (type === 'bulk_confirmation') {
      if (response.toLowerCase() === 'yes') {
        chatState.setProcessing(true);
        try {
          const { operation } = data;
          const results = executeBulkOperation(
            operation.type,
            notes,
            operation.target,
            setNotes,
            user?.id
          );
          chatState.addAgentMessage(
            `Done! ${results.succeeded} notes updated.`,
            'execution_result',
            { stats: results }
          );
        } catch (error) {
          chatState.addAgentMessage('Error: ' + error.message, 'error');
        } finally {
          chatState.setProcessing(false);
        }
      } else {
        chatState.addAgentMessage('Operation cancelled.', 'text_response');
      }
    }
    else if (type === 'group_confirmation') {
      if (response.toLowerCase() === 'yes') {
        chatState.setProcessing(true);
        try {
          const { results, updatedContext } = await executeGroup(
            data.group.actions,
            planState.context,
            allPages,
            setPages,
            setNotes
          );

          const summary = summarizeResults(results);
          planState.recordResults({ results, summary }, updatedContext);

          chatState.addAgentMessage(
            `${summary.succeeded} succeeded${summary.failed > 0 ? `, ${summary.failed} failed` : ''}`,
            'execution_result',
            { stats: summary }
          );

          // Calculate next index BEFORE calling nextGroup (state updates are async)
          const nextIndex = planState.currentGroupIndex + 1;
          const isComplete = nextIndex >= planState.plan.groups.length;

          if (isComplete) {
            planState.completePlan();
            chatPanelRef.current?.closePlanUI(true); // Close with success animation
            chatState.addAgentMessage(
              `Plan complete! Created ${updatedContext.createdPages.length} pages, ${updatedContext.createdSections.length} sections, ${updatedContext.createdNotes.length} notes.`,
              'text_response'
            );
            setAwaitingResponse(null);
          } else {
            planState.nextGroup();
            const nextGroup = planState.plan.groups[nextIndex];
            if (nextGroup) {
              chatState.addAgentMessage(
                `Step ${nextIndex + 1}/${planState.plan.totalGroups}: ${nextGroup.description}?`,
                'group_confirmation',
                { group: nextGroup }
              );
              setAwaitingResponse({ type: 'group_confirmation', data: { group: nextGroup } });
            }
          }
        } catch (error) {
          chatState.addAgentMessage('Error: ' + error.message, 'error');
        } finally {
          chatState.setProcessing(false);
        }
      }
      else if (response.toLowerCase().startsWith('revise')) {
        handleChatMessage(response);
      }
      else if (response.toLowerCase() === 'skip') {
        // Calculate next index BEFORE calling skipGroup (state updates are async)
        const nextIndex = planState.currentGroupIndex + 1;
        const isComplete = nextIndex >= planState.plan.groups.length;

        planState.skipGroup();
        chatState.addAgentMessage('Skipped. Moving to next group.', 'text_response');

        if (isComplete) {
          planState.completePlan();
          chatPanelRef.current?.closePlanUI(true); // Close with success animation
          chatState.addAgentMessage('Plan complete (with skips).', 'text_response');
          setAwaitingResponse(null);
        } else {
          const nextGroup = planState.plan.groups[nextIndex];
          if (nextGroup) {
            chatState.addAgentMessage(
              `Step ${nextIndex + 1}/${planState.plan.totalGroups}: ${nextGroup.description}?`,
              'group_confirmation',
              { group: nextGroup }
            );
            setAwaitingResponse({ type: 'group_confirmation', data: { group: nextGroup } });
          }
        }
      }
      else if (response.toLowerCase() === 'cancel') {
        const completed = planState.currentGroupIndex;
        planState.cancelPlan();
        chatPanelRef.current?.closePlanUI(false); // Close without success animation
        chatState.addAgentMessage(
          `Plan cancelled. Completed ${completed} of ${planState.plan?.totalGroups || 0} groups.`,
          'text_response'
        );
        setAwaitingResponse(null);
      }
      // Don't clear awaitingResponse here for group_confirmation 'yes' - it's set to next group above
    }
    else {
      // Only clear for non-group_confirmation types
      setAwaitingResponse(null);
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
        background: colors.bg,
        fontFamily: "'Inter', sans-serif",
      }}
      onClick={() => {
        setContextMenu(null);
        setShowHeaderMenu(false);
      }}
    >
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
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
                SCRATCHPAD
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
                            }}
                          >
                            {page.name}
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
                              <span style={{ flex: 1 }}>{section.name}</span>
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
                            }}
                          >
                            {page.name}
                          </span>
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
                    {tags.map(tag => (
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
                              ? '#ff4444'
                              : 'transparent',
                            border: `1px solid ${selectedTagsForManage.length ? '#ff4444' : colors.border}`,
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
                  SCRATCHPAD
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

        {/* Main content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Toolbar */}
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
              SORT
            </button>
            <div style={{ display: 'flex', border: `1px solid ${colors.border}` }}>
              {[
                { m: 'list', I: List },
                { m: 'boxes', I: LayoutGrid },
                { m: 'calendar', I: Calendar },
              ].map(({ m, I }) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  style={{
                    padding: '6px 10px',
                    background: viewMode === m ? colors.textPrimary : 'transparent',
                    border: 'none',
                    color: viewMode === m ? colors.bg : colors.textMuted,
                    cursor: 'pointer',
                  }}
                >
                  <I size={12} />
                </button>
              ))}
            </div>
          </div>

          {/* Header */}
          <div style={{ padding: '32px 40px 16px' }}>
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
          </div>

          {/* Content area */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '0 40px 140px',
              opacity: contentVisible ? 1 : 0,
              transition: 'opacity 0.25s',
            }}
          >
            {viewMode === 'list' &&
              (viewingPageLevel
                ? currentPageData?.sections.map(section => {
                    const sn = filteredNotes.filter(
                      n => n.sectionId === section.id
                    );
                    if (!sn.length) return null;
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
                        {sn.map(note => {
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
                              onToggle={id =>
                                setNotes(
                                  notes.map(n =>
                                    n.id === id
                                      ? {
                                          ...n,
                                          completed: !n.completed,
                                          completed_by_user_id: !n.completed ? user.id : null,
                                          completed_at: !n.completed ? new Date().toISOString() : null,
                                        }
                                      : n
                                  )
                                )
                              }
                              onEdit={(id, c) =>
                                setNotes(
                                  notes.map(n =>
                                    n.id === id ? { ...n, content: c } : n
                                  )
                                )
                              }
                              onDelete={id =>
                                setNotes(notes.filter(n => n.id !== id))
                              }
                            />
                          );
                        })}
                      </div>
                    );
                  })
                : filteredNotes.length ? (
                    filteredNotes.map(note => {
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
                          onToggle={id =>
                            setNotes(
                              notes.map(n =>
                                n.id === id
                                  ? {
                                      ...n,
                                      completed: !n.completed,
                                      completed_by_user_id: !n.completed ? user.id : null,
                                      completed_at: !n.completed ? new Date().toISOString() : null,
                                    }
                                  : n
                              )
                            )
                          }
                          onEdit={(id, c) =>
                            setNotes(
                              notes.map(n =>
                                n.id === id ? { ...n, content: c } : n
                              )
                            )
                          }
                          onDelete={id =>
                            setNotes(notes.filter(n => n.id !== id))
                          }
                        />
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
                onNoteToggle={id =>
                  setNotes(
                    notes.map(n =>
                      n.id === id ? { ...n, completed: !n.completed } : n
                    )
                  )
                }
                onNoteDelete={id => setNotes(notes.filter(n => n.id !== id))}
                contextId={getBoxContextId()}
                boxConfigs={boxConfigs}
                onSaveBoxConfigs={handleSaveBoxConfigs}
              />
            )}
          </div>
        </div>
      </div>

      {/* Chat Panel - replaces floating input */}
      {['owner', 'team-admin', 'team'].includes(myRole) && (
        <ChatPanel
          ref={chatPanelRef}
          messages={chatState.messages}
          onSendMessage={handleChatMessage}
          processing={chatState.processing}
          onUserResponse={handleUserResponse}
          planState={planState}
          sidebarWidth={sidebarOpen ? 240 : 0}
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
              { keys: '/', desc: 'Focus input' },
              { keys: '⌘ K', desc: 'Search' },
              { keys: 'P', desc: 'New page' },
              { keys: 'S', desc: 'New section' },
              { keys: '?', desc: 'Show shortcuts' },
              { keys: 'Esc', desc: 'Close modal / blur' },
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
            { label: 'Date created', action: () => setSortBy('created') },
            { label: 'Alphabetical', action: () => setSortBy('alpha') },
          ]}
        />
      )}

      {contextMenu === 'user-menu' && (
        <ContextMenu
          position={contextMenuPosition}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'Settings', icon: Settings, action: () => {} },
            { label: 'Sign out', icon: LogOut, action: onSignOut },
          ]}
        />
      )}

      {contextMenu === 'collapsed-user' && (
        <ContextMenu
          position={contextMenuPosition}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'Settings', icon: Settings, action: () => {} },
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
                  setPages(
                    pages.map(p =>
                      p.id === currentPage
                        ? { ...p, sections: [...p.sections, ns] }
                        : p
                    )
                  );
                  setCurrentSection(ns.id);
                  setViewingPageLevel(false);
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
                    if (name)
                      setPages(
                        pages.map(p =>
                          p.id === page.id
                            ? {
                                ...p,
                                sections: [
                                  ...p.sections,
                                  { id: generateId(), name },
                                ],
                              }
                            : p
                        )
                      );
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
                  action: () => {
                    if (confirm(`Delete "${page.name}"?`)) {
                      const sids = page.sections.map(s => s.id);
                      setNotes(notes.filter(n => !sids.includes(n.sectionId)));
                      setPages(pages.filter(p => p.id !== page.id));
                      setOwnedPages(ownedPages.filter(p => p.id !== page.id));
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
                    action: () => {
                      const nc = notes.filter(
                        n => n.sectionId === section.id
                      ).length;
                      if (
                        confirm(
                          `Delete "${section.name}"${nc ? ` and ${nc} note(s)` : ''}?`
                        )
                      ) {
                        setNotes(
                          notes.filter(n => n.sectionId !== section.id)
                        );
                        setPages(
                          pages.map(p =>
                            p.id === page.id
                              ? {
                                  ...p,
                                  sections: p.sections.filter(
                                    s => s.id !== section.id
                                  ),
                                }
                              : p
                          )
                        );
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
          onClose={() => {
            setShowShareModal(false);
            setShareModalPageId(null);
          }}
        />
      )}

      {/* Plan Mode is now integrated into ChatPanel */}
    </div>
  );
}

export default MainApp;
