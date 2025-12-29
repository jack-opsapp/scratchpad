import { useState, useEffect } from 'react';

/**
 * Typewriter effect hook
 *
 * Animates text appearing one character at a time for a typing effect.
 *
 * @param {string} text - The full text to display
 * @param {number} speed - Milliseconds between characters (default: 40)
 * @param {number} startDelay - Delay before starting animation (default: 0)
 * @param {boolean} enabled - Whether animation is enabled (default: true)
 * @returns {{ displayed: string, done: boolean }} Current displayed text and completion status
 *
 * @example
 * const title = useTypewriter('Hello World', 50);
 * return <h1>{title.displayed}{!title.done && '_'}</h1>;
 */
export function useTypewriter(text, speed = 40, startDelay = 0, enabled = true) {
  const [displayed, setDisplayed] = useState(enabled ? '' : text);
  const [done, setDone] = useState(!enabled);

  useEffect(() => {
    // If disabled, show full text immediately
    if (!enabled) {
      setDisplayed(text);
      setDone(true);
      return;
    }

    // Reset state for new text
    setDisplayed('');
    setDone(false);

    // Start after delay
    const timeout = setTimeout(() => {
      let currentIndex = 0;

      const interval = setInterval(() => {
        if (currentIndex < text.length) {
          setDisplayed(text.slice(0, currentIndex + 1));
          currentIndex++;
        } else {
          setDone(true);
          clearInterval(interval);
        }
      }, speed);

      return () => clearInterval(interval);
    }, startDelay);

    return () => clearTimeout(timeout);
  }, [text, speed, startDelay, enabled]);

  return { displayed, done };
}

export default useTypewriter;
