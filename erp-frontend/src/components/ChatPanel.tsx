import React, { useState, useEffect, useRef } from "react";
import { Card, List, Input, Button, Avatar, Table, Descriptions } from "antd";
import { UserOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons';
import axios from 'axios';
import type { ChatMessage, ChatResponse } from "../types/chat";

const { TextArea } = Input;

type ToolResultLowStock = {
  tool: "low_stock";
  threshold: number;
  total: number;
  returned: number;
  items: Array<{ id: number; sku: string; name?: string; stock: number }>;
};

type ToolResultOrdersToday = {
  tool: "orders_today";
  date: string;
  total: number;
  by_status: Record<string, number>;
};

type ToolResult = ToolResultLowStock | ToolResultOrdersToday | { tool: string;[k: string]: any };
type ChatResponseWithTool = ChatResponse & { tool_result?: ToolResult | null };
type ChatMessageWithTool = ChatMessage & { toolResult?: ToolResult | null };

export const ChatPanel: React.FC = () => {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");

  // scroll to the bottom of the reference
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const renderToolBlock = (toolResult: ToolResult) => {
    if (!toolResult || typeof toolResult !== "object") return null;

    if (toolResult.tool === "low_stock") {
      const tr = toolResult as ToolResultLowStock;
      const dataSource = Array.isArray(tr.items) ? tr.items : [];
      return (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.75 }}>
            Low stock (≤ {tr.threshold}) · total {tr.total} · showing {tr.returned}
          </div>
          <Table
            size="small"
            pagination={false}
            dataSource={dataSource}
            rowKey={(r) => String(r.id ?? r.sku)}
            columns={[
              { title: "SKU", dataIndex: "sku", key: "sku", width: 120 },
              { title: "Name", dataIndex: "name", key: "name" },
              { title: "Stock", dataIndex: "stock", key: "stock", width: 90 },
            ]}
          />
        </div>
      );
    }

    if (toolResult.tool === "orders_today") {
      const tr = toolResult as ToolResultOrdersToday;
      const by = tr.by_status || {};
      const entries = Object.entries(by);
      return (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.75 }}>
            Orders today · {tr.date}
          </div>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Total">{tr.total}</Descriptions.Item>
            <Descriptions.Item label="By status">
              {entries.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {entries.map(([k, v]) => (
                    <span key={k} style={{ fontSize: 12 }}>
                      <strong>{k}</strong>: {v}
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: 12, opacity: 0.75 }}>No breakdown</span>
              )}
            </Descriptions.Item>
          </Descriptions>
        </div>
      );
    }


    return (
      <pre style={{ marginTop: 8, fontSize: 12, whiteSpace: "pre-wrap" }}>
        {JSON.stringify(toolResult, null, 2)}
      </pre>
    );
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    // 1. display the message sent by the user on the interface
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // 2. send request
      const resp = await axios.post<ChatResponseWithTool>(
        "/api/chat/",
        sessionId
          ? { session_id: sessionId, message: trimmed }
          : { message: trimmed }
      );

      const data = resp.data;

      // update session_id to maintain session
      if (data.session_id) {
        setSessionId(data.session_id);
      }

      // 3. Sync UI with server-side history to avoid drift.
      if (Array.isArray(data.history)) {
        // Server history does not include tool_result; attach tool_result to the latest bot message in UI.
        const history = data.history as ChatMessageWithTool[];
        const toolResult = (data as any).tool_result ?? null;
        if (toolResult) {
          for (let i = history.length - 1; i >= 0; i--) {
            if (history[i]?.role === "bot") {
              history[i] = { ...(history[i] as any), toolResult };
              break;
            }
          }
        }
        setMessages(history);
      } else {
        const botMsg: ChatMessageWithTool = {
          role: "bot",
          content: data.reply,
          toolResult: (data as any).tool_result ?? null,
        };
        setMessages((prev) => [...prev, botMsg]);
      }

    } catch (err) {
      console.error(err);
      const detail = (err as any)?.response?.data?.detail || (err as any)?.message;
      const errorMsg: ChatMessage = {
        role: "bot",
        content: `⚠️ ${detail ? String(detail) : "Error connecting to server."}`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title="🤖 AI Assistant"
      bordered={false}
      style={{ height: '100%', display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: 12, overflow: 'hidden' } }}
    >
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 12, paddingRight: 4 }}>
        <List
          dataSource={messages}
          rowKey={(msg) =>
            msg.id != null ? String(msg.id) : (msg.created_at ?? `${msg.role}-${msg.content}`)
          }
          split={false}
          renderItem={(msg) => (
            <List.Item style={{ justifyContent: msg.role === "user" ? "flex-end" : "flex-start", padding: '4px 0' }}>
              <div style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start', maxWidth: '90%' }}>
                <Avatar
                  size="small"
                  icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                  style={{ backgroundColor: msg.role === 'user' ? '#1677ff' : '#52c41a', margin: '0 8px' }}
                />
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: msg.role === "user" ? "#e6f7ff" : "#f5f5f5",
                    border: msg.role === 'user' ? '1px solid #91caff' : '1px solid #f0f0f0',
                    color: "rgba(0, 0, 0, 0.88)",
                    wordBreak: 'break-word'
                  }}
                >
                  <div>{msg.content}</div>
                  {(msg as ChatMessageWithTool).toolResult ? renderToolBlock((msg as ChatMessageWithTool).toolResult as ToolResult) : null}
                </div>
              </div>
            </List.Item>
          )}
        />
        <div ref={messagesEndRef} />
      </div>


      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
        <TextArea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Ask about inventory..."
          style={{ resize: 'none', marginBottom: 8 }}
        />
        <div style={{ textAlign: "right" }}>
          <Button type="primary" onClick={sendMessage} loading={loading} disabled={!input.trim()} icon={<SendOutlined />}>
            Send
          </Button>
        </div>
      </div>
    </Card>
  );
};