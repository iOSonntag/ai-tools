import { readFileSync } from 'node:fs';

export type HookInputLoad = { isLoaded: true; hookInput: unknown } | { isLoaded: false; error: string };

/** Reads and parses the JSON a hook receives on stdin. Never throws. */
export function loadHookInput(): HookInputLoad
{
  try
  {
    return { isLoaded: true, hookInput: JSON.parse(readFileSync(0, 'utf8')) };
  }
  catch (error)
  {
    return { isLoaded: false, error: error instanceof Error ? error.message : String(error) };
  }
}
