/**
 * View Controller
 * Execute view change actions from agent
 */

/**
 * Execute view change actions
 * @param {Array} actions - Array of action objects
 * @param {Object} state - Current app state
 * @param {Object} setters - State setter functions
 * @returns {Array} Results of each action
 */
export function executeViewChanges(actions, state, setters) {
  const {
    setCurrentPage,
    setCurrentSection,
    setViewingPageLevel,
    setFilterTag,
    setFilterIncomplete,
    setViewMode,
    setSortBy,
    setExpandedPages,
    setCustomSortOrder,
  } = setters;

  const results = [];

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'navigate':
          executeNavigate(action, state, setCurrentPage, setCurrentSection, setViewingPageLevel, setExpandedPages);
          results.push({ action: 'navigate', success: true, target: action });
          break;

        case 'apply_filter':
          executeFilter(action, setFilterTag, setFilterIncomplete);
          results.push({ action: 'apply_filter', success: true, filters: action.filters });
          break;

        case 'clear_filter':
          setFilterTag([]);
          setFilterIncomplete(false);
          results.push({ action: 'clear_filter', success: true });
          break;

        case 'switch_view':
          setViewMode(action.mode);
          results.push({ action: 'switch_view', success: true, mode: action.mode });
          break;

        case 'sort':
          setSortBy(action.sortBy);
          results.push({ action: 'sort', success: true, sortBy: action.sortBy });
          break;

        case 'custom_sort':
          if (action.sortedIds?.length && setCustomSortOrder) {
            const contextKey = action.contextKey || 'current';
            setCustomSortOrder(prev => ({
              ...prev,
              [contextKey]: { ids: action.sortedIds, criteria: action.criteria || 'custom' }
            }));
            setSortBy('custom');
            results.push({ action: 'custom_sort', success: true, criteria: action.criteria });
          }
          break;

        default:
          console.warn('Unknown view action:', action.type);
          results.push({ action: action.type, success: false, error: 'Unknown action type' });
      }
    } catch (error) {
      console.error('View action error:', action, error);
      results.push({ action: action.type, success: false, error: error.message });
    }
  }

  return results;
}

/**
 * Navigate to page/section
 */
function executeNavigate(action, state, setCurrentPage, setCurrentSection, setViewingPageLevel, setExpandedPages) {
  const { allPages } = state;

  if (action.page) {
    const page = allPages.find(p =>
      p.name.toLowerCase() === action.page.toLowerCase()
    );

    if (!page) {
      throw new Error(`Page "${action.page}" not found`);
    }

    setCurrentPage(page.id);

    // Expand the page in sidebar
    if (setExpandedPages) {
      setExpandedPages(prev => prev.includes(page.id) ? prev : [...prev, page.id]);
    }

    if (action.section) {
      const section = page.sections?.find(s =>
        s.name.toLowerCase() === action.section.toLowerCase()
      );

      if (!section) {
        throw new Error(`Section "${action.section}" not found in ${page.name}`);
      }

      setCurrentSection(section.id);
      setViewingPageLevel(false);
    } else {
      setViewingPageLevel(true);
    }
  } else if (action.section) {
    // Section only - find in current page or search all
    const currentPage = allPages.find(p => p.id === state.currentPage);

    if (currentPage) {
      const section = currentPage.sections?.find(s =>
        s.name.toLowerCase() === action.section.toLowerCase()
      );

      if (section) {
        setCurrentSection(section.id);
        setViewingPageLevel(false);
      } else {
        // Search all pages for the section
        for (const page of allPages) {
          const sec = page.sections?.find(s =>
            s.name.toLowerCase() === action.section.toLowerCase()
          );
          if (sec) {
            setCurrentPage(page.id);
            setCurrentSection(sec.id);
            setViewingPageLevel(false);
            if (setExpandedPages) {
              setExpandedPages(prev => prev.includes(page.id) ? prev : [...prev, page.id]);
            }
            return;
          }
        }
        throw new Error(`Section "${action.section}" not found`);
      }
    }
  }
}

/**
 * Apply filters
 */
function executeFilter(action, setFilterTag, setFilterIncomplete) {
  const { filters } = action;

  if (filters.tags !== undefined) {
    setFilterTag(filters.tags);
  }

  if (filters.incomplete !== undefined) {
    setFilterIncomplete(filters.incomplete);
  }
}

/**
 * Get view state summary for agent context
 */
export function getViewStateSummary(state) {
  return {
    currentPage: state.currentPageData?.name || null,
    currentSection: state.currentSectionData?.name || null,
    viewMode: state.viewMode,
    filters: {
      tags: state.filterTag || [],
      incomplete: state.filterIncomplete || false
    }
  };
}
