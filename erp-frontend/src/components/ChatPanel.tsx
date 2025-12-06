import React, { useState, useEffect, useRef } from "react";
import { Card, List, Input, Button, Avatar } from "antd";
import { UserOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons';
import axios from 'axios';
import type { ChatMessage, ChatResponse } from "../types/chat";

const { TextArea } = Input;

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
      const resp = await axios.post<ChatResponse>('/api/chat/', {
        session_id: sessionId,
        message: trimmed,
      });

      const data = resp.data;
      
      // update session_id to maintain session
      if (data.session_id) {
        setSessionId(data.session_id);
      }

      // 3. show response of the chatbot
      const botMsg: ChatMessage = { role: "bot", content: data.reply };
      setMessages((prev) => [...prev, botMsg]);

    } catch (err) {
      console.error(err);
      const errorMsg: ChatMessage = { role: "bot", content: "⚠️ Error connecting to server." };
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
                  {msg.content}
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