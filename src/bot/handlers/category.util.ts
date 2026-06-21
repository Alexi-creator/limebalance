// Prefix a category label with its emoji (set via the web cabinet), when present.
export const withEmoji = (name: string, emoji?: string | null) =>
  emoji ? `${emoji} ${name}` : name;
