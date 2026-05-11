import { useState } from "react";
import { Button, Textarea, Text } from "@fluentui/react-components";
import { Send24Regular, TextBulletListSquareSparkle24Regular } from "@fluentui/react-icons";
import { api } from "../../services/api";
import { readDocumentText } from "../../services/word";
import { ChatMessage } from "../../types";
import "./AssistantChat.css";

interface AssistantChatProps {
  onExplainSelection: () => Promise<ChatMessage | undefined>;
}

const welcome: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Ask me about this Word document, DC contract risk, clause drafting, or a selected provision."
};

export function AssistantChat({ onExplainSelection }: AssistantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);

  const sendMessage = async () => {
    if (!draft.trim()) {
      return;
    }

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: draft.trim() };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setIsSending(true);

    try {
      const context = await readDocumentText();
      const revision = await api.draftRevision(userMessage.content, context);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: revision }]);
    } finally {
      setIsSending(false);
    }
  };

  const explainSelection = async () => {
    setIsSending(true);
    try {
      const response = await onExplainSelection();
      if (response) {
        setMessages((current) => [...current, response]);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="chatPanel">
      <Button icon={<TextBulletListSquareSparkle24Regular />} onClick={explainSelection} disabled={isSending}>
        Explain Selected Clause
      </Button>
      <div className="messageList">
        {messages.map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            <Text>{message.content}</Text>
          </article>
        ))}
      </div>
      <div className="composer">
        <Textarea
          resize="vertical"
          placeholder="Ask Mercy Legal..."
          value={draft}
          onChange={(_, data) => setDraft(data.value)}
        />
        <Button appearance="primary" icon={<Send24Regular />} onClick={sendMessage} disabled={isSending}>
          Send
        </Button>
      </div>
    </section>
  );
}
