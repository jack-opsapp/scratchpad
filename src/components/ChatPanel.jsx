import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Send, GripHorizontal, Check, X, LayoutGrid, Minus, Maximize2, SkipForward } from 'lucide-react';
import { colors } from '../styles/theme.js';
import VoiceInput from './VoiceInput.jsx';
import MarkdownText from './MarkdownText.jsx';

const INPUT_ONLY_HEIGHT = 56;
const COLLAPSED_HEIGHT = 60;
const AUTO_EXPAND_HEIGHT = 180;
const MAX_HEIGHT = 600;
const SNAP_THRESHOLD = 20;

// Mobile-specific heights - minimum shows input bar only (no collapsed state)
const MOBILE_MIN_HEIGHT = 100; // Just drag handle + input area
const MOBILE_HEIGHTS = {
  inputOnly: 100,  // Minimum - just input bar visible
  small: 250,      // Input + some messages
  medium: 400,
  large: typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.8) : 600
};

// Pixel grid configuration for dissolve effect
const PIXEL_SIZE = 8; // 8px square pixels
const PIXEL_ANIMATION_DURATION = 2000; // 2 seconds total

const ChatPanel = forwardRef(function ChatPanel({
  messages,
  onSendMessage,
  processing,
  onUserResponse,
  onViewClick,
  onNavigate,
  planState,
  onGoToGroup,
  sidebarWidth = 240,
  isMobile = false,
  isOnline = true
}, ref) {
  const [height, setHeight] = useState(isMobile ? MOBILE_HEIGHTS.inputOnly : COLLAPSED_HEIGHT);
  const [isDragging, setIsDragging] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedButtonIndex, setSelectedButtonIndex] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputHistory, setInputHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const previousHeight = useRef(AUTO_EXPAND_HEIGHT);
  const [planAnimation, setPlanAnimation] = useState('none'); // 'none', 'entering', 'completing', 'success', 'exiting', 'collapsing'
  const [planUIVisible, setPlanUIVisible] = useState(false);
  const [planContainerHeight, setPlanContainerHeight] = useState('auto');
  const [pixelGrid, setPixelGrid] = useState({ cols: 0, rows: 0, delays: [] });
  const [planVersion, setPlanVersion] = useState(0); // Tracks plan changes for forcing re-render
  const [reviseMode, setReviseMode] = useState(false); // When true, show revision text input
  const [reviseInput, setReviseInput] = useState('');
  const planContainerRef = useRef(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const reviseInputRef = useRef(null);
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
  const skippedGroups = planState?.skippedGroups || [];

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
    // Auto-expand when messages arrive
    if (messages.length > 0) {
      if (isMobile && height === MOBILE_HEIGHTS.inputOnly) {
        setHeight(MOBILE_HEIGHTS.small);
      } else if (!isMobile && height === COLLAPSED_HEIGHT) {
        setHeight(AUTO_EXPAND_HEIGHT);
      }
    }
  }, [messages.length, height, isMobile]);

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

  // Auto-expand when plan mode is entered
  useEffect(() => {
    if (planState?.isInPlanMode && planState?.plan) {
      // Expand to show plan view
      const minPlanHeight = isMobile ? MOBILE_HEIGHTS.medium : 350;
      if (height < minPlanHeight) {
        setHeight(minPlanHeight);
      }
      // Also ensure minimized state is cleared
      if (isMinimized) {
        setIsMinimized(false);
      }
    }
  }, [planState?.isInPlanMode, planState?.plan]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setSelectedButtonIndex(0);
    // Reset revise mode when pending message changes
    setReviseMode(false);
    setReviseInput('');
  }, [pendingMessage?.type, pendingMessage?.responded]);

  // Global keyboard listener for action buttons
  useEffect(() => {
    if (actionButtons.length === 0 || reviseMode) return;

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
          // Handle revise specially - enter revise mode instead of sending
          if (btn.value === 'revise') {
            setReviseMode(true);
            setReviseInput('');
            setTimeout(() => reviseInputRef.current?.focus(), 50);
          } else {
            onUserResponse(btn.value, pendingMessageIndex);
          }
        }
      } else if (e.key === 'Escape' && pendingMessage?.type === 'group_confirmation') {
        e.preventDefault();
        onUserResponse('cancel', pendingMessageIndex);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [actionButtons, selectedButtonIndex, pendingMessageIndex, onUserResponse, pendingMessage?.type, reviseMode]);

  const handleDragStart = (e) => {
    setIsDragging(true);
    dragStartY.current = e.clientY || e.touches?.[0]?.clientY || 0;
    dragStartHeight.current = height;
    e.preventDefault?.();
  };

  const handleDragMove = (e) => {
    if (!isDragging) return;
    const clientY = e.clientY || e.touches?.[0]?.clientY || 0;
    const deltaY = dragStartY.current - clientY;
    const maxH = isMobile ? MOBILE_HEIGHTS.large : MAX_HEIGHT;
    const minH = isMobile ? MOBILE_HEIGHTS.inputOnly : COLLAPSED_HEIGHT;
    const newHeight = Math.max(minH, Math.min(maxH, dragStartHeight.current + deltaY));
    setHeight(newHeight);
  };

  const handleDragEnd = () => {
    setIsDragging(false);

    if (isMobile) {
      // Mobile snap points - no collapsed state, minimum is inputOnly
      const snapPoints = [
        MOBILE_HEIGHTS.inputOnly,
        MOBILE_HEIGHTS.small,
        MOBILE_HEIGHTS.medium,
        MOBILE_HEIGHTS.large
      ];
      const closest = snapPoints.reduce((prev, curr) =>
        Math.abs(curr - height) < Math.abs(prev - height) ? curr : prev
      );
      setHeight(closest);
    } else {
      // Desktop snap points
      const snapPoints = [COLLAPSED_HEIGHT, AUTO_EXPAND_HEIGHT, 350, MAX_HEIGHT];
      const closest = snapPoints.reduce((prev, curr) =>
        Math.abs(curr - height) < Math.abs(prev - height) ? curr : prev
      );
      if (Math.abs(closest - height) < SNAP_THRESHOLD) {
        setHeight(closest);
      }
    }
  };

  // Handle voice transcript
  const handleVoiceTranscript = (transcript) => {
    setInputValue(transcript);
    // Auto-focus input after voice so user can edit before sending
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove, { passive: false });
      window.addEventListener('touchend', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
        window.removeEventListener('touchmove', handleDragMove);
        window.removeEventListener('touchend', handleDragEnd);
      };
    }
  }, [isDragging, height, isMobile]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;
    // Add to history
    setInputHistory(prev => [...prev, inputValue.trim()]);
    setHistoryIndex(-1);
    onSendMessage(inputValue.trim());
    setInputValue('');
    // Don't block on processing - allow typing next message immediately
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'ArrowUp') {
      // Navigate to previous input in history
      e.preventDefault();
      if (inputHistory.length > 0) {
        const newIndex = historyIndex === -1
          ? inputHistory.length - 1
          : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInputValue(inputHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      // Navigate to next input in history
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= inputHistory.length) {
          setHistoryIndex(-1);
          setInputValue('');
        } else {
          setHistoryIndex(newIndex);
          setInputValue(inputHistory[newIndex]);
        }
      }
    }
  };

  // Handle clicking the Revise button - enter revise mode
  const handleReviseClick = () => {
    setReviseMode(true);
    setReviseInput('');
    // Focus the revise input after render
    setTimeout(() => reviseInputRef.current?.focus(), 50);
  };

  // Handle submitting revision notes
  const handleReviseSubmit = () => {
    if (!reviseInput.trim()) return;
    onUserResponse(`revise: ${reviseInput.trim()}`, pendingMessageIndex);
    setReviseMode(false);
    setReviseInput('');
  };

  // Handle canceling revise mode
  const handleReviseCancel = () => {
    setReviseMode(false);
    setReviseInput('');
  };

  // Handle keydown in revise input
  const handleReviseKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleReviseSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleReviseCancel();
    }
  };

  // Handle minimize/maximize
  const handleMinimize = () => {
    if (isMinimized) {
      setIsMinimized(false);
      setHeight(previousHeight.current);
    } else {
      previousHeight.current = height;
      setIsMinimized(true);
      setHeight(INPUT_ONLY_HEIGHT);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: isMobile ? 0 : 20,
        left: isMobile ? 0 : sidebarWidth + 20,
        right: isMobile ? 0 : 20,
        height: isMinimized ? INPUT_ONLY_HEIGHT : height,
        background: 'rgba(20, 20, 20, 0.65)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        border: isMobile ? 'none' : `1px solid rgba(255,255,255,0.08)`,
        borderRadius: isMobile ? 0 : 12,
        display: 'flex',
        flexDirection: 'column',
        transition: isDragging ? 'none' : 'all 0.3s ease',
        zIndex: 900,
        paddingBottom: isMobile ? 'env(safe-area-inset-bottom)' : 0,
        boxShadow: isMobile ? 'none' : '0 8px 32px rgba(0,0,0,0.5)',
        overflow: 'hidden'
      }}
    >
      {/* Header with drag handle and minimize button */}
      {!isMinimized && (
        <div
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          style={{
            height: isMobile ? 32 : 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            cursor: isMobile ? 'grab' : 'ns-resize',
            borderBottom: `1px solid rgba(255,255,255,0.06)`,
            touchAction: 'none',
            minHeight: isMobile ? 44 : 24,
            marginTop: isMobile ? -12 : 0,
            paddingTop: isMobile ? 12 : 0,
            flexShrink: 0
          }}
        >
          <div style={{ width: 24 }} /> {/* Spacer */}
          {isMobile ? (
            <div style={{
              width: 48,
              height: 5,
              background: colors.textMuted,
              borderRadius: 3,
              opacity: 0.5
            }} />
          ) : (
            <GripHorizontal size={14} color={colors.textMuted} style={{ opacity: 0.4 }} />
          )}
          {!isMobile && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleMinimize();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 4,
                cursor: 'pointer',
                color: colors.textMuted,
                opacity: 0.6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Minimize"
            >
              <Minus size={14} />
            </button>
          )}
          {isMobile && <div style={{ width: 24 }} />}
        </div>
      )}

      {/* Plan Mode UI */}
      {planUIVisible && planState?.plan && height > (isMobile ? MOBILE_HEIGHTS.inputOnly : COLLAPSED_HEIGHT) && (
        <div
          ref={planContainerRef}
          className={`plan-container ${['completing', 'success', 'exiting', 'collapsing'].includes(planAnimation) ? planAnimation : ''}`}
          style={{
            borderBottom: planAnimation === 'collapsing' ? 'none' : `1px solid rgba(255,255,255,0.06)`,
            background: 'transparent',
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
              borderBottom: `1px solid rgba(255,255,255,0.06)`,
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
              const isSkipped = skippedGroups.includes(i);
              const isCompleted = i < planState.currentGroupIndex && !isSkipped;
              const isCurrent = i === planState.currentGroupIndex;
              const isPast = i < planState.currentGroupIndex;
              const canClick = isPast && onGoToGroup;

              return (
                <div
                  key={`${planVersion}-${group.id}`}
                  className="step-box"
                  onClick={() => canClick && onGoToGroup(i)}
                  style={{
                    flex: '0 0 auto',
                    minWidth: 140,
                    padding: '10px 12px',
                    background: isCurrent ? 'rgba(255,255,255,0.05)' : 'transparent',
                    border: `1px solid ${isCurrent ? colors.primary : isCompleted ? '#4CAF50' : isSkipped ? colors.textMuted : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 6,
                    opacity: isSkipped ? 0.5 : isCompleted ? 0.7 : 1,
                    transition: 'all 0.2s ease',
                    cursor: canClick ? 'pointer' : 'default'
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
                      background: isCompleted ? '#4CAF50' : isSkipped ? colors.textMuted : isCurrent ? colors.primary : 'transparent',
                      border: `2px solid ${isCompleted ? '#4CAF50' : isSkipped ? colors.textMuted : isCurrent ? colors.primary : 'rgba(255,255,255,0.2)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {isCompleted ? (
                        <Check size={10} color={colors.bg} strokeWidth={3} />
                      ) : isSkipped ? (
                        <SkipForward size={8} color={colors.bg} />
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
                      color: isSkipped ? colors.textMuted : isCompleted ? '#4CAF50' : isCurrent ? colors.primary : colors.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5
                    }}>
                      {isSkipped ? 'Skipped' : isCompleted ? 'Done' : isCurrent ? 'Current' : `Step ${i + 1}`}
                    </span>
                  </div>
                  {canClick && (
                    <p style={{
                      fontSize: 9,
                      color: colors.primary,
                      margin: '0 0 4px 0',
                      opacity: 0.7
                    }}>
                      Click to revise
                    </p>
                  )}

                  {/* Step description */}
                  <p style={{
                    fontSize: 12,
                    color: isCurrent ? colors.textPrimary : colors.textMuted,
                    margin: 0,
                    lineHeight: 1.4,
                    textDecoration: isSkipped ? 'line-through' : 'none'
                  }}>
                    {group.description}
                  </p>

                  {/* Action details preview */}
                  {group.actions && group.actions.length > 0 && (
                    <div style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: `1px solid rgba(255,255,255,0.06)`,
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

      {/* Messages Area - show when expanded beyond input-only height and not minimized */}
      {!isMinimized && height > (isMobile ? MOBILE_HEIGHTS.inputOnly : COLLAPSED_HEIGHT) && (
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
                  <div style={{ flex: 1 }}>
                    <MarkdownText
                      content={msg.content}
                      baseColor={
                        msg.type === 'execution_result' ? '#4CAF50' :
                        msg.type === 'error' ? '#ff6b6b' : colors.textSecondary
                      }
                    />
                    {/* Clickable view button if message created a view */}
                    {msg.viewConfig && onViewClick && (
                      <button
                        onClick={() => onViewClick(msg.viewConfig)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 8,
                          padding: '6px 12px',
                          background: 'transparent',
                          border: `1px solid rgba(255,255,255,0.1)`,
                          borderRadius: 4,
                          color: colors.primary,
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = colors.surface;
                          e.currentTarget.style.borderColor = colors.primary;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.borderColor = colors.border;
                        }}
                      >
                        <LayoutGrid size={12} />
                        Open "{msg.viewConfig.title}" view
                      </button>
                    )}
                    {/* Clickable navigation link if message has nav config */}
                    {msg.navConfig && onNavigate && !msg.viewConfig && (
                      <button
                        onClick={() => onNavigate(msg.navConfig.pageName, msg.navConfig.sectionName)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 8,
                          padding: '6px 12px',
                          background: 'transparent',
                          border: `1px solid rgba(255,255,255,0.1)`,
                          borderRadius: 4,
                          color: colors.primary,
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = colors.surface;
                          e.currentTarget.style.borderColor = colors.primary;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.borderColor = colors.border;
                        }}
                      >
                        → Go to {msg.navConfig.pageName}{msg.navConfig.sectionName ? `/${msg.navConfig.sectionName}` : ''}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator when processing */}
          {processing && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{ color: colors.primary, fontSize: 11, flexShrink: 0 }}>←</span>
              <div className="thinking-dots" style={{ display: 'flex', gap: 4, alignItems: 'center', height: 20 }}>
                <span className="dot dot-1" />
                <span className="dot dot-2" />
                <span className="dot dot-3" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Collapsed Indicator Bar - show when collapsed but has messages */}
      {!isMinimized && messages.length > 0 && height <= (isMobile ? MOBILE_HEIGHTS.inputOnly : COLLAPSED_HEIGHT) && (
        <button
          onClick={() => setHeight(isMobile ? MOBILE_HEIGHTS.small : AUTO_EXPAND_HEIGHT)}
          style={{
            width: '100%',
            padding: '8px 20px',
            background: 'transparent',
            border: 'none',
            borderBottom: `1px solid rgba(255,255,255,0.06)`,
            color: colors.textMuted,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: 'uppercase',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            flexShrink: 0
          }}
        >
          <span style={{ opacity: 0.6 }}>↑</span>
          Expand to view conversation
          <span style={{ opacity: 0.6 }}>↑</span>
        </button>
      )}

      {/* Input Area */}
      <div style={{
        padding: '12px 20px',
        borderTop: `1px solid rgba(255,255,255,0.06)`,
        background: 'transparent',
        flexShrink: 0,
        marginTop: 'auto'
      }}>
        {reviseMode ? (
          /* Revise mode - show text input for revision notes */
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleReviseCancel}
              style={{
                background: 'transparent',
                border: `1px solid rgba(255,255,255,0.1)`,
                color: colors.textMuted,
                padding: '6px 10px',
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              ← Back
            </button>
            <input
              ref={reviseInputRef}
              value={reviseInput}
              onChange={(e) => setReviseInput(e.target.value)}
              onKeyDown={handleReviseKeyDown}
              placeholder="Describe your revision..."
              style={{
                flex: 1,
                background: 'transparent',
                border: `1px solid rgba(255,255,255,0.1)`,
                borderRadius: 4,
                padding: '8px 12px',
                color: colors.textPrimary,
                fontSize: 13,
                outline: 'none'
              }}
            />
            <button
              onClick={handleReviseSubmit}
              disabled={!reviseInput.trim()}
              style={{
                background: reviseInput.trim() ? colors.primary : 'transparent',
                border: reviseInput.trim() ? 'none' : `1px solid ${colors.border}`,
                color: reviseInput.trim() ? colors.bg : colors.textMuted,
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: reviseInput.trim() ? 'pointer' : 'not-allowed',
                opacity: reviseInput.trim() ? 1 : 0.5
              }}
            >
              Send
            </button>
          </div>
        ) : actionButtons.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {actionButtons.map((btn, idx) => (
              <button
                key={idx}
                ref={el => buttonRefs.current[idx] = el}
                onClick={() => {
                  if (btn.value === 'revise') {
                    handleReviseClick();
                  } else {
                    onUserResponse(btn.value, pendingMessageIndex);
                  }
                }}
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
          <div style={{ display: 'flex', gap: isMobile ? 10 : 10, alignItems: 'center' }}>
            {/* Maximize button when minimized (desktop only) */}
            {isMinimized && !isMobile && (
              <button
                onClick={handleMinimize}
                style={{
                  background: 'transparent',
                  border: `1px solid rgba(255,255,255,0.1)`,
                  padding: 6,
                  cursor: 'pointer',
                  color: colors.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4
                }}
                title="Expand chat"
              >
                <Maximize2 size={12} />
              </button>
            )}
            {/* Voice Input - mobile only */}
            {isMobile && (
              <VoiceInput
                onTranscript={handleVoiceTranscript}
                disabled={false}
                isOnline={isOnline}
              />
            )}
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isMobile ? "Type or speak..." : (processing ? "Processing... (type next command)" : "Type a command...")}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: colors.textPrimary,
                fontSize: isMobile ? 16 : 13, // 16px prevents iOS zoom
                outline: 'none'
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              style={{
                background: 'transparent',
                border: `1px solid rgba(255,255,255,0.1)`,
                padding: isMobile ? 10 : 6,
                cursor: !inputValue.trim() ? 'not-allowed' : 'pointer',
                opacity: !inputValue.trim() ? 0.4 : 1,
                minWidth: isMobile ? 44 : 'auto',
                minHeight: isMobile ? 44 : 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Send size={isMobile ? 18 : 12} color={colors.textPrimary} />
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

        /* Thinking dots animation */
        @keyframes thinkingPulse {
          0%, 80%, 100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          40% {
            opacity: 1;
            transform: scale(1);
          }
        }

        .thinking-dots .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${colors.primary};
          animation: thinkingPulse 1.4s ease-in-out infinite;
        }

        .thinking-dots .dot-1 {
          animation-delay: 0s;
        }

        .thinking-dots .dot-2 {
          animation-delay: 0.2s;
        }

        .thinking-dots .dot-3 {
          animation-delay: 0.4s;
        }
      `}</style>
    </div>
  );
});

export default ChatPanel;
