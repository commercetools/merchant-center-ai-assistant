/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Agentation, saveAnnotations, type Annotation } from 'agentation';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { Box, useColorMode } from '@commercetools/nimbus';
import { useComposePreviewContext } from '../../contexts/compose-preview-context';
import { useSession } from '../../contexts/session';
import type { TabId } from '../shell/view-tabs';
import {
  buildAnnotationMessage,
  type AnnotationRecord,
} from './build-annotation-payload';
import { seedAgentationDefaults } from './seed-agentation-defaults';
import { useAgentationTheme } from './use-agentation-theme';
import { useAnnotationScope } from './use-annotation-scope';
import { useFeedbackModeSync } from './use-feedback-mode-sync';

type TPreviewAnnotationsProps = {
  /** The rendered page. Nothing outside it can be annotated - see `use-annotation-scope`. */
  scopeRef: RefObject<HTMLElement | null>;
  isActive: boolean;
  /** Send switches to the conversation so the answer is watched as it streams. */
  onTabChange: (tab: TabId) => void;
  /** Disarms the mode once the notes are on their way. */
  onDone: () => void;
};

/**
 * Agentation over the composed page preview.
 *
 * Everything the package cannot do for us lives behind this one seam: confining selection
 * to the preview (`use-annotation-scope`), tying a picked node back to the schema component
 * that rendered it, recolouring the toolbar (`use-agentation-theme`), and turning the
 * result into a message the assistant can act on (`build-annotation-payload`).
 *
 * The toolbar is mounted only while the mode is armed. That is not an optimisation: while
 * it is up, the rest of the application is intentionally inert, so it must not be up a
 * moment longer than the user asked for.
 */
const PreviewAnnotations = ({
  scopeRef,
  isActive,
  onTabChange,
  onDone,
}: TPreviewAnnotationsProps) => {
  const { previewData } = useComposePreviewContext();
  const { queuePrompt } = useSession();
  const { colorMode } = useColorMode();
  const isDark = colorMode === 'dark';

  const probeRef = useRef<HTMLDivElement>(null);
  const seededRef = useRef(false);

  const { takePicks } = useAnnotationScope(scopeRef, isActive);
  useAgentationTheme(probeRef, isActive);
  useFeedbackModeSync(isActive, onDone);

  /*
   * Agentation persists annotations per `location.pathname`, and every chat session in this
   * app lives at the SAME path - the session id is state, not a route. Left alone, notes
   * written about one generated page would reappear as markers over the next one, pointing
   * at elements that no longer exist. The store is cleared whenever the previewed page
   * changes; the toolbar is unmounted at that moment (see `ComposePreview`), so there is no
   * live component holding a stale copy.
   */
  const previewUri = previewData?.uri;
  useEffect(() => {
    clearStoredAnnotations();
  }, [previewUri]);

  /**
   * Which schema component each annotation landed on, by annotation id.
   *
   * A ref rather than state: nothing renders from it, and Agentation calls back on every
   * keystroke-committed edit - re-rendering the toolbar's host on each one would be waste.
   */
  const recordsRef = useRef(new Map<string, AnnotationRecord>());

  /*
   * Seeded during render rather than in an effect, deliberately.
   *
   * Agentation reads `localStorage` from a `useState` initialiser, which runs while it
   * renders - in the very same commit that mounts it. An effect of ours would fire after
   * that, so the first session of every browser would get the vendor's defaults and only
   * later runs would get ours. The write is idempotent and guarded by the ref.
   */
  if (isActive && !seededRef.current) {
    seededRef.current = true;
    seedAgentationDefaults(isDark);
  }

  const handleAnnotationAdd = useCallback(
    (annotation: Annotation) => {
      /*
       * Agentation reports the finished annotation but not the element it is attached to,
       * and `elementPath` is a readable path rather than a selector we can resolve back. So
       * the clicks that led here are claimed instead - see `takePicks`.
       */
      const componentNames = [
        ...new Set(
          takePicks()
            .map((pick) => pick.componentName)
            .filter((name): name is string => Boolean(name))
        ),
      ];

      recordsRef.current.set(annotation.id, { annotation, componentNames });
    },
    [takePicks]
  );

  const handleAnnotationUpdate = useCallback((annotation: Annotation) => {
    const existing = recordsRef.current.get(annotation.id);
    recordsRef.current.set(annotation.id, {
      annotation,
      componentNames: existing?.componentNames ?? [],
    });
  }, []);

  const handleAnnotationDelete = useCallback((annotation: Annotation) => {
    recordsRef.current.delete(annotation.id);
  }, []);

  const handleAnnotationsClear = useCallback(() => {
    recordsRef.current.clear();
  }, []);

  const handleSubmit = useCallback(
    (_output: string, annotations: Annotation[]) => {
      /*
       * Agentation's own markdown (`_output`) is discarded. It is written for an agent with
       * a repository to grep, and a composed page has none - `build-annotation-payload`
       * says what is true here instead.
       *
       * Every annotation is forwarded without a scope re-check. There is nothing to
       * re-check: the guard swallows `mousedown` outside the preview before Agentation
       * sees it, so an out-of-scope annotation cannot be created in the first place, and a
       * drag that leaves the preview stops updating at the boundary for the same reason.
       */
      const records = annotations.map(
        (annotation) =>
          recordsRef.current.get(annotation.id) ?? {
            annotation,
            componentNames: [],
          }
      );

      const { text, part } = buildAnnotationMessage(
        records,
        previewData?.schema
      );
      queuePrompt(text, { autoSend: true, parts: [part] });

      recordsRef.current.clear();
      clearStoredAnnotations();
      onTabChange('assistant');
      onDone();
    },
    [queuePrompt, previewData?.schema, onTabChange, onDone]
  );

  return (
    <>
      {/*
       * Live Nimbus colours for `use-agentation-theme` to read.
       *
       * Chakra generates the `--nimbus-*` variable names at runtime and the prefix is not
       * public, so the values are taken off painted elements rather than looked up by name.
       * Zero-sized, so it costs no layout and Agentation's own minimum-size rule keeps it
       * from ever being picked as a target.
       */}
      <Box
        ref={probeRef}
        aria-hidden
        position="absolute"
        width="0"
        height="0"
        overflow="hidden"
        pointerEvents="none"
      >
        <Box data-nimbus-token="accent" color="primary.9" />
        <Box data-nimbus-token="info" color="info.9" />
        <Box data-nimbus-token="positive" color="positive.9" />
        <Box data-nimbus-token="warning" color="warning.9" />
        <Box data-nimbus-token="critical" color="critical.9" />
      </Box>

      {isActive && (
        <Agentation
          appName="AI Assistant preview"
          onAnnotationAdd={handleAnnotationAdd}
          onAnnotationUpdate={handleAnnotationUpdate}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationsClear={handleAnnotationsClear}
          onSubmit={handleSubmit}
          /*
           * Supplying a list REPLACES the package's defaults, which is what we want:
           * `data-ct-component` is the only attribute on a composed page that means
           * anything, and it is stamped per schema component by `utils/babel-renderer`.
           */
          identifyingAttributes={['data-ct-component']}
          /*
           * Its shortcuts are bound on `document` and would collide with the Merchant
           * Center's and Nimbus's. The popup's own Enter and Escape still work.
           */
          enableKeyboardShortcuts={false}
        />
      )}
    </>
  );
};

/**
 * Empty Agentation's own store for the current path.
 *
 * `saveAnnotations` is the package's exported writer and uses the same key its reader does,
 * so this stays correct if the key format changes.
 */
function clearStoredAnnotations() {
  try {
    saveAnnotations(window.location.pathname, []);
  } catch {
    // Storage unavailable. Agentation degrades to in-memory notes, which is the state we
    // were trying to reach anyway.
  }
}

export default PreviewAnnotations;
