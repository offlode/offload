import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Bot, ChevronLeft, Send, Phone, Search, Truck,
  Calendar, DollarSign, User, Loader2, MessageCircle,
  Package, CheckCheck, Check as CheckIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getSocket, joinOrderRoom, leaveOrderRoom, emitTyping } from "@/lib/socket";
import { cn } from "@/lib/utils";
import type { Message } from "@shared/schema";

type Conversation = {
  orderId: number;
  orderNumber: string;
  status: string;
  lastMessage: { content: string; timestamp: string; senderRole: string } | null;
  unreadCount: number;
};

function formatTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  return (
    <div
      className={cn("flex gap-2.5 mb-3", isOwn ? "flex-row-reverse" : "flex-row")}
      data-testid={`message-${message.id}`}
    >
      {!isOwn && (
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-auto">
          {message.senderRole === "driver" ? (
            <Truck className="w-4 h-4 text-primary" />
          ) : message.senderRole === "laundromat" ? (
            <Package className="w-4 h-4 text-primary" />
          ) : (
            <Bot className="w-4 h-4 text-primary" />
          )}
        </div>
      )}

      <div className={cn("flex flex-col gap-0.5 max-w-[78%]", isOwn ? "items-end" : "items-start")}>
        {!isOwn && (
          <span className="text-[10px] text-muted-foreground capitalize px-1">
            {message.senderRole}
          </span>
        )}
        <div
          className={cn(
            "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : message.messageType === "system"
              ? "bg-muted/50 border border-border text-muted-foreground rounded-bl-sm italic"
              : "bg-card border border-border text-foreground rounded-bl-sm"
          )}
        >
          {message.content}
        </div>
        <div className="flex items-center gap-1 px-1">
          <span className="text-[10px] text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
          {isOwn && (
            message.readAt ? (
              <CheckCheck className="w-3 h-3 text-blue-400" />
            ) : (
              <CheckIcon className="w-3 h-3 text-muted-foreground" />
            )
          )}
        </div>
      </div>

      {isOwn && (
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-auto">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5 mb-3" data-testid="typing-indicator">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

function ConversationListItem({
  conv,
  isActive,
  onClick,
}: {
  conv: Conversation;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={`conversation-${conv.orderId}`}
      className={cn(
        "w-full text-left px-4 py-3 flex gap-3 hover:bg-muted/50 transition-colors border-b border-border/50",
        isActive && "bg-primary/5 border-l-2 border-l-primary"
      )}
    >
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Package className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold truncate">#{conv.orderNumber}</p>
          {conv.lastMessage && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatTimeAgo(conv.lastMessage.timestamp)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {conv.lastMessage
            ? `${conv.lastMessage.senderRole}: ${conv.lastMessage.content}`
            : "No messages yet"}
        </p>
      </div>
      {conv.unreadCount > 0 && (
        <span className="min-w-[20px] h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0 self-center px-1">
          {conv.unreadCount}
        </span>
      )}
    </button>
  );
}

// Quick Actions for AI chat fallback
const QUICK_ACTIONS = [
  { label: "Track Order", icon: <Truck className="w-3.5 h-3.5" />, prompt: "I'd like to track my current order." },
  { label: "Reschedule", icon: <Calendar className="w-3.5 h-3.5" />, prompt: "I need to reschedule my pickup." },
  { label: "Pricing Help", icon: <DollarSign className="w-3.5 h-3.5" />, prompt: "Can you explain your pricing?" },
  { label: "Talk to Human", icon: <Phone className="w-3.5 h-3.5" />, prompt: "I'd like to speak with a human support agent." },
];

export default function ChatPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showConversations, setShowConversations] = useState(true);

  // AI chat state (fallback when no order selected)
  const [aiMessages, setAiMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string; timestamp: Date }>>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm your Offload assistant. Select a conversation from your orders, or ask me a question about tracking, pricing, or scheduling.",
      timestamp: new Date(),
    },
  ]);
  const [aiSessionId, setAiSessionId] = useState<number | undefined>(undefined);
  const [aiLoading, setAiLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch conversations
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    enabled: !!user,
  });

  // Fetch messages for active order
  const { data: orderMessages = [], refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ["/api/messages", activeOrderId],
    queryFn: async () => {
      const res = await apiRequest(`/api/messages/${activeOrderId}`);
      return res.json();
    },
    enabled: !!activeOrderId,
    refetchInterval: activeOrderId ? 10000 : false,
  });

  // Socket.io real-time messages
  useEffect(() => {
    if (!user) return;

    const socket = getSocket(user.id, user.role);

    const handleNewMessage = (msg: any) => {
      if (activeOrderId && msg.orderId === activeOrderId) {
        refetchMessages();
      }
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    };

    const handleTyping = (data: { userId: number; orderId: number }) => {
      if (data.userId !== user.id && data.orderId === activeOrderId) {
        setIsTyping(true);
        setTimeout(() => setIsTyping(false), 3000);
      }
    };

    socket.on("new_message", handleNewMessage);
    socket.on("user_typing", handleTyping);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("user_typing", handleTyping);
    };
  }, [user, activeOrderId, refetchMessages]);

  // Join/leave order room
  useEffect(() => {
    if (!activeOrderId || !user) return;
    joinOrderRoom(activeOrderId);
    return () => { leaveOrderRoom(activeOrderId); };
  }, [activeOrderId, user]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [orderMessages, aiMessages, isTyping]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          orderId: activeOrderId,
          content,
          messageType: "text",
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setInputValue("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    },
  });

  // AI chat send
  const sendAiMessage = async (content: string) => {
    if (!content.trim()) return;

    setAiMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    }]);
    setInputValue("");
    setAiLoading(true);

    try {
      const res = await apiRequest("/api/chat/message", {
        method: "POST",
        body: JSON.stringify({
          message: content.trim(),
          userId: user?.id,
          sessionId: aiSessionId,
        }),
      });
      const data = await res.json();
      if (data.sessionId && !aiSessionId) setAiSessionId(data.sessionId);

      setAiMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.response || data.reply || "I'm sorry, I couldn't process that.",
        timestamp: new Date(),
      }]);
    } catch {
      setAiMessages(prev => [...prev, {
        id: `ai-error-${Date.now()}`,
        role: "assistant",
        content: "I'm having trouble connecting. Please try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    if (activeOrderId) {
      if (user) emitTyping(activeOrderId);
      sendMessageMutation.mutate(inputValue.trim());
    } else {
      sendAiMessage(inputValue);
    }
  };

  const handleTypingInput = () => {
    if (activeOrderId && user) {
      emitTyping(activeOrderId);
    }
  };

  const selectConversation = (orderId: number) => {
    setActiveOrderId(orderId);
    setShowConversations(false);
  };

  return (
    <div className="flex flex-col max-w-lg mx-auto bg-background" style={{ height: 'calc(100dvh - 64px)' }}>
      {/* Chat Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-card/95 backdrop-blur-xl border-b border-border">
        <button
          onClick={() => {
            if (!showConversations && activeOrderId) {
              setShowConversations(true);
              setActiveOrderId(null);
            } else {
              navigate("/");
            }
          }}
          data-testid="button-back"
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          {activeOrderId ? (
            <MessageCircle className="w-5 h-5 text-primary" />
          ) : (
            <Bot className="w-5 h-5 text-primary" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" data-testid="text-chat-title">
            {activeOrderId ? "Order Chat" : "Offload Messages"}
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-muted-foreground">
              {activeOrderId ? "Real-time messaging" : "AI Assistant + Order chats"}
            </span>
          </div>
        </div>

        {activeOrderId && (
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
            onClick={() => navigate(`/orders/${activeOrderId}`)}
            data-testid="button-view-order"
          >
            <Package className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Conversation List View */}
      {showConversations && !activeOrderId ? (
        <div className="flex-1 overflow-y-auto">
          {/* AI Assistant entry */}
          <button
            onClick={() => {
              setActiveOrderId(null);
              setShowConversations(false);
            }}
            className="w-full text-left px-4 py-3 flex gap-3 hover:bg-muted/50 transition-colors border-b border-border"
            data-testid="ai-assistant-entry"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">AI Assistant</p>
              <p className="text-xs text-muted-foreground">Track orders, pricing help, and more</p>
            </div>
          </button>

          {conversations.length > 0 && (
            <div className="px-4 py-2 bg-muted/30">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Order Conversations
              </p>
            </div>
          )}

          {conversations.map(conv => (
            <ConversationListItem
              key={conv.orderId}
              conv={conv}
              isActive={activeOrderId === conv.orderId}
              onClick={() => selectConversation(conv.orderId)}
            />
          ))}

          {conversations.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No order conversations yet.</p>
              <p className="text-xs mt-1 mb-4">Messages with drivers and staff will appear here.</p>
              <div className="text-left bg-card border border-border rounded-xl p-3 mx-2">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-foreground">AI Assistant</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                </div>
                <p className="text-xs text-muted-foreground">I can help you track orders, get price quotes, or answer questions about our service. Tap the AI Assistant above to start a chat.</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0" data-testid="messages-list">
            {/* Date separator */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-muted-foreground px-2 shrink-0">Today</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {activeOrderId ? (
              <>
                {orderMessages.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No messages yet. Start the conversation!</p>
                  </div>
                )}
                {orderMessages.map(msg => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOwn={msg.senderId === user?.id}
                  />
                ))}
              </>
            ) : (
              <>
                {aiMessages.map(msg => (
                  <div
                    key={msg.id}
                    className={cn("flex gap-2.5 mb-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
                  >
                    {msg.role !== "user" && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-auto">
                        <Bot className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <div className={cn("flex flex-col gap-1 max-w-[78%]", msg.role === "user" ? "items-end" : "items-start")}>
                      <div
                        className={cn(
                          "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-card border border-border text-foreground rounded-bl-sm"
                        )}
                      >
                        {msg.content}
                      </div>
                      <span className="text-[10px] text-muted-foreground px-1">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    {msg.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-auto">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}

                {/* Quick Actions */}
                {!activeOrderId && aiMessages.length <= 1 && (
                  <div className="mt-4" data-testid="quick-actions">
                    <p className="text-xs text-muted-foreground mb-2 text-center">Quick actions</p>
                    <div className="grid grid-cols-2 gap-2">
                      {QUICK_ACTIONS.map((action) => (
                        <button
                          key={action.label}
                          onClick={() => sendAiMessage(action.prompt)}
                          data-testid={`button-quick-${action.label.toLowerCase().replace(/\s+/g, "-")}`}
                          className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-sm font-medium text-left"
                        >
                          <span className="text-primary">{action.icon}</span>
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {(isTyping || aiLoading) && <TypingIndicator />}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="shrink-0 px-4 py-3 bg-card/95 backdrop-blur-xl border-t border-border pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    handleTypingInput();
                  }}
                  placeholder={activeOrderId ? "Type a message..." : "Message Offload AI..."}
                  className="pr-4 rounded-full bg-muted border-0 focus-visible:ring-1 focus-visible:ring-primary/50"
                  disabled={sendMessageMutation.isPending || aiLoading}
                  autoComplete="off"
                  data-testid="input-chat-message"
                />
              </div>
              <Button
                type="submit"
                size="icon"
                className="w-10 h-10 rounded-full shrink-0"
                disabled={!inputValue.trim() || sendMessageMutation.isPending || aiLoading}
                data-testid="button-send"
              >
                {(sendMessageMutation.isPending || aiLoading) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
