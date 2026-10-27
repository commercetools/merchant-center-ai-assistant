/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { TransformOptions } from '@babel/core';

/** A single transpile may take this long before the tool answers with an error. */
export const TRANSPILE_TIMEOUT_MS = 10_000;

type BabelModule = typeof import('@babel/core');

let babel: BabelModule | undefined;
type Transform = (code: string) => Promise<{ code?: string | null } | null>;
let transformOverride: Transform | undefined;

/** Test hook: replace the Babel call (a CPU-bound real transform cannot be interrupted). */
export const setTransformForTests = (
  transform: Transform | undefined
): void => {
  transformOverride = transform;
};
let presetReact: NonNullable<TransformOptions['presets']>[number] | undefined;

/** True once the first call has loaded Babel (Babel costs ~90 MB and ~370 ms cold). */
export const isBabelLoaded = (): boolean => babel !== undefined;

/** Test hook: forget the loaded Babel so the lazy path can be exercised again. */
export const resetBabelForTests = (): void => {
  transformOverride = undefined;
  babel = undefined;
  presetReact = undefined;
};

const load = async (): Promise<BabelModule> => {
  if (!babel) {
    const core = (await import('@babel/core')) as BabelModule & {
      default?: BabelModule;
    };
    // CommonJS interop: under ESM the functions can sit on `default`.
    babel = typeof core.transformAsync === 'function' ? core : core.default;
    if (!babel) throw new Error('@babel/core could not be loaded');
    // A variable specifier: the package ships no type declarations.
    const presetName = '@babel/preset-react';
    const preset = (await import(presetName)) as {
      default?: unknown;
    };
    presetReact = (preset.default ?? preset) as typeof presetReact;
  }
  return babel;
};

/**
 * The script the frontends evaluate: the function, then its name as an expression
 * statement so `new Function(...scope, script)` can return the component.
 */
export const wrapInNamedComponent = (name: string, body: string): string =>
  `\nfunction ${name}({ renderData, dispatchUIAction }) {\n${body}\n}\n${name};\n`;

export type TranspileResult =
  { success: true; code: string } | { success: false; error: string };

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Transpilation timed out after ${ms} ms`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

export const transpileComponent = async (
  name: string,
  body: string,
  timeoutMs: number = TRANSPILE_TIMEOUT_MS
): Promise<TranspileResult> => {
  try {
    const core = await load();
    const wrapped = wrapInNamedComponent(name, body);
    const run: Transform =
      transformOverride ??
      ((code) =>
        core.transformAsync(code, {
          presets: [[presetReact as never, { runtime: 'classic' }]],
          filename: `${name}.jsx`,
          sourceType: 'script',
          // The repo's own Babel configuration must never leak into model code.
          babelrc: false,
          configFile: false,
          compact: false,
        }));
    const result = await withTimeout(run(wrapped), timeoutMs);
    if (!result?.code) {
      return {
        success: false,
        error: `Babel returned an empty result for "${name}"`,
      };
    }
    return { success: true, code: result.code };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Transpilation of "${name}" failed: ${message}`,
    };
  }
};
