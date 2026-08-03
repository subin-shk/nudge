/// <reference types="vite/client" />

/**
 * Ambient types for CSS Modules.
 *
 * Typed as an index signature rather than generated per-file: a build step that
 * emits a `.d.ts` beside every stylesheet would catch typo'd class names, but it
 * also has to run before typecheck and stay in sync. For a codebase this size the
 * trade is not worth the extra moving part.
 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css' {
  const content: string
  export default content
}
