import { useState, useEffect } from 'react';

export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024
};

/**
 * Hook to detect screen size and responsive breakpoints
 */
export function useMediaQuery() {
  const [screenSize, setScreenSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    isMobile: typeof window !== 'undefined' ? window.innerWidth < BREAKPOINTS.mobile : false,
    isTablet: typeof window !== 'undefined' ? window.innerWidth >= BREAKPOINTS.mobile && window.innerWidth < BREAKPOINTS.tablet : false,
    isDesktop: typeof window !== 'undefined' ? window.innerWidth >= BREAKPOINTS.tablet : true
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      setScreenSize({
        width,
        height,
        isMobile: width < BREAKPOINTS.mobile,
        isTablet: width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet,
        isDesktop: width >= BREAKPOINTS.tablet
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return screenSize;
}

/**
 * Hook to detect mobile keyboard open/close
 */
export function useKeyboard() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // Only relevant on mobile
    if (typeof window === 'undefined' || window.innerWidth >= BREAKPOINTS.mobile) return;

    const handleResize = () => {
      if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        const diff = windowHeight - viewportHeight;

        if (diff > 100) {
          setKeyboardOpen(true);
          setKeyboardHeight(diff);
        } else {
          setKeyboardOpen(false);
          setKeyboardHeight(0);
        }
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      return () => window.visualViewport.removeEventListener('resize', handleResize);
    }
  }, []);

  return { keyboardOpen, keyboardHeight };
}

/**
 * Hook to detect online/offline status
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export default useMediaQuery;
