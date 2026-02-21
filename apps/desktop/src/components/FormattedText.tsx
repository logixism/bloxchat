import React from "react";
import { replaceEmojiShortcodes } from "../lib/emoji";
import { useAuth } from "../contexts/AuthContext";

interface FormattedTextProps {
  content: string;
  imageUrls: string[];
  tone?: "default" | "error";
}

const isAsciiWordChar = (ch: string) => /[A-Za-z0-9]/.test(ch);

const canOpenUnderscore = (text: string, index: number) => {
  const prev = index > 0 ? text[index - 1] : "";
  const next = index + 1 < text.length ? text[index + 1] : "";
  if (!next || /\s/.test(next)) return false;
  if (isAsciiWordChar(prev) && isAsciiWordChar(next)) return false;
  return true;
};

const canCloseUnderscore = (text: string, index: number) => {
  const prev = index > 0 ? text[index - 1] : "";
  const next = index + 1 < text.length ? text[index + 1] : "";
  if (!prev || /\s/.test(prev)) return false;
  if (isAsciiWordChar(prev) && isAsciiWordChar(next)) return false;
  return true;
};

const findClosingUnderscore = (text: string, from: number) => {
  for (let i = from; i < text.length; i++) {
    if (text[i] !== "_") continue;
    if (i > 0 && text[i - 1] === "\\") continue;
    if (!canCloseUnderscore(text, i)) continue;
    return i;
  }
  return -1;
};

const findClosingTildePair = (text: string, from: number) => {
  let i = from;
  while (i < text.length - 1) {
    const idx = text.indexOf("~~", i);
    if (idx === -1) return -1;
    if (idx > 0 && text[idx - 1] === "\\") {
      i = idx + 2;
      continue;
    }
    return idx;
  }
  return -1;
};

const isValidDelimited = (inner: string) => {
  if (!inner) return false;
  if (inner.startsWith(" ") || inner.endsWith(" ")) return false;
  if (inner.includes("\n")) return false;
  return true;
};

const renderInlineFormatting = (
  text: string,
  keyPrefix: string,
): React.ReactNode[] => {
  const out: React.ReactNode[] = [];
  let buffer = "";
  let i = 0;
  let keyIndex = 0;

  const flush = () => {
    if (!buffer) return;
    out.push(buffer);
    buffer = "";
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === "\\" && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === "_" || next === "~" || next === "\\") {
        buffer += next;
        i += 2;
        continue;
      }
    }

    if (text.startsWith("~~", i)) {
      const end = findClosingTildePair(text, i + 2);
      if (end !== -1) {
        const inner = text.slice(i + 2, end);
        if (isValidDelimited(inner)) {
          flush();
          out.push(
            <s key={`${keyPrefix}-s${keyIndex++}`}>
              {renderInlineFormatting(inner, `${keyPrefix}-s${keyIndex}`)}
            </s>,
          );
          i = end + 2;
          continue;
        }
      }
    }

    if (ch === "_" && canOpenUnderscore(text, i)) {
      const end = findClosingUnderscore(text, i + 1);
      if (end !== -1) {
        const inner = text.slice(i + 1, end);
        if (isValidDelimited(inner)) {
          flush();
          out.push(
            <em key={`${keyPrefix}-e${keyIndex++}`}>
              {renderInlineFormatting(inner, `${keyPrefix}-e${keyIndex}`)}
            </em>,
          );
          i = end + 1;
          continue;
        }
      }
    }

    buffer += ch;
    i += 1;
  }

  flush();
  return out;
};

export const FormattedText = ({
  content,
  imageUrls,
  tone = "default",
}: FormattedTextProps) => {
  const { user } = useAuth();
  const toneClasses =
    tone === "error"
      ? {
          text: "text-red-400",
          link: "text-red-400 underline",
          mentionSelf: "text-red-400",
          mentionOther: "text-red-400",
        }
      : {
          text: "text-muted-foreground",
          link: "text-blue-500 underline",
          mentionSelf: "text-amber-500",
          mentionOther: "text-blue-300",
        };

  const normalizedContent = replaceEmojiShortcodes(content);
  const regex = /(@\w+)|https?:\/\/[^\s]+/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalizedContent)) !== null) {
    const [matchedText] = match;
    const start = match.index;

    if (start > lastIndex) {
      const text = normalizedContent.slice(lastIndex, start);
      parts.push(
        <span key={lastIndex} className={toneClasses.text}>
          {renderInlineFormatting(text, `t-${lastIndex}`)}
        </span>,
      );
    }

    if (imageUrls.includes(matchedText)) {
      lastIndex = start + matchedText.length;
      continue;
    }

    if (matchedText.startsWith("http")) {
      parts.push(
        <a
          key={start}
          href={matchedText}
          target="_blank"
          rel="noopener noreferrer"
          className={toneClasses.link}
        >
          {matchedText}
        </a>,
      );
    } else if (matchedText.startsWith("@")) {
      const isSelf = matchedText.slice(1) === user?.username;
      parts.push(
        <span
          key={start}
          className={`font-semibold ${isSelf ? toneClasses.mentionSelf : toneClasses.mentionOther}`}
        >
          {matchedText}
        </span>,
      );
    }

    lastIndex = start + matchedText.length;
  }

  if (lastIndex < normalizedContent.length) {
    const text = normalizedContent.slice(lastIndex);
    parts.push(
      <span key={lastIndex} className={toneClasses.text}>
        {renderInlineFormatting(text, `t-${lastIndex}`)}
      </span>,
    );
  }

  return <>{parts}</>;
};
