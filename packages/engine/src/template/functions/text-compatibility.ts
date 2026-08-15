const createEmojiShortcodes = (): Map<string, string> => {
  const result = new Map<string, string>();
  result.set("heart", "❤️");
  result.set("red_heart", "❤️");
  result.set("smile", "😄");
  result.set("grinning", "😀");
  result.set("joy", "😂");
  result.set("tada", "🎉");
  result.set("rocket", "🚀");
  result.set("warning", "⚠️");
  result.set("wave", "👋");
  result.set("fire", "🔥");
  result.set("sparkles", "✨");
  return result;
};

const emojiByShortcode = createEmojiShortcodes();

const isAsciiLetterOrDigit = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
};

const isAsciiWhitespace = (character: string): boolean =>
  character === " " || character === "\t" || character === "\n" || character === "\r";

export const anchorizeText = (input: string): string => {
  const lower = input.toLowerCase();
  const result: string[] = [];
  for (let index = 0; index < lower.length; index++) {
    const character = lower[index]!;
    if (isAsciiWhitespace(character)) {
      result.push("-");
      continue;
    }
    if (
      isAsciiLetterOrDigit(character) ||
      character === "-" ||
      character === "_" ||
      character.charCodeAt(0) >= 128
    ) {
      result.push(character);
    }
  }
  return result.join("");
};

export const emojifyText = (input: string): string => {
  const result: string[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const opening = input.indexOf(":", cursor);
    if (opening < 0) {
      result.push(input.substring(cursor));
      break;
    }
    result.push(input.substring(cursor, opening));
    const closing = input.indexOf(":", opening + 1);
    if (closing < 0) {
      result.push(input.substring(opening));
      break;
    }
    const shortcode = input.substring(opening + 1, closing);
    const emoji = emojiByShortcode.get(shortcode);
    if (emoji === undefined) result.push(input.substring(opening, closing + 1));
    else result.push(emoji);
    cursor = closing + 1;
  }
  return result.join("");
};
