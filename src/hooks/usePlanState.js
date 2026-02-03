import { useState, useCallback } from 'react';

const PLAN_STATES = {
  IDLE: 'idle',
  PLANNING: 'planning',
  CONFIRMING: 'confirming',
  EXECUTING: 'executing',
  COMPLETE: 'complete'
};

export default function usePlanState() {
  const [state, setState] = useState({
    mode: PLAN_STATES.IDLE,
    plan: null,              // Full plan from plan_proposal
    currentGroupIndex: -1,   // Which group we're on
    results: [],             // Results from completed groups (indexed by group index)
    skippedGroups: [],       // Array of group indices that were skipped
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

  // Start new plan
  const startPlan = useCallback((planData) => {
    setState({
      mode: PLAN_STATES.PLANNING,
      plan: planData,
      currentGroupIndex: -1,
      results: [],
      skippedGroups: [],
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

  // Move to next group
  const nextGroup = useCallback(() => {
    setState(prev => ({
      ...prev,
      mode: PLAN_STATES.CONFIRMING,
      currentGroupIndex: prev.currentGroupIndex + 1
    }));
  }, []);

  // Record group execution results
  const recordResults = useCallback((groupResults, updatedContext) => {
    setState(prev => ({
      ...prev,
      mode: PLAN_STATES.CONFIRMING,
      results: [...prev.results, groupResults],
      context: { ...prev.context, ...updatedContext }
    }));
  }, []);

  // Skip current group
  const skipGroup = useCallback(() => {
    setState(prev => ({
      ...prev,
      skippedGroups: [...prev.skippedGroups, prev.currentGroupIndex],
      currentGroupIndex: prev.currentGroupIndex + 1,
      mode: PLAN_STATES.CONFIRMING
    }));
  }, []);

  // Update a group (for revisions)
  const updateGroup = useCallback((groupIndex, updatedGroup) => {
    setState(prev => {
      if (!prev.plan) return prev;
      const newGroups = [...prev.plan.groups];
      newGroups[groupIndex] = updatedGroup;
      return {
        ...prev,
        plan: {
          ...prev.plan,
          groups: newGroups
        }
      };
    });
  }, []);

  // Complete plan
  const completePlan = useCallback(() => {
    setState(prev => ({
      ...prev,
      mode: PLAN_STATES.COMPLETE
    }));
  }, []);

  // Cancel plan
  const cancelPlan = useCallback(() => {
    setState({
      mode: PLAN_STATES.IDLE,
      plan: null,
      currentGroupIndex: -1,
      results: [],
      skippedGroups: [],
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

  // Return to idle
  const resetToIdle = useCallback(() => {
    setState({
      mode: PLAN_STATES.IDLE,
      plan: null,
      currentGroupIndex: -1,
      results: [],
      skippedGroups: [],
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

  // Go back to a previous group (for revision)
  const goToGroup = useCallback((groupIndex) => {
    setState(prev => ({
      ...prev,
      currentGroupIndex: groupIndex,
      mode: PLAN_STATES.CONFIRMING,
      // Remove this group from skipped if it was skipped
      skippedGroups: prev.skippedGroups.filter(i => i !== groupIndex)
    }));
  }, []);

  // Get current group
  const getCurrentGroup = useCallback(() => {
    if (state.currentGroupIndex < 0 || !state.plan) return null;
    return state.plan.groups[state.currentGroupIndex];
  }, [state.currentGroupIndex, state.plan]);

  // Check if plan is done
  const isPlanComplete = useCallback(() => {
    if (!state.plan) return false;
    return state.currentGroupIndex >= state.plan.groups.length - 1;
  }, [state.currentGroupIndex, state.plan]);

  return {
    // State
    mode: state.mode,
    plan: state.plan,
    currentGroupIndex: state.currentGroupIndex,
    results: state.results,
    skippedGroups: state.skippedGroups,
    context: state.context,

    // Computed
    getCurrentGroup,
    isPlanComplete,
    isInPlanMode: state.mode !== PLAN_STATES.IDLE,

    // Actions
    startPlan,
    nextGroup,
    recordResults,
    skipGroup,
    updateGroup,
    goToGroup,
    completePlan,
    cancelPlan,
    resetToIdle,

    // Constants
    PLAN_STATES
  };
}
