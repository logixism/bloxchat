import type { ChatMessage, JwtUser } from "@bloxchat/api";

type MentionableMessage =
  | string
  | Pick<ChatMessage, "content">
  | null
  | undefined;

type MentionableUser = Pick<JwtUser, "username"> | null | undefined;

const toContent = (message: MentionableMessage) => {
  if (!message) return "";
  return typeof message === "string" ? message : message.content;
};

const hasMention = (content: string, mention: string) => {
  if (!mention) return false;

  for (const match of content.matchAll(/@(\w+)/g)) {
    if (match[1] === mention) {
      return true;
    }
  }

  return false;
};

export const isUserMentioned = (
  message: MentionableMessage,
  user?: MentionableUser,
) => {
  return hasMention(toContent(message), user?.username ?? "");
};

export const isMentioned = (
  message: MentionableMessage,
  user?: MentionableUser,
) => {
  const content = toContent(message);
  if (!content) return false;

  return hasMention(content, "everyone") || isUserMentioned(content, user);
};
