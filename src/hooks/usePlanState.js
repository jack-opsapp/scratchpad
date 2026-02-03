import { useState, useCallback } from 'react';

const PLAN_STATES = {
  IDLE: 'idle',
  REVIEWING: 'reviewing',   // User is reviewing/approving groups step by step
  EXECUTING: 'executing',   // Plan is being executed
  COMPLETE: 'complete'
};

const GROUP_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  SKIPPED: 'skipped'
};

export default function usePlanState() {
  const [state, setState] = useState({
    mode: PLAN_STATES.IDLE,
    plan: null,              // Full plan from plan_proposal
    currentGroupIndex: 0,    // Which step we're currently viewing/editing
    groupStatuses: [],       // Array of GROUP_STATUS for each group
    executionIndex: -1,      // Which group is currently executing (-1 = not executing)
    results: [],             // Results from executed groups
    context: {               // Execution context (created IDs)
      lastPageId: null,
      lastPageName: null,
      lastSectionId: null,
      lastSectionName: null,
      createdPages: [],
      createdSections: [],
      createdNotes: []
    }
  });

  // Start new plan - initialize all groups as pending, start at first step
  const startPlan = useCallback((planData) => {
    setState({
      mode: PLAN_STATES.REVIEWING,
      plan: planData,
      currentGroupIndex: 0,
      groupStatuses: planData.groups.map(() => GROUP_STATUS.PENDING),
      executionIndex: -1,
      results: [],
      context: {
        lastPageId: null,
        lastPageName: null,
        lastSectionId: null,
        lastSectionName: null,
        createdPages: [],
        createdSections: [],
        createdNotes: []
      }
    });
  }, []);

  // Approve current group and move to next
  const approveAndNext = useCallback(() => {
    setState(prev => {
      const newStatuses = [...prev.groupStatuses];
      newStatuses[prev.currentGroupIndex] = GROUP_STATUS.APPROVED;
      const nextIndex = Math.min(prev.currentGroupIndex + 1, prev.plan.groups.length - 1);
      return {
        ...prev,
        groupStatuses: newStatuses,
        currentGroupIndex: nextIndex
      };
    });
  }, []);

  // Skip current group and move to next
  const skipAndNext = useCallback(() => {
    setState(prev => {
      const newStatuses = [...prev.groupStatuses];
      newStatuses[prev.currentGroupIndex] = GROUP_STATUS.SKIPPED;
      const nextIndex = Math.min(prev.currentGroupIndex + 1, prev.plan.groups.length - 1);
      return {
        ...prev,
        groupStatuses: newStatuses,
        currentGroupIndex: nextIndex
      };
    });
  }, []);

  // Go to a specific group (for reviewing/changing decisions)
  const goToGroup = useCallback((groupIndex) => {
    setState(prev => ({
      ...prev,
      currentGroupIndex: Math.max(0, Math.min(groupIndex, (prev.plan?.groups?.length || 1) - 1))
    }));
  }, []);

  // Reset a group's status back to pending
  const resetGroup = useCallback((groupIndex) => {
    setState(prev => {
      const newStatuses = [...prev.groupStatuses];
      newStatuses[groupIndex] = GROUP_STATUS.PENDING;
      return { ...prev, groupStatuses: newStatuses };
    });
  }, []);

  // Update a group's content (for revisions)
  const updateGroup = useCallback((groupIndex, updatedGroup) => {
    setState(prev => {
      if (!prev.plan) return prev;
      const newGroups = [...prev.plan.groups];
      newGroups[groupIndex] = updatedGroup;
      return {
        ...prev,
        plan: { ...prev.plan, groups: newGroups }
      };
    });
  }, []);

  // Approve all remaining pending groups
  const approveAll = useCallback(() => {
    setState(prev => ({
      ...prev,
      groupStatuses: prev.groupStatuses.map(status =>
        status === GROUP_STATUS.PENDING ? GROUP_STATUS.APPROVED : status
      ),
      currentGroupIndex: prev.plan.groups.length - 1
    }));
  }, []);

  // Start execution
  const startExecution = useCallback(() => {
    setState(prev => ({
      ...prev,
      mode: PLAN_STATES.EXECUTING,
      executionIndex: 0
    }));
  }, []);

  // Record results for a group and move to next
  const recordGroupResult = useCallback((groupIndex, groupResults, updatedContext) => {
    setState(prev => {
      const newResults = [...prev.results];
      newResults[groupIndex] = groupResults;
      return {
        ...prev,
        results: newResults,
        context: { ...prev.context, ...updatedContext },
        executionIndex: groupIndex + 1
      };
    });
  }, []);

  // Mark execution complete
  const completeExecution = useCallback(() => {
    setState(prev => ({
      ...prev,
      mode: PLAN_STATES.COMPLETE
    }));
  }, []);

  // Cancel plan entirely
  const cancelPlan = useCallback(() => {
    setState({
      mode: PLAN_STATES.IDLE,
      plan: null,
      currentGroupIndex: 0,
      groupStatuses: [],
      executionIndex: -1,
      results: [],
      context: {
        lastPageId: null,
        lastPageName: null,
        lastSectionId: null,
        lastSectionName: null,
        createdPages: [],
        createdSections: [],
        createdNotes: []
      }
    });
  }, []);

  // Reset to idle
  const resetToIdle = useCallback(() => {
    cancelPlan();
  }, [cancelPlan]);

  // Check if all groups have been decided (approved or skipped)
  const allGroupsDecided = useCallback(() => {
    return state.groupStatuses.length > 0 &&
           state.groupStatuses.every(status => status !== GROUP_STATUS.PENDING);
  }, [state.groupStatuses]);

  // Check if we're on the last step
  const isOnLastStep = useCallback(() => {
    return state.plan && state.currentGroupIndex >= state.plan.groups.length - 1;
  }, [state.plan, state.currentGroupIndex]);

  // Check if any groups are approved
  const hasApprovedGroups = useCallback(() => {
    return state.groupStatuses.some(status => status === GROUP_STATUS.APPROVED);
  }, [state.groupStatuses]);

  // Get counts
  const getCounts = useCallback(() => {
    const approved = state.groupStatuses.filter(s => s === GROUP_STATUS.APPROVED).length;
    const skipped = state.groupStatuses.filter(s => s === GROUP_STATUS.SKIPPED).length;
    const pending = state.groupStatuses.filter(s => s === GROUP_STATUS.PENDING).length;
    return { approved, skipped, pending, total: state.groupStatuses.length };
  }, [state.groupStatuses]);

  // Get current group
  const getCurrentGroup = useCallback(() => {
    if (!state.plan || state.currentGroupIndex < 0) return null;
    return state.plan.groups[state.currentGroupIndex];
  }, [state.plan, state.currentGroupIndex]);

  // Legacy compatibility - skippedGroups as array of indices
  const skippedGroups = state.groupStatuses
    .map((status, index) => status === GROUP_STATUS.SKIPPED ? index : -1)
    .filter(i => i >= 0);

  return {
    // State
    mode: state.mode,
    plan: state.plan,
    currentGroupIndex: state.currentGroupIndex,
    groupStatuses: state.groupStatuses,
    executionIndex: state.executionIndex,
    results: state.results,
    context: state.context,
    skippedGroups, // Legacy compatibility

    // Computed
    getCurrentGroup,
    allGroupsDecided,
    isOnLastStep,
    hasApprovedGroups,
    getCounts,
    isInPlanMode: state.mode !== PLAN_STATES.IDLE,
    isReviewing: state.mode === PLAN_STATES.REVIEWING,
    isExecuting: state.mode === PLAN_STATES.EXECUTING,
    isComplete: state.mode === PLAN_STATES.COMPLETE,

    // Actions
    startPlan,
    approveAndNext,
    skipAndNext,
    goToGroup,
    resetGroup,
    updateGroup,
    approveAll,
    startExecution,
    recordGroupResult,
    completeExecution,
    cancelPlan,
    resetToIdle,

    // Constants
    PLAN_STATES,
    GROUP_STATUS
  };
}
