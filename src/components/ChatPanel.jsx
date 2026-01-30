import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Send, GripHorizontal, Check, X } from 'lucide-react';
import { colors } from '../styles/theme.js';

const COLLAPSED_HEIGHT = 60;
const AUTO_EXPAND_HEIGHT = 180;
const MAX_HEIGHT = 600;
const SNAP_THRESHOLD = 20;

// Pixel grid configuration for dissolve effect
const PIXEL_SIZE = 8; // 8px square pixels
const PIXEL_ANIMATION_DURATION = 2000; // 2 seconds total

const ChatPanel = forwardRef(function ChatPanel({
  messages,
  onSendMessage,
  processing,
  onUserResponse,
  planState,
  sidebarWidth = 240
}, ref) {
  const [height, setHeight] = useState(COLLAPSED_HEIGHT);
  const [isDragging, setIsDragging] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedButtonIndex, setSelectedButtonIndex] = useState(0);
  const [planAnimation, setPlanAnimation] = useState('none'); // 'none', 'entering', 'completing', 'success', 'exiting', 'collapsing'
  const [planUIVisible, setPlanUIVisible] = useState(false);
  const [planContainerHeight, setPlanContainerHeight] = useState('auto');
  const [pixelGrid, setPixelGrid] = useState({ cols: 0, rows: 0, delays: [] });
  const [planVersion, setPlanVersion] = useState(0); // Tracks plan changes for forcing re-render
  const planContainerRef = useRef(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const buttonRefs = useRef([]);

  // Find the last unresponded message that needs action buttons
  const pendingMessage = messages.slice().reverse().find(
    msg => msg.role === 'agent' && !msg.responded &&
    ['bulk_confirmation', 'clarification', 'group_confirmation'].includes(msg.type)
  );
  const pendingMessageIndex = pendingMessage ? messages.indexOf(pendingMessage) : -1;

  // Get action buttons based on pending message type
  const getActionButtons = () => {
    if (!pendingMessage) return [];

    switch (pendingMessage.type) {
      case 'bulk_confirmation':
        return [
          { label: 'Yes', value: 'yes', primary: true },
          { label: 'No', value: 'no' }
        ];
      case 'clarification':
        return pendingMessage.options?.map(opt => ({
          label: opt.label,
          value: opt.value
        })) || [];
      case 'group_confirmation':
        return [
          { label: 'Yes', value: 'yes', primary: true },
          { label: 'Revise', value: 'revise' },
          { label: 'Skip', value: 'skip' },
          { label: 'Cancel', value: 'cancel' }
        ];
      default:
        return [];
    }
  };

  const actionButtons = getActionButtons();

  // Get completion status from planState (not messages, which persist across sessions)
  const completedSteps = planState?.isInPlanMode ? (planState.results?.length || 0) : 0;
  const totalSteps = planState?.plan?.totalGroups || 0;
  const isPlanComplete = completedSteps >= totalSteps && totalSteps > 0;

  // Generate pixel grid based on container size
  const generatePixelGrid = () => {
    const container = planContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cols = Math.ceil(rect.width / PIXEL_SIZE);
    const rows = Math.ceil(rect.height / PIXEL_SIZE);
    const totalPixels = cols * rows;

    const delays = [];
    for (let i = 0; i < totalPixels; i++) {
      delays.push(Math.random() * (PIXEL_ANIMATION_DURATION - 300));
    }

    setPixelGrid({ cols, rows, delays });
  };

  // Imperative method: Show plan UI with enter animation
  const openPlanUI = () => {
    if (planUIVisible) return; // Already visible

    setPlanUIVisible(true);
    setPlanContainerHeight('auto');
    setHeight(h => Math.max(h, 350)); // Ensure enough height

    // Small delay to let container render, then generate grid and start animation
    setTimeout(() => {
      generatePixelGrid();
      setPlanAnimation('entering');
    }, 50);

    // Wait for animation to complete
    setTimeout(() => setPlanAnimation('none'), PIXEL_ANIMATION_DURATION + 150);
  };

  // Imperative method: Close plan UI with exit animation
  const closePlanUI = (success = false) => {
    if (!planUIVisible) return; // Already hidden
    if (planAnimation !== 'none') return; // Animation already in progress

    if (success) {
      // Success sequence: completing → success message → dissolve → collapse
      setPlanAnimation('completing');
      setTimeout(() => {
        setPlanAnimation('success');
        setTimeout(() => {
          generatePixelGrid();
          setPlanAnimation('exiting');
          setTimeout(() => {
            // Collapse the container height
            const currentHeight = planContainerRef.current?.offsetHeight || 0;
            setPlanContainerHeight(currentHeight);
            setPlanAnimation('collapsing');
            requestAnimationFrame(() => {
              setPlanContainerHeight(0);
            });
            // Clean up after collapse
            setTimeout(() => {
              setPlanUIVisible(false);
              setPlanAnimation('none');
              setPlanContainerHeight('auto');
            }, 400);
          }, PIXEL_ANIMATION_DURATION + 100);
        }, 1500);
      }, 800);
    } else {
      // Cancel sequence: dissolve → collapse
      generatePixelGrid();
      setPlanAnimation('exiting');
      setTimeout(() => {
        const currentHeight = planContainerRef.current?.offsetHeight || 0;
        setPlanContainerHeight(currentHeight);
        setPlanAnimation('collapsing');
        requestAnimationFrame(() => {
          setPlanContainerHeight(0);
        });
        setTimeout(() => {
          setPlanUIVisible(false);
          setPlanAnimation('none');
          setPlanContainerHeight('auto');
        }, 400);
      }, PIXEL_ANIMATION_DURATION + 100);
    }
  };

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    openPlanUI,
    closePlanUI
  }));

  useEffect(() => {
    if (messages.length > 0 && height === COLLAPSED_HEIGHT) {
      setHeight(AUTO_EXPAND_HEIGHT);
    }
  }, [messages.length, height]);

  // Height expansion is now handled in openPlanUI()

  // Reset animation state when a new plan starts
  useEffect(() => {
    if (planState?.plan) {
      // New plan received - increment version to force re-render of step boxes
      setPlanVersion(v => v + 1);
      // Reset animation state in case previous plan was mid-animation
      setPlanAnimation('none');
    }
  }, [planState?.plan]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setSelectedButtonIndex(0);
  }, [pendingMessage?.type, pendingMessage?.responded]);

  // Global keyboard listener for action buttons
  useEffect(() => {
    if (actionButtons.length === 0) return;

    const handleGlobalKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedButtonIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedButtonIndex(prev => Math.min(actionButtons.length - 1, prev + 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const btn = actionButtons[selectedButtonIndex];
        if (btn && pendingMessageIndex >= 0) {
          onUserResponse(btn.value, pendingMessageIndex);
        }
      } else if (e.key === 'Escape' && pendingMessage?.type === 'group_confirmation') {
        e.preventDefault();
        onUserResponse('cancel', pendingMessageIndex);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [actionButtons, selectedButtonIndex, pendingMessageIndex, onUserResponse, pendingMessage?.type]);

  const handleDragStart = (e) => {
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartHeight.current = height;
    e.preventDefault();
  };

  const handleDragMove = (e) => {
    if (!isDragging) return;
    const deltaY = dragStartY.current - e.clientY;
    const newHeight = Math.max(COLLAPSED_HEIGHT, Math.min(MAX_HEIGHT, dragStartHeight.current + deltaY));
    setHeight(newHeight);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    const snapPoints = [COLLAPSED_HEIGHT, AUTO_EXPAND_HEIGHT, 350, MAX_HEIGHT];
    const closest = snapPoints.reduce((prev, curr) =>
      Math.abs(curr - height) < Math.abs(prev - height) ? curr : prev
    );
    if (Math.abs(closest - height) < SNAP_THRESHOLD) {
      setHeight(closest);
    }
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, height]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!inputValue.trim() || processing) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: sidebarWidth,
        right: 0,
        height: height,
        background: `${colors.surface}f5`,
        backdropFilter: 'blur(20px)',
        borderTop: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        transition: isDragging ? 'none' : 'height 0.4s ease',
        zIndex: 900
      }}
    >
      {/* Drag Handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          height: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'ns-resize',
          borderBottom: `1px solid ${colors.border}`
        }}
      >
        <GripHorizontal size={14} color={colors.textMuted} style={{ opacity: 0.4 }} />
      </div>

      {/* Plan Mode UI */}
      {planUIVisible && planState?.plan && height > COLLAPSED_HEIGHT && (
        <div
          ref={planContainerRef}
          className={`plan-container ${['completing', 'success', 'exiting', 'collapsing'].includes(planAnimation) ? planAnimation : ''}`}
          style={{
            borderBottom: planAnimation === 'collapsing' ? 'none' : `1px solid ${colors.border}`,
            background: colors.bg,
            position: 'relative',
            overflow: 'hidden',
            height: planContainerHeight,
            transition: planAnimation === 'collapsing' ? 'height 0.4s ease-out' : 'none'
          }}
        >
          {/* Pixel Grid Overlay for Dissolve Effect */}
          {(planAnimation === 'entering' || planAnimation === 'exiting') && pixelGrid.cols > 0 && (
            <div
              className="pixel-grid-overlay"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                flexWrap: 'wrap',
                zIndex: 20,
                pointerEvents: 'none'
              }}
            >
              {pixelGrid.delays.map((delay, i) => (
                <div
                  key={i}
                  className="pixel pixel-fade-out"
                  style={{
                    width: PIXEL_SIZE,
                    height: PIXEL_SIZE,
                    background: colors.bg,
                    animationDelay: `${delay}ms`
                  }}
                />
              ))}
            </div>
          )}

          {/* Green pulse border on completion */}
          {planAnimation === 'completing' && (
            <div className="completion-pulse" />
          )}

          {/* Success Message Overlay - only show during success phase, not during exiting */}
          {planAnimation === 'success' && (
            <div className="success-overlay">
              <span className="success-text">[ PLAN EXECUTED SUCCESSFULLY ]</span>
            </div>
          )}

          {/* Header */}
          <div
            className="plan-header"
            style={{
              padding: '12px 20px',
              borderBottom: `1px solid ${colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                color: colors.primary,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1.5
              }}>
                PLAN MODE
              </span>
              <span style={{
                color: colors.textMuted,
                fontSize: 11
              }}>
                {completedSteps}/{totalSteps} complete
              </span>
            </div>
            <button
              onClick={() => onUserResponse('cancel', pendingMessageIndex)}
              style={{
                background: 'transparent',
                border: 'none',
                color: colors.textMuted,
                cursor: 'pointer',
                padding: 4,
                opacity: 0.6
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Step Boxes */}
          <div
            key={`plan-steps-${planVersion}`}
            className="plan-steps"
            style={{ padding: '12px 20px', display: 'flex', gap: 8, overflowX: 'auto' }}
          >
            {planState.plan.groups.map((group, i) => {
              const isCompleted = i < completedSteps;
              const isCurrent = i === completedSteps && completedSteps < totalSteps;

              return (
                <div
                  key={`${planVersion}-${group.id}`}
                  className="step-box"
                  style={{
                    flex: '0 0 auto',
                    minWidth: 140,
                    padding: '10px 12px',
                    background: isCurrent ? colors.surface : 'transparent',
                    border: `1px solid ${isCurrent ? colors.primary : isCompleted ? '#4CAF50' : colors.border}`,
                    opacity: isCompleted ? 0.7 : 1,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Step header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6
                  }}>
                    <div style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: isCompleted ? '#4CAF50' : isCurrent ? colors.primary : 'transparent',
                      border: `2px solid ${isCompleted ? '#4CAF50' : isCurrent ? colors.primary : colors.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {isCompleted ? (
                        <Check size={10} color={colors.bg} strokeWidth={3} />
                      ) : (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: isCurrent ? colors.bg : colors.textMuted
                        }}>
                          {i + 1}
                        </span>
                      )}
                    </div>

                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: isCompleted ? '#4CAF50' : isCurrent ? colors.primary : colors.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5
                    }}>
                      {isCompleted ? 'Done' : isCurrent ? 'Current' : `Step ${i + 1}`}
                    </span>
                  </div>

                  {/* Step description */}
                  <p style={{
                    fontSize: 12,
                    color: isCurrent ? colors.textPrimary : colors.textMuted,
                    margin: 0,
                    lineHeight: 1.4
                  }}>
                    {group.description}
                  </p>

                  {/* Action details preview */}
                  {group.actions && group.actions.length > 0 && (
                    <div style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: `1px solid ${colors.border}`,
                      fontSize: 11,
                      color: colors.textMuted
                    }}>
                      {group.actions.slice(0, 4).map((action, idx) => (
                        <div key={idx} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginBottom: 3
                        }}>
                          <span style={{ opacity: 0.5 }}>•</span>
                          <span style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {action.type === 'create_page' && action.name}
                            {action.type === 'create_section' && action.name}
                            {action.type === 'create_note' && (action.content?.substring(0, 30) + (action.content?.length > 30 ? '...' : ''))}
                          </span>
                        </div>
                      ))}
                      {group.actions.length > 4 && (
                        <span style={{ opacity: 0.5, fontSize: 10 }}>
                          +{group.actions.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages Area */}
      {height > COLLAPSED_HEIGHT && (
        <div
          ref={messagesContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 20px',
            minHeight: 0
          }}
        >
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              {msg.role === 'user' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: colors.textMuted, fontSize: 11, flexShrink: 0 }}>→</span>
                  <p style={{
                    color: colors.textPrimary,
                    fontSize: 13,
                    margin: 0,
                    lineHeight: 1.4
                  }}>
                    {msg.content}
                  </p>
                </div>
              )}

              {msg.role === 'agent' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{
                    color: msg.type === 'execution_result' ? '#4CAF50' : colors.primary,
                    fontSize: 11,
                    flexShrink: 0
                  }}>
                    {msg.type === 'execution_result' ? '✓' : '←'}
                  </span>
                  <p style={{
                    color: msg.type === 'execution_result' ? '#4CAF50' :
                           msg.type === 'error' ? '#ff6b6b' : colors.textMuted,
                    fontSize: 13,
                    margin: 0,
                    lineHeight: 1.4
                  }}>
                    {msg.content}
                  </p>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input Area */}
      <div style={{
        padding: '12px 20px',
        borderTop: `1px solid ${colors.border}`,
        background: colors.surface
      }}>
        {actionButtons.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {actionButtons.map((btn, idx) => (
              <button
                key={idx}
                ref={el => buttonRefs.current[idx] = el}
                onClick={() => onUserResponse(btn.value, pendingMessageIndex)}
                style={{
                  padding: '8px 14px',
                  background: btn.primary ? colors.primary : 'transparent',
                  border: btn.primary ? 'none' : `1px solid ${selectedButtonIndex === idx ? colors.primary : colors.border}`,
                  color: btn.primary ? colors.bg : selectedButtonIndex === idx ? colors.primary : colors.textMuted,
                  fontSize: 12,
                  fontWeight: btn.primary ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {btn.label}
              </button>
            ))}
            <span style={{ fontSize: 10, color: colors.textMuted, marginLeft: 'auto' }}>
              ← → Enter
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command..."
              disabled={processing}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: colors.textPrimary,
                fontSize: 13,
                outline: 'none',
                opacity: processing ? 0.5 : 1
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={processing || !inputValue.trim()}
              style={{
                background: 'transparent',
                border: `1px solid ${colors.border}`,
                padding: 6,
                cursor: processing ? 'not-allowed' : 'pointer',
                opacity: processing || !inputValue.trim() ? 0.4 : 1
              }}
            >
              <Send size={12} color={colors.textPrimary} />
            </button>
          </div>
        )}
      </div>

      {/* Animations */}
      <style>{`
        /* Pixel dissolve effect - individual pixels fade to/from transparent */
        @keyframes pixelFadeOut {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }

        @keyframes pixelFadeIn {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }

        .pixel {
          flex-shrink: 0;
        }

        .pixel-fade-out {
          opacity: 1;
          animation: pixelFadeOut 300ms ease-out forwards;
        }

        .pixel-fade-in {
          opacity: 0;
          animation: pixelFadeIn 300ms ease-in forwards;
        }

        @keyframes greenPulse {
          0% {
            width: 0%;
            opacity: 1;
          }
          50% {
            opacity: 1;
          }
          100% {
            width: 100%;
            opacity: 0;
          }
        }

        @keyframes successFade {
          0% {
            opacity: 0;
            transform: scale(0.95);
          }
          20% {
            opacity: 1;
            transform: scale(1);
          }
          80% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(1.02);
          }
        }

        .plan-container.completing .plan-steps,
        .plan-container.completing .plan-header,
        .plan-container.success .plan-steps,
        .plan-container.success .plan-header,
        .plan-container.exiting .plan-steps,
        .plan-container.exiting .plan-header,
        .plan-container.collapsing .plan-steps,
        .plan-container.collapsing .plan-header {
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .plan-container.exiting,
        .plan-container.collapsing {
          background: transparent !important;
        }

        .completion-pulse {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 3px;
          background: linear-gradient(90deg, #4CAF50, #8BC34A, #4CAF50);
          animation: greenPulse 0.8s ease-out forwards;
          box-shadow: 0 0 10px #4CAF50, 0 0 20px #4CAF50;
        }

        .success-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: ${colors.bg};
          z-index: 10;
        }

        .success-text {
          color: #4CAF50;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 2px;
          font-family: monospace;
          animation: successFade 1.5s ease-in-out forwards;
        }
      `}</style>
    </div>
  );
});

export default ChatPanel;
