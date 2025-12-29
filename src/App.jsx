import { useState } from 'react';
import { SignedOutScreen, MainApp } from './screens/index.js';

/**
 * Root application component
 * Handles authentication state and screen routing
 */
export function App() {
  const [signedIn, setSignedIn] = useState(false);

  if (!signedIn) {
    return <SignedOutScreen onSignIn={() => setSignedIn(true)} />;
  }

  return <MainApp onSignOut={() => setSignedIn(false)} />;
}

export default App;
