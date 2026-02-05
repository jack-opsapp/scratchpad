import { useState, useCallback, useRef } from 'react';

const MAX_MESSAGES = 100; // Before compacting

export default function useChatState() {
  const [messages, setMessages] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [messageQueue, setMessageQueue] = useState([]);
  const contextWindowRef = useRef(0);
  const processingRef = useRef(false); // For immediate access without re-render

  // Add user message
  const addUserMessage = useCallback((content) => {
    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        content,
        timestamp: Date.now()
      }
    ]);
  }, []);

  // Add agent message
  const addAgentMessage = useCallback((content, type = 'text_response', metadata = {}) => {
    setMessages(prev => [
      ...prev,
      {
        role: 'agent',
        content,
        type,
        timestamp: Date.now(),
        responded: false,
        ...metadata
      }
    ]);
  }, []);

  // Add system message
  const addSystemMessage = useCallback((content) => {
    setMessages(prev => [
      ...prev,
      {
        role: 'system',
        content,
        timestamp: Date.now()
      }
    ]);
  }, []);

  // Mark message as responded (for confirmations/clarifications)
  const markMessageResponded = useCallback((messageIndex) => {
    setMessages(prev => prev.map((msg, i) =>
      i === messageIndex ? { ...msg, responded: true } : msg
    ));
  }, []);

  // Compact history when context limit reached
  const compactHistory = useCallback(() => {
    setMessages(prev => {
      if (prev.length < MAX_MESSAGES) return prev;

      // Keep last 20 messages, summarize rest
      const keep = prev.slice(-20);
      const toSummarize = prev.slice(0, -20);

      // Create summary message
      const summary = `[Previous ${toSummarize.length} messages summarized]`;

      contextWindowRef.current++;

      return [
        { role: 'system', content: summary, timestamp: Date.now() },
        ...keep
      ];
    });
  }, []);

  // Check if should compact
  const checkCompact = useCallback(() => {
    if (messages.length >= MAX_MESSAGES) {
      compactHistory();
    }
  }, [messages.length, compactHistory]);

  // Clear all history
  const clearHistory = useCallback(() => {
    setMessages([]);
    contextWindowRef.current = 0;
  }, []);

  // Get recent context for agent
  const getRecentContext = useCallback((count = 10) => {
    return messages.slice(-count).map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }, [messages]);

  // Queue management
  const addToQueue = useCallback((message, confirmedValue = null) => {
    setMessageQueue(prev => [...prev, { message, confirmedValue }]);
  }, []);

  const getNextFromQueue = useCallback(() => {
    let next = null;
    setMessageQueue(prev => {
      if (prev.length === 0) return prev;
      next = prev[0];
      return prev.slice(1);
    });
    return next;
  }, []);

  const clearQueue = useCallback(() => {
    setMessageQueue([]);
  }, []);

  // Wrapped setProcessing that also updates ref
  const setProcessingState = useCallback((value) => {
    processingRef.current = value;
    setProcessing(value);
  }, []);

  // Check if currently processing (immediate, no re-render)
  const isProcessing = useCallback(() => {
    return processingRef.current;
  }, []);

  return {
    messages,
    processing,
    setProcessing: setProcessingState,
    isProcessing,
    messageQueue,
    queueLength: messageQueue.length,
    addToQueue,
    getNextFromQueue,
    clearQueue,
    addUserMessage,
    addAgentMessage,
    addSystemMessage,
    markMessageResponded,
    checkCompact,
    clearHistory,
    getRecentContext,
    contextWindowCount: contextWindowRef.current
  };
}
