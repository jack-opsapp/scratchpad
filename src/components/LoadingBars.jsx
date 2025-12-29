import { colors } from '../styles/theme.js';

/**
 * Animated loading indicator with vertical bars
 */
export function LoadingBars() {
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'end', height: 14 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div
          key={i}
          style={{
            width: 2,
            background: colors.textPrimary,
            borderRadius: 1,
            animation: `loadBar 0.8s ease-in-out ${i * 0.1}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export default LoadingBars;
