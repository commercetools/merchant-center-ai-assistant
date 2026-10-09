/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Animation phases for the typewriter effect
 */
type TypewriterPhase = 'initial' | 'typing' | 'paused' | 'deleting';

export interface UseTypewriterOptions {
  /** Array of phrases to cycle through */
  phrases: string[];
  /** Milliseconds per character when typing (default: 1000ms = 1s) */
  typingSpeed?: number;
  /** Milliseconds per character when deleting (default: 150ms) */
  deletingSpeed?: number;
  /** Milliseconds to pause when text is complete (default: 5000ms = 5s) */
  pauseDuration?: number;
  /** Milliseconds to wait before starting the first animation (default: 2000ms = 2s) */
  initialDelay?: number;
}

export interface UseTypewriterReturn {
  /** Current text to display */
  displayText: string;
  /** True when full phrase is shown and paused */
  isComplete: boolean;
  /** True when in deletion phase */
  isDeleting: boolean;
  /** True when in initial waiting phase */
  isWaiting: boolean;
}

/**
 * Get a random index from an array, optionally excluding a specific index
 */
const getRandomIndex = (length: number, excludeIndex?: number): number => {
  if (length <= 1) return 0;

  let newIndex: number;
  do {
    newIndex = Math.floor(Math.random() * length);
  } while (newIndex === excludeIndex);

  return newIndex;
};

/**
 * Custom hook for typewriter animation effect
 *
 * State machine:
 * 0. INITIAL: Wait initialDelay before starting
 * 1. TYPING: Add one character every typingSpeed ms
 * 2. PAUSED: When text complete, wait pauseDuration ms
 * 3. DELETING: Remove one character every deletingSpeed ms
 * 4. Back to TYPING with a new random phrase
 */
export const useTypewriter = ({
  phrases,
  typingSpeed = 1000,
  deletingSpeed = 150,
  pauseDuration = 5000,
  initialDelay = 2000,
}: UseTypewriterOptions): UseTypewriterReturn => {
  const [displayText, setDisplayText] = useState('');
  const [phase, setPhase] = useState<TypewriterPhase>('initial');
  const [phraseIndex, setPhraseIndex] = useState(() =>
    getRandomIndex(phrases.length)
  );

  // Use refs to track current state without causing effect re-runs
  const currentPhrase = phrases[phraseIndex];
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Handle initial phase (wait before starting)
  const handleInitial = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setPhase('typing');
    }, initialDelay);
  }, [initialDelay]);

  // Handle typing phase
  const handleTyping = useCallback(() => {
    if (displayText.length < currentPhrase.length) {
      // Add next character
      setDisplayText(currentPhrase.slice(0, displayText.length + 1));
    } else {
      // Typing complete, move to paused phase
      setPhase('paused');
    }
  }, [displayText, currentPhrase]);

  // Handle paused phase (text is complete)
  const handlePaused = useCallback(() => {
    // After pause duration, start deleting
    timeoutRef.current = setTimeout(() => {
      setPhase('deleting');
    }, pauseDuration);
  }, [pauseDuration]);

  // Handle deleting phase
  const handleDeleting = useCallback(() => {
    if (displayText.length > 0) {
      // Remove last character
      setDisplayText(displayText.slice(0, -1));
    } else {
      // Deleting complete, select new phrase and start typing
      setPhraseIndex((prev) => getRandomIndex(phrases.length, prev));
      setPhase('typing');
    }
  }, [displayText, phrases.length]);

  // Main effect to drive the animation
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    switch (phase) {
      case 'initial':
        handleInitial();
        break;
      case 'typing':
        timeoutRef.current = setTimeout(handleTyping, typingSpeed);
        break;
      case 'paused':
        handlePaused();
        break;
      case 'deleting':
        timeoutRef.current = setTimeout(handleDeleting, deletingSpeed);
        break;
    }
  }, [
    phase,
    displayText,
    typingSpeed,
    deletingSpeed,
    handleInitial,
    handleTyping,
    handlePaused,
    handleDeleting,
  ]);

  return {
    displayText,
    isComplete: phase === 'paused',
    isDeleting: phase === 'deleting',
    isWaiting: phase === 'initial',
  };
};
