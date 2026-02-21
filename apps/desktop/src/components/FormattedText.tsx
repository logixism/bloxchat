import React from "react";
import { replaceEmojiShortcodes } from "../lib/emoji";
import { useAuth } from "../contexts/AuthContext";

interface FormattedTextProps {
  content: string;
  username: string;
  imageUrls: string[];
}

export const FormattedText = ({
  content,
  username,
  imageUrls,
}: FormattedTextProps) => {
  const { user } = useAuth();

  const normalizedContent = replaceEmojiShortcodes(content);
  const regex = /(@\w+)|https?:\/\/[^\s]+/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalizedContent)) !== null) {
    const [matchedText] = match;
    const start = match.index;

    if (start > lastIndex) {
      parts.push(
        <span key={lastIndex} className="text-muted-foreground">
          {normalizedContent.slice(lastIndex, start)}
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
          className="text-blue-500 underline"
        >
          {matchedText}
        </a>,
      );
    } else if (matchedText.startsWith("@")) {
      const isSelf = matchedText.slice(1) === user?.name;
      parts.push(
        <span
          key={start}
          className={`font-semibold ${isSelf ? "text-amber-500" : "text-blue-300"}`}
        >
          {matchedText}
        </span>,
      );
    }

    lastIndex = start + matchedText.length;
  }

  if (lastIndex < normalizedContent.length) {
    parts.push(
      <span key={lastIndex} className="text-muted-foreground">
        {normalizedContent.slice(lastIndex)}
      </span>,
    );
  }

  return <>{parts}</>;
};
