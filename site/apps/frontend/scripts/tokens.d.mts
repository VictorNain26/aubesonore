/** The tokens of one scheme, by name without its leading `--`. */
export type Tokens = Record<string, string>;

export function blockAfter(css: string, from: number): string;
export function declarations(text: string): Tokens;
export function readSchemes(css: string): { day: Tokens; night: Tokens; barLight: Tokens };
