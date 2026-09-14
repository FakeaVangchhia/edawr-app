/// <reference types="nativewind/types" />

/**
 * `app/_layout.tsx` imports `../global.css` for its Tailwind directives, and
 * TypeScript 6 rejects a side-effect import whose target has no type
 * declaration at all (TS2882). Metro resolves the file through NativeWind's
 * transformer, so the import is real — it is only the *type* that was missing.
 *
 * NativeWind's own `types.d.ts` stops at the JSX props and never declared the
 * stylesheet itself, which cost nothing until TS 6 turned it into an error.
 * Declaring it here rather than patching the package keeps it with the rest of
 * this project's ambient types, and it can go when NativeWind ships its own.
 */
declare module '*.css';
