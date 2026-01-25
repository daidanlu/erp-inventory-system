import React, { useState, useEffect, useRef } from "react";
import { Card, List, Input, Button, Avatar, Table, Descriptions, Tag, Drawer, Spin, Tooltip } from "antd";
import { UserOutlined, RobotOutlined, SendOutlined, HistoryOutlined, InfoCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import type { ChatMessage, ChatResponse } from "../types/chat";

const { TextArea } = Input;

// --- Types ---
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

type ChatSessionSummary = {
  session_id: string;
  summary: string;
  last_time: string;
};

type ChatConfig = {
  provider: string;
  model: string;
  features: {
    dry_run: boolean;
    session_summary: boolean;
  };
};

export const ChatPanel: React.FC = () => {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");

  // New State for Config & History
  const [config, setConfig] = useState<ChatConfig | null>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Load Config on Mount
  useEffect(() => {
    axios.get('/api/chat/config/')
      .then(res => setConfig(res.data))
      .catch(err => {
        console.error("Failed to load chat config", err);
        setConfig({
          provider: "unknown",
          model: "unknown",
          features: { dry_run: false, session_summary: false }
        });
      });
  }, []);
  
  // 2. Load History when Drawer opens
  useEffect(() => {
    if (historyOpen) {
      setSessionsLoading(true);
      axios.get('/api/chat/sessions/?limit=20')
        .then(res => setSessions(res.data))
        .catch(err => console.error("Failed to load sessions", err))
        .finally(() => setSessionsLoading(false));
    }
  }, [historyOpen]);

  // 3. Load specific session messages
  const loadSession = async (sid: string) => {
    setLoading(true);
    try {
      // Fetch history for this session
      const res = await axios.get(`/api/chat/history/?session_id=${sid}`);
      setSessionId(sid);
      setMessages(res.data.messages || []);
      setHistoryOpen(false);
    } catch (err) {
      console.error("Failed to load session history", err);
    } finally {
      setLoading(false);
    }
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

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const resp = await axios.post<ChatResponseWithTool>(
        "/api/chat/",
        sessionId
          ? { session_id: sessionId, message: trimmed }
          : { message: trimmed }
      );

      const data = resp.data;

      if (data.session_id) {
        setSessionId(data.session_id);
      }

      if (Array.isArray(data.history)) {
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

  // Helper to determine badge color based on provider
  const getProviderTag = () => {
    if (!config) return <Tag>Connecting...</Tag>;
    const p = config.provider;
    if (p === 'llama_cpp') return <Tag color="success" icon={<RobotOutlined />}>Local Llama</Tag>;
    if (p === 'openai_compat') return <Tag color="blue" icon={<RobotOutlined />}>Remote AI</Tag>;
    return <Tag color="default">Mock</Tag>;
  };

  return (
    <>
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🤖 AI Assistant</span>
            <div style={{ fontWeight: 'normal' }}>{getProviderTag()}</div>
          </div>
        }
        extra={
          <Tooltip title="History">
            <Button
              type="text"
              icon={<HistoryOutlined />}
              onClick={() => setHistoryOpen(true)}
            />
          </Tooltip>
        }
        bordered={false}
        style={{ height: '100%', display: "flex", flexDirection: "column" }}
        styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: 12, overflow: 'hidden' } }}
      >
        <div style={{ flex: 1, overflowY: "auto", marginBottom: 12, paddingRight: 4 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: 40, color: '#999' }}>
              <InfoCircleOutlined style={{ fontSize: 24, marginBottom: 8 }} />
              <p>Ask me about stock levels or orders.</p>
            </div>
          )}
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

      {/* Session History Drawer */}
      <Drawer
        title="Chat History"
        placement="right"
        onClose={() => setHistoryOpen(false)}
        open={historyOpen}
        width={320}
      >
        {sessionsLoading ? <Spin /> : (
          <List
            dataSource={sessions}
            renderItem={(item) => (
              <List.Item
                style={{ cursor: 'pointer', transition: 'background 0.3s' }}
                onClick={() => loadSession(item.session_id)}
              >
                <List.Item.Meta
                  title={item.summary || "New Chat"}
                  description={<span style={{ fontSize: 11 }}>{new Date(item.last_time).toLocaleString()}</span>}
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </>
  );
};