export type ChatCommandId = "clear";

export type ChatCommand = {
  id: ChatCommandId;
  command: `/${string}`;
  description: string;
};

export const CHAT_COMMANDS: readonly ChatCommand[] = [
  {
    id: "clear",
    command: "/clear",
    description: "Clear local chat history",
  },
];

const COMMANDS_BY_NAME = new Map(
  CHAT_COMMANDS.map((command) => [command.command.toLowerCase(), command]),
);

type ParsedCommand = {
  command: ChatCommand;
};

const parseCommand = (input: string): ParsedCommand | null => {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const [commandName = ""] = trimmed.split(/\s+/, 1);
  const command = COMMANDS_BY_NAME.get(commandName.toLowerCase());
  if (!command) return null;

  return { command };
};

export const findCommandSuggestions = (
  input: string,
  limit = 8,
): ChatCommand[] => {
  const trimmedStart = input.trimStart();
  if (!trimmedStart.startsWith("/")) return [];
  if (trimmedStart.split(/\s+/).length > 1) return [];

  const [commandToken = "/"] = trimmedStart.split(/\s+/, 1);
  const query = commandToken.slice(1).toLowerCase();

  return CHAT_COMMANDS.filter((command) =>
    command.command.slice(1).startsWith(query),
  ).slice(0, limit);
};

export type ChatCommandHandlers = {
  clearMessages: () => void;
};

export const executeChatCommand = (
  input: string,
  handlers: ChatCommandHandlers,
): boolean => {
  const parsed = parseCommand(input);
  if (!parsed) return false;

  switch (parsed.command.id) {
    case "clear":
      handlers.clearMessages();
      return true;
    default:
      return false;
  }
};
