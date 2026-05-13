import { MessageSquare, Send } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Message } from "@shared/schema";

interface MessagePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: Message[] | undefined;
  messageText: string;
  onMessageTextChange: (text: string) => void;
  onSend: () => void;
  isSending: boolean;
}

export function MessagePanel({
  open,
  onOpenChange,
  messages,
  messageText,
  onMessageTextChange,
  onSend,
  isSending,
}: MessagePanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Message support about this order</SheetTitle>
          <p className="text-xs text-muted-foreground">Our support team reads these messages and will reach the driver if needed.</p>
        </SheetHeader>
        <div className="mt-4 flex-1 overflow-y-auto max-h-[40vh] space-y-3 mb-4">
          {messages && messages.length > 0 ? (
            messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.senderRole === "customer" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] rounded-xl px-3 py-2 ${
                  msg.senderRole === "customer"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}>
                  <p className="text-sm">{msg.content}</p>
                  <p className="text-[10px] opacity-60 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No messages yet</p>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Textarea
            placeholder="Type a message..."
            value={messageText}
            onChange={e => onMessageTextChange(e.target.value)}
            className="resize-none min-h-[40px] max-h-[80px]"
            data-testid="input-message"
          />
          <Button
            size="icon"
            disabled={!messageText.trim() || isSending}
            onClick={onSend}
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
