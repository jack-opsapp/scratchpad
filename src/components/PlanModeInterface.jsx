import React from 'react';
import { Check, X, Edit3, SkipForward, XCircle } from 'lucide-react';
import { colors } from '../styles/theme.js';

export default function PlanModeInterface({
  plan,
  currentGroupIndex,
  results,
  currentConfirmation,
  onYes,
  onRevise,
  onSkip,
  onCancel,
  executing
}) {
  if (!plan) return null;

  const completedCount = results.length;
  const totalGroups = plan.totalGroups;
  const isComplete = currentGroupIndex >= totalGroups;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: 320,
      height: '100vh',
      background: `${colors.surface}ee`,
      backdropFilter: 'blur(20px)',
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
            PLAN MODE
          </p>
          <p style={{ color: colors.textMuted, fontSize: 12, margin: '4px 0 0 0' }}>
            {completedCount}/{totalGroups} groups
          </p>
        </div>
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
      </div>

      {/* Progress List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {plan.groups.map((group, index) => {
          const isCompleted = index < currentGroupIndex;
          const isCurrent = index === currentGroupIndex;
          const result = results[index];

          return (
            <div
              key={group.id}
              style={{
                marginBottom: 12,
                padding: '12px 14px',
                background: isCurrent ? colors.bg : 'transparent',
                border: `1px solid ${isCurrent ? colors.primary : colors.border}`,
                position: 'relative'
              }}
            >
              {/* Status Icon */}
              <div style={{
                position: 'absolute',
                left: -8,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: isCompleted ? '#4CAF50' : colors.surface,
                border: `2px solid ${isCompleted ? '#4CAF50' : colors.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {isCompleted && <Check size={10} color={colors.bg} strokeWidth={3} />}
              </div>

              {/* Group Info */}
              <p style={{
                color: isCurrent ? colors.primary : isCompleted ? colors.textMuted : colors.textPrimary,
                fontSize: 12,
                fontWeight: isCurrent ? 600 : 400,
                margin: 0,
                lineHeight: 1.4
              }}>
                {index + 1}. {group.description}
              </p>

              {/* Action Count */}
              <p style={{
                color: colors.textMuted,
                fontSize: 10,
                margin: '4px 0 0 0'
              }}>
                {group.actionCount} action{group.actionCount !== 1 ? 's' : ''}
              </p>

              {/* Results Summary */}
              {result && (
                <div style={{ marginTop: 8, fontSize: 11, color: colors.textMuted }}>
                  {result.summary.succeeded > 0 && (
                    <span style={{ color: '#4CAF50' }}>
                      {result.summary.succeeded} succeeded
                    </span>
                  )}
                  {result.summary.failed > 0 && (
                    <span style={{ color: '#ff6b6b', marginLeft: 8 }}>
                      {result.summary.failed} failed
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Current Confirmation */}
      {currentConfirmation && !isComplete && (
        <div style={{
          padding: 20,
          borderTop: `1px solid ${colors.border}`,
          background: colors.bg
        }}>
          <p style={{
            color: colors.textPrimary,
            fontSize: 13,
            fontFamily: "'Manrope', sans-serif",
            marginBottom: 4,
            lineHeight: 1.5
          }}>
            {currentConfirmation.message || currentConfirmation.group?.description}
          </p>

          {/* Preview Items */}
          {currentConfirmation.group?.preview && (
            <div style={{ margin: '12px 0' }}>
              {currentConfirmation.group.preview.map((item, i) => (
                <p key={i} style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  margin: '4px 0',
                  paddingLeft: 8,
                  borderLeft: `2px solid ${colors.border}`
                }}>
                  {item}
                </p>
              ))}
            </div>
          )}

          {/* Action Items Preview */}
          {currentConfirmation.group?.actions && !currentConfirmation.group?.preview && (
            <div style={{ margin: '12px 0' }}>
              {currentConfirmation.group.actions.slice(0, 5).map((action, i) => (
                <p key={i} style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  margin: '4px 0',
                  paddingLeft: 8,
                  borderLeft: `2px solid ${colors.border}`
                }}>
                  {action.type === 'create_page' && `Create page: ${action.name}`}
                  {action.type === 'create_section' && `Add section: ${action.name}`}
                  {action.type === 'create_note' && `Add note: ${action.content?.substring(0, 30)}...`}
                </p>
              ))}
              {currentConfirmation.group.actions.length > 5 && (
                <p style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                  +{currentConfirmation.group.actions.length - 5} more...
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            <button
              onClick={onYes}
              disabled={executing}
              style={{
                padding: '10px 14px',
                background: colors.primary,
                border: 'none',
                color: colors.bg,
                fontSize: 13,
                fontWeight: 600,
                cursor: executing ? 'not-allowed' : 'pointer',
                opacity: executing ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <Check size={14} />
              {executing ? 'Executing...' : 'Yes, proceed'}
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onRevise}
                disabled={executing}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  color: colors.textMuted,
                  fontSize: 12,
                  cursor: executing ? 'not-allowed' : 'pointer',
                  opacity: executing ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <Edit3 size={12} />
                Revise
              </button>

              <button
                onClick={onSkip}
                disabled={executing}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  color: colors.textMuted,
                  fontSize: 12,
                  cursor: executing ? 'not-allowed' : 'pointer',
                  opacity: executing ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <SkipForward size={12} />
                Skip
              </button>
            </div>

            <button
              onClick={onCancel}
              disabled={executing}
              style={{
                padding: '8px 12px',
                background: 'transparent',
                border: `1px solid ${colors.border}`,
                color: colors.textMuted,
                fontSize: 11,
                cursor: executing ? 'not-allowed' : 'pointer',
                opacity: executing ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <XCircle size={12} />
              Cancel Plan
            </button>
          </div>
        </div>
      )}

      {/* Plan Complete */}
      {isComplete && (
        <div style={{
          padding: 20,
          borderTop: `1px solid ${colors.border}`,
          background: colors.bg
        }}>
          <p style={{
            color: '#4CAF50',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 8
          }}>
            Plan Complete
          </p>
          <p style={{
            color: colors.textMuted,
            fontSize: 12,
            marginBottom: 16,
            lineHeight: 1.5
          }}>
            All groups executed successfully.
          </p>
          <button
            onClick={onCancel}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: colors.primary,
              border: 'none',
              color: colors.bg,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Return to Normal Mode
          </button>
        </div>
      )}
    </div>
  );
}
