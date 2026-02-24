import { useState, useRef, useEffect } from 'react';
import { Send, ArrowRight } from 'lucide-react';
import { colors } from '../styles/theme.js';

const TIPS = [
  { key: 'prefix', text: 'Type -pagename/section: to route notes anywhere' },
  { key: 'wiki', text: 'Type [[ to link notes together' },
  { key: 'shift', text: 'Shift+Up/Down to cycle through recent destinations' },
  { key: 'break', text: 'Type --- Label to create section breaks' },
];

/**
 * Welcome onboarding for first-time users.
 * Shows when user has zero pages. Interactive demo input creates
 * their first page + section + note, then transitions to the full app.
 */
export function WelcomeOnboarding({ onCreateFirst, userName }) {
  const [step, setStep] = useState(0); // 0 = welcome, 1 = input, 2 = done
  const [inputValue, setInputValue] = useState('');
  const [visibleTips, setVisibleTips] = useState(0);
  const inputRef = useRef(null);

  // Stagger tips on mount
  useEffect(() => {
    if (step === 1) {
      const timer = setInterval(() => {
        setVisibleTips(prev => {
          if (prev >= TIPS.length) { clearInterval(timer); return prev; }
          return prev + 1;
        });
      }, 400);
      return () => clearInterval(timer);
    }
  }, [step]);

  // Auto-focus input
  useEffect(() => {
    if (step === 1) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [step]);

  const handleSubmit = () => {
    if (!inputValue.trim()) return;
    onCreateFirst(inputValue.trim());
    setStep(2);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      minHeight: 500,
      padding: '40px 24px',
      fontFamily: "'Manrope', sans-serif",
    }}>
      {/* Step 0: Welcome */}
      {step === 0 && (
        <div style={{
          textAlign: 'center',
          maxWidth: 400,
          animation: 'fadeSlideUp 0.5s ease',
        }}>
          <h1 style={{
            color: colors.textPrimary,
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: -1,
            marginBottom: 12,
          }}>
            Welcome{userName ? `, ${userName.split(' ')[0]}` : ''}
          </h1>
          <p style={{
            color: colors.textMuted,
            fontSize: 14,
            lineHeight: 1.6,
            marginBottom: 40,
          }}>
            Slate organizes your thoughts automatically.
            Just type — we handle the rest.
          </p>
          <button
            onClick={() => setStep(1)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 28px',
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              fontSize: 14,
              fontWeight: 500,
              fontFamily: "'Manrope', sans-serif",
              cursor: 'pointer',
              transition: 'border-color 0.15s ease',
            }}
          >
            Try it
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Step 1: Demo input */}
      {step === 1 && (
        <div style={{
          width: '100%',
          maxWidth: 480,
          animation: 'fadeSlideUp 0.4s ease',
        }}>
          <p style={{
            color: colors.textMuted,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            marginBottom: 16,
            textAlign: 'center',
          }}>
            TYPE YOUR FIRST THOUGHT
          </p>

          {/* Input area */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 16px',
            border: `1px solid ${colors.border}`,
            borderRadius: 2,
            background: colors.surface,
            transition: 'border-color 0.15s ease',
          }}>
            <input
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder="e.g. Research competitor pricing this week"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: colors.textPrimary,
                fontSize: 14,
                fontFamily: "'Manrope', sans-serif",
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              style={{
                background: 'none',
                border: 'none',
                color: inputValue.trim() ? colors.primary : colors.textMuted,
                cursor: inputValue.trim() ? 'pointer' : 'default',
                padding: 4,
                display: 'flex',
                transition: 'color 0.15s ease',
              }}
            >
              <Send size={16} />
            </button>
          </div>

          {/* Tips */}
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TIPS.map((tip, i) => (
              <div
                key={tip.key}
                style={{
                  opacity: i < visibleTips ? 1 : 0,
                  transform: i < visibleTips ? 'translateY(0)' : 'translateY(8px)',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: colors.primary,
                  opacity: 0.6,
                  flexShrink: 0,
                }} />
                <span style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  lineHeight: 1.4,
                }}>
                  {tip.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Transition (brief flash before app loads) */}
      {step === 2 && (
        <div style={{
          textAlign: 'center',
          animation: 'fadeSlideUp 0.3s ease',
        }}>
          <p style={{
            color: colors.primary,
            fontSize: 14,
            fontWeight: 500,
          }}>
            Setting up your workspace...
          </p>
        </div>
      )}

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default WelcomeOnboarding;
