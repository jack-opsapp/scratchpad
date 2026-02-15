import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square } from 'lucide-react';

const colors = {
  bg: '#000000',
  surface: '#0a0a0a',
  border: '#1a1a1a',
  primary: '#d1b18f',
  textPrimary: '#ffffff',
  textMuted: '#888888',
  recording: '#ff4444'
};

export default function VoiceInput({ onTranscript, onRecordingChange, onAudioData, disabled, isOnline }) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState(null);
  const [supported, setSupported] = useState(true);

  // Refs to avoid stale closures in recognition callbacks
  const isRecordingRef = useRef(false);
  const transcriptRef = useRef('');
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);

  // Keep refs in sync
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  // Notify parent of recording state changes
  useEffect(() => {
    onRecordingChange?.(isRecording);
  }, [isRecording, onRecordingChange]);

  // Auto-dismiss errors after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const stopAudioVisualization = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const doStop = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore - may already be stopped
      }
    }

    stopAudioVisualization();

    // Send transcript to parent using ref for current value
    const currentTranscript = transcriptRef.current;
    if (currentTranscript.trim()) {
      onTranscriptRef.current(currentTranscript.trim());
      setTranscript('');
    }
  }, [stopAudioVisualization]);

  // Create/re-create speech recognition instance
  const initRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptText = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptText + ' ';
        } else {
          interimTranscript += transcriptText;
        }
      }

      setTranscript(finalTranscript + interimTranscript);
    };

    recognition.onerror = (event) => {
      // "aborted" fires when we call .stop() - this is normal, not an error
      if (event.error === 'aborted' || event.error === 'no-speech') return;

      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setError('Microphone permission denied');
      } else {
        setError(event.error);
      }
      // Stop recording on real errors
      isRecordingRef.current = false;
      setIsRecording(false);
      stopAudioVisualization();
    };

    recognition.onend = () => {
      // Recognition ended - if we were still recording, clean up
      if (isRecordingRef.current) {
        doStop();
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [doStop, stopAudioVisualization]);

  // Initialize speech recognition on mount
  useEffect(() => {
    initRecognition();
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore
        }
      }
      stopAudioVisualization();
    };
  }, [initRecognition, stopAudioVisualization]);

  // Audio level visualization
  const startAudioVisualization = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);

      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 1024;

      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const updateLevel = () => {
        if (!analyserRef.current) return;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(Math.min(100, average / 2.55));

        const barCount = 32;
        const step = Math.floor(dataArray.length / barCount);
        const waveformData = [];
        for (let i = 0; i < barCount; i++) {
          const start = i * step;
          let sum = 0;
          for (let j = start; j < start + step && j < dataArray.length; j++) {
            sum += dataArray[j];
          }
          waveformData.push(sum / step / 255);
        }
        onAudioData?.(waveformData);

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.error('Audio visualization error:', err);
    }
  };

  const startRecording = async () => {
    if (disabled) return;

    setTranscript('');
    setError(null);
    setIsRecording(true);
    isRecordingRef.current = true;

    // Re-create recognition if it doesn't exist or is in a bad state
    if (!recognitionRef.current) {
      initRecognition();
    }

    try {
      recognitionRef.current.start();
      await startAudioVisualization();
    } catch (err) {
      console.error('Start recording error:', err);
      // Re-create recognition for next attempt
      initRecognition();
      setError('Could not start recording');
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  const handleClick = () => {
    if (isRecording) {
      doStop();
    } else {
      startRecording();
    }
  };

  if (!supported) {
    return null;
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={handleClick}
        disabled={disabled}
        aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
        title={isOnline ? 'Voice input' : 'Voice input (offline - basic parsing only)'}
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: isRecording ? colors.recording : colors.primary,
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.2s ease',
          position: 'relative',
          flexShrink: 0,
          boxShadow: isRecording ? '0 0 20px rgba(255,68,68,0.4)' : '0 2px 8px rgba(0,0,0,0.3)'
        }}
      >
        {isRecording ? (
          <Square size={16} color="#fff" fill="#fff" />
        ) : (
          <Mic size={20} color={colors.bg} />
        )}
      </button>

      {/* Audio level indicator (pulsing ring) */}
      {isRecording && (
        <div
          style={{
            position: 'absolute',
            top: -4,
            left: -4,
            right: -4,
            bottom: -4,
            borderRadius: '50%',
            border: `3px solid ${colors.recording}`,
            opacity: audioLevel / 100,
            transform: `scale(${1 + audioLevel / 150})`,
            transition: 'all 0.1s ease',
            pointerEvents: 'none'
          }}
        />
      )}

      {/* Live transcript preview */}
      {isRecording && transcript && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 8,
            padding: '8px 12px',
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            fontSize: 13,
            color: colors.textPrimary,
            maxWidth: 250,
            wordWrap: 'break-word',
            whiteSpace: 'pre-wrap',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            zIndex: 100
          }}
        >
          {transcript}
        </div>
      )}

      {/* Error message - click to dismiss */}
      {error && (
        <div
          onClick={() => setError(null)}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 8,
            padding: '6px 10px',
            background: colors.recording,
            borderRadius: 4,
            fontSize: 11,
            color: '#fff',
            whiteSpace: 'nowrap',
            zIndex: 100,
            cursor: 'pointer'
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
