import React, { useState } from 'react';
import { Check, X, SkipForward, Play, RotateCcw, ChevronDown, ChevronUp, Loader } from 'lucide-react';
import { colors } from '../styles/theme.js';

export default function PlanModeInterface({
  planState,
  onExecute,
  onCancel
}) {
  const [expandedGroups, setExpandedGroups] = useState({});

  if (!planState.plan || !planState.isInPlanMode) return null;

  const { plan, groupStatuses, isReviewing, isExecuting, isComplete, executionIndex } = planState;
  const counts = planState.getCounts();

  const toggleExpand = (index) => {
    setExpandedGroups(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return '#2d6b3a';
      case 'skipped': return colors.textMuted;
      default: return colors.border;
    }
  };

  const getStatusIcon = (status, index) => {
    if (isExecuting && index === executionIndex) {
      return <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />;
    }
    if (isExecuting && index < executionIndex && groupStatuses[index] === 'approved') {
      return <Check size={12} strokeWidth={3} />;
    }
    switch (status) {
      case 'approved': return <Check size={12} strokeWidth={3} />;
      case 'skipped': return <SkipForward size={10} />;
      default: return null;
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: 360,
      height: '100vh',
      background: `${colors.surface}`,
      borderLeft: `1px solid ${colors.border}`,
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <p style={{ color: colors.primary, fontSize: 11, fontWeight: 600, letterSpacing: 1.5, margin: 0 }}>
            {isExecuting ? 'EXECUTING PLAN' : isComplete ? 'PLAN COMPLETE' : 'REVIEW PLAN'}
          </p>
          <p style={{ color: colors.textMuted, fontSize: 12, margin: '4px 0 0 0' }}>
            {plan.groups.length} groups - {counts.approved} approved, {counts.skipped} skipped
          </p>
        </div>
        {!isExecuting && (
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.textMuted,
              cursor: 'pointer',
              padding: 4
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Summary */}
      <div style={{
        padding: '12px 20px',
        background: colors.bg,
        borderBottom: `1px solid ${colors.border}`
      }}>
        <p style={{ color: colors.textPrimary, fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          {plan.summary || 'Plan summary'}
        </p>
      </div>

      {/* Groups List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
        {plan.groups.map((group, index) => {
          const status = groupStatuses[index];
          const isExpanded = expandedGroups[index];
          const isCurrentlyExecuting = isExecuting && index === executionIndex;
          const wasExecuted = isExecuting && index < executionIndex;
          const result = planState.results[index];

          return (
            <div
              key={group.id || index}
              style={{
                marginBottom: 12,
                border: `1px solid ${isCurrentlyExecuting ? colors.primary : colors.border}`,
                background: isCurrentlyExecuting ? `${colors.primary}11` : 'transparent',
                opacity: status === 'skipped' && !isExecuting ? 0.6 : 1
              }}
            >
              {/* Group Header */}
              <div
                onClick={() => toggleExpand(index)}
                style={{
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer'
                }}
              >
                {/* Status Indicator */}
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: wasExecuted && status === 'approved' ? '#2d6b3a' : getStatusColor(status),
                  border: `2px solid ${wasExecuted && status === 'approved' ? '#2d6b3a' : getStatusColor(status)}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: status === 'pending' ? colors.textMuted : colors.bg,
                  flexShrink: 0
                }}>
                  {getStatusIcon(status, index)}
                </div>

                {/* Group Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    color: colors.textPrimary,
                    fontSize: 13,
                    fontWeight: 500,
                    margin: 0,
                    textDecoration: status === 'skipped' ? 'line-through' : 'none'
                  }}>
                    {group.title || `Group ${index + 1}`}
                  </p>
                  <p style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    margin: '2px 0 0 0'
                  }}>
                    {group.description} - {group.actions?.length || 0} actions
                  </p>
                </div>

                {/* Expand Toggle */}
                {isExpanded ? <ChevronUp size={16} color={colors.textMuted} /> : <ChevronDown size={16} color={colors.textMuted} />}
              </div>

              {/* Expanded Actions Preview */}
              {isExpanded && (
                <div style={{
                  padding: '0 14px 12px 44px',
                  borderTop: `1px solid ${colors.border}`
                }}>
                  <div style={{ paddingTop: 12 }}>
                    {group.actions?.map((action, actionIndex) => (
                      <p key={actionIndex} style={{
                        color: colors.textMuted,
                        fontSize: 11,
                        margin: '4px 0',
                        paddingLeft: 8,
                        borderLeft: `2px solid ${colors.border}`
                      }}>
                        {action.type === 'create_page' && `Create page: ${action.name}`}
                        {action.type === 'create_section' && `Add section: ${action.name}`}
                        {action.type === 'create_note' && `Add note: ${action.content?.substring(0, 40)}${action.content?.length > 40 ? '...' : ''}`}
                        {action.type === 'delete_page' && `Delete page: ${action.name}`}
                        {action.type === 'delete_section' && `Delete section: ${action.name}`}
                        {action.type === 'bulk_add_tag' && `Add tag: ${action.tag}`}
                        {action.type === 'bulk_mark_complete' && `Mark complete`}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons - Only show in review mode */}
              {isReviewing && (
                <div style={{
                  padding: '8px 14px',
                  borderTop: `1px solid ${colors.border}`,
                  display: 'flex',
                  gap: 8
                }}>
                  {status === 'pending' ? (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); planState.approveGroup(index); }}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          background: colors.primary,
                          border: 'none',
                          color: colors.bg,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4
                        }}
                      >
                        <Check size={12} /> Approve
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); planState.skipGroup(index); }}
                        style={{
                          padding: '6px 10px',
                          background: 'transparent',
                          border: `1px solid ${colors.border}`,
                          color: colors.textMuted,
                          fontSize: 11,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4
                        }}
                      >
                        <SkipForward size={12} /> Skip
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); planState.resetGroup(index); }}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        background: 'transparent',
                        border: `1px solid ${colors.border}`,
                        color: colors.textMuted,
                        fontSize: 11,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4
                      }}
                    >
                      <RotateCcw size={12} /> Change Decision
                    </button>
                  )}
                </div>
              )}

              {/* Execution Results */}
              {result && (
                <div style={{
                  padding: '8px 14px',
                  borderTop: `1px solid ${colors.border}`,
                  background: colors.bg
                }}>
                  <p style={{ color: '#2d6b3a', fontSize: 11, margin: 0 }}>
                    {result.summary?.succeeded || result.results?.filter(r => r.success).length || 0} succeeded
                    {(result.summary?.failed > 0 || result.results?.some(r => !r.success)) && (
                      <span style={{ color: '#b83c2a', marginLeft: 8 }}>
                        {result.summary?.failed || result.results?.filter(r => !r.success).length || 0} failed
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div style={{
        padding: '16px 20px',
        borderTop: `1px solid ${colors.border}`,
        background: colors.bg
      }}>
        {isReviewing && (
          <>
            {/* Quick Actions */}
            {counts.pending > 0 && (
              <button
                onClick={() => planState.approveAll()}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  marginBottom: 10,
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  color: colors.textMuted,
                  fontSize: 11,
                  cursor: 'pointer'
                }}
              >
                Approve All Remaining ({counts.pending})
              </button>
            )}

            {/* Execute Button */}
            <button
              onClick={onExecute}
              disabled={counts.approved === 0}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: counts.approved > 0 ? colors.primary : colors.border,
                border: 'none',
                color: counts.approved > 0 ? colors.bg : colors.textMuted,
                fontSize: 13,
                fontWeight: 600,
                cursor: counts.approved > 0 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 10
              }}
            >
              <Play size={14} />
              Execute Plan ({counts.approved} groups)
            </button>

            <button
              onClick={onCancel}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: `1px solid ${colors.border}`,
                color: colors.textMuted,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              Cancel Plan
            </button>
          </>
        )}

        {isExecuting && (
          <div style={{ textAlign: 'center' }}>
            <Loader size={24} color={colors.primary} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
            <p style={{ color: colors.textMuted, fontSize: 12, margin: 0 }}>
              Executing group {executionIndex + 1} of {counts.approved}...
            </p>
          </div>
        )}

        {isComplete && (
          <>
            <p style={{
              color: '#2d6b3a',
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 8,
              textAlign: 'center'
            }}>
              Plan Executed Successfully
            </p>
            <button
              onClick={onCancel}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: colors.primary,
                border: 'none',
                color: colors.bg,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Done
            </button>
          </>
        )}
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
