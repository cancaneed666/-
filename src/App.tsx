import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, BrainCircuit, Target, Users, RefreshCw, AlertTriangle, Lightbulb, MessageSquare, Layers, Swords, Compass, User, Rocket, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from "framer-motion";
import Markdown from 'react-markdown';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Message = {
  id: string;
  role: 'user' | 'ai';
  content: string;
  stage?: string;
  mode?: string;
  structuredData?: {
    title: string;
    items: { label: string; text: string }[];
  }[];
  nextStep?: string;
  iterations?: string[];
  agentDiscussion?: {
    round: number;
    scores: {
      innovation: number;
      feasibility: number;
      commercial: number;
      userExp: number;
    };
    messages: {
      agent: string;
      role: string;
      icon: string;
      color: string;
      content: string;
    }[];
  }[];
};

const QUICK_MODES = [
  { id: 'auto', name: '自动判断', icon: Sparkles, desc: 'AI 自动选择最合适的模式' },
  { id: 'scenario-to-solution', name: '场景转全案', icon: Rocket, desc: '仅提供场景，生成全面方案' },
  { id: 'deep-dive', name: '深度推演', icon: Layers, desc: '对现有想法进行多维深度推演' },
  { id: 'scamper', name: '脑洞发散', icon: Lightbulb, desc: '打破常规，跨界创意' },
  { id: 'challenge', name: '压力测试', icon: Swords, desc: '无情拆解，寻找漏洞' },
  { id: 'mvp', name: 'MVP 收敛', icon: Target, desc: '砍掉伪需求，定义最小可行性产品' },
];

const SIDEBAR_MODES = [
  { name: '自动判断', desc: '根据你的输入，AI 自动匹配最合适的分析模型。', icon: Sparkles },
  { name: '场景转全案', desc: '当用户没有具体方案，只抛出场景或痛点时，AI 会提出一个非常全面的解决方案。', icon: Rocket },
  { name: '深度推演', desc: '对已有的初步想法进行全方位、多角度的深度推演和完善。', icon: Layers },
  { name: 'SCAMPER 脑洞发散', desc: '使用 SCAMPER 创新模型，强制产生跨界创意与反转设计。', icon: Lightbulb },
  { name: '压力测试', desc: '无情拆解现有方案，寻找致命逻辑漏洞、切换成本和商业风险。', icon: Swords },
  { name: 'MVP 极简收敛', desc: '砍掉非核心功能，定义最小可行性产品 (MVP) 与核心验证指标。', icon: Target },
];

const callGemini = async (input: string, mode: string) => {
  const schema = {
    type: Type.OBJECT,
    properties: {
      stage: { type: Type.STRING, description: "当前分析阶段的名称" },
      mode: { type: Type.STRING, description: "当前模式的名称" },
      content: { type: Type.STRING, description: "AI对用户的最终回复，请使用 Markdown 格式，内容需要非常详尽、完整、有深度" },
      structuredData: {
        type: Type.ARRAY,
        description: "结构化的分析数据，包含多个部分",
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "该部分的标题" },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING, description: "子项的标签" },
                  text: { type: Type.STRING, description: "子项的具体内容" }
                },
                required: ["label", "text"]
              }
            }
          },
          required: ["title", "items"]
        }
      },
      nextStep: { type: Type.STRING, description: "给用户的下一步行动建议" },
      agentDiscussion: {
        type: Type.ARRAY,
        description: "5位专家进行5轮深度推演的对话记录，必须严格包含5轮",
        items: {
          type: Type.OBJECT,
          properties: {
            round: { type: Type.INTEGER, description: "当前轮次，1到5" },
            scores: {
              type: Type.OBJECT,
              properties: {
                innovation: { type: Type.INTEGER, description: "创新性得分 (0-100)" },
                feasibility: { type: Type.INTEGER, description: "可行性得分 (0-100)" },
                commercial: { type: Type.INTEGER, description: "商业价值得分 (0-100)" },
                userExp: { type: Type.INTEGER, description: "用户体验得分 (0-100)" }
              },
              required: ["innovation", "feasibility", "commercial", "userExp"]
            },
            messages: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  agent: { type: Type.STRING, description: "专家简称，如 PM, UX, Dev, Biz, Ops" },
                  role: { type: Type.STRING, description: "专家角色，如 产品经理, 交互设计, 研发专家, 商业分析, 增长黑客" },
                  icon: { type: Type.STRING, description: "专家图标，如 🧠, 🎨, 💻, 💼, 🚀" },
                  color: { type: Type.STRING, description: "专家颜色类名，如 text-blue-600, text-purple-600, text-slate-600, text-amber-600, text-emerald-600" },
                  content: { type: Type.STRING, description: "专家的发言内容，需要体现专业视角的碰撞和方案的迭代" }
                },
                required: ["agent", "role", "icon", "color", "content"]
              }
            }
          },
          required: ["round", "scores", "messages"]
        }
      }
    },
    required: ["stage", "mode", "content", "agentDiscussion", "nextStep"]
  };

  const systemInstruction = `你是一个顶级的“设计思维助手”和“产品创新教练”。
你的任务是根据用户的输入，使用特定的分析模式进行深度拆解和推演，并返回严格符合 JSON Schema 的结构化数据。
当前用户选择的模式是：${mode === 'auto' ? '请你根据用户的输入自动判断最适合的模式（从：场景转全案、深度推演、脑洞发散、压力测试、MVP收敛中选择）' : mode}。
请用中文回复，并且确保内容具有极高的专业度、洞察力和启发性。

**核心要求：**
1. **每次回复前，必须模拟5个不同领域的专家（如产品、设计、技术、商业、运营）进行5轮深度的内部推演讨论。** 将这个过程记录在 \`agentDiscussion\` 字段中。每一轮讨论后，都需要对当前方案进行全方位的打分（创新、可行、商业、体验）。
2. **最终回复内容 (\`content\`) 必须非常详尽、完整**，综合5轮讨论的结果，给出一个高质量的最终方案或分析。请使用 Markdown 格式排版，使其易于阅读。
3. 如果用户只是抛出一个场景或痛点，没有具体方案（适合“场景转全案”模式），请在讨论后提出一个非常全面的解决方案。
4. 结构化数据 (\`structuredData\`) 可以用来补充展示方案的核心要素（如商业画布、核心功能点等）。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: input,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.7,
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      stage: "系统提示",
      mode: "错误处理",
      content: "抱歉，调用 AI 模型时发生错误，请稍后再试。",
      agentDiscussion: [],
      nextStep: "检查网络连接或 API 密钥配置。"
    };
  }
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'ai',
      content: '你好，我是你的设计思维助手。\n告诉我你的想法或痛点，我会自动选择最适合的分析模式，并模拟5位专家进行5轮深度推演，为你提供最完善的方案。',
    }
  ]);
  const [input, setInput] = useState('');
  const [selectedMode, setSelectedMode] = useState('auto');
  const [isTyping, setIsTyping] = useState(false);
  const [expandedDiscussions, setExpandedDiscussions] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const latestScores = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'ai' && msg.agentDiscussion && msg.agentDiscussion.length > 0) {
        const lastRound = msg.agentDiscussion[msg.agentDiscussion.length - 1];
        if (lastRound && lastRound.scores) {
          return [
            { subject: '创新性', A: lastRound.scores.innovation, fullMark: 100 },
            { subject: '可行性', A: lastRound.scores.feasibility, fullMark: 100 },
            { subject: '商业价值', A: lastRound.scores.commercial, fullMark: 100 },
            { subject: '用户体验', A: lastRound.scores.userExp, fullMark: 100 },
          ];
        }
      }
    }
    return null;
  }, [messages]);

  const toggleDiscussion = (msgId: string) => {
    setExpandedDiscussions(prev => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const aiResponseData = await callGemini(userMsg.content, selectedMode);

    setMessages(prev => [...prev, {
      id: (Date.now() + 1).toString(),
      role: 'ai',
      ...aiResponseData
    } as Message]);
    
    setIsTyping(false);
    setSelectedMode('auto');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col font-sans text-gray-900 selection:bg-blue-100">
      {/* Header */}
      <header className="px-6 py-8 bg-white border-b border-gray-100 shrink-0">
        <div className="max-w-6xl mx-auto">
          <p className="text-[11px] text-gray-400 mb-2 tracking-[0.15em] uppercase font-medium">
            上海科技大学｜创意与艺术学院｜设计思维｜2026
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 mb-2">
            Vibe Coding 头脑风暴助手
          </h1>
          <p className="text-sm text-gray-500 max-w-2xl leading-relaxed">
            它不会只附和你，而会根据你的问题自动切换分析模式，帮你发散、拆解、质疑并迭代想法。
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 flex gap-8 h-[calc(100vh-140px)]">
        
        {/* Chat Area (Core) */}
        <div className="flex-1 bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col overflow-hidden relative">
          
          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 scroll-smooth">
            <AnimatePresence initial={false}>
              {messages.map(msg => (
                <motion.div 
                  key={msg.id} 
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl p-5 md:p-6 shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-blue-50 text-gray-800 border border-blue-100 rounded-br-sm' 
                      : 'bg-white border border-gray-100 rounded-bl-sm'
                  }`}>
                  {msg.role === 'ai' && msg.id !== '1' && (
                    <div className="mb-5 flex flex-wrap gap-2 items-center">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100/50">
                        <Target className="w-3.5 h-3.5 mr-1.5" />
                        阶段：{msg.stage}
                      </span>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100/50">
                        <BrainCircuit className="w-3.5 h-3.5 mr-1.5" />
                        模式：{msg.mode}
                      </span>
                    </div>
                  )}
                  
                  {msg.agentDiscussion && msg.agentDiscussion.length > 0 && (
                    <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <button 
                        onClick={() => toggleDiscussion(msg.id)}
                        className="w-full px-4 py-3 bg-slate-100/50 hover:bg-slate-200/50 transition-colors border-b border-slate-200 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                          <Users className="w-4 h-4 text-slate-500" />
                          <span>5位专家进行了 {msg.agentDiscussion.length} 轮深度推演</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-mono font-medium">点击{expandedDiscussions[msg.id] ? '收起' : '展开'}详情</span>
                          {expandedDiscussions[msg.id] ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                        </div>
                      </button>
                      
                      <AnimatePresence>
                        {expandedDiscussions[msg.id] && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="p-4 max-h-[400px] overflow-y-auto custom-scrollbar text-xs"
                          >
                            {msg.agentDiscussion.map((roundData, rIdx) => (
                              <div key={rIdx} className="mb-6 last:mb-0">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-200/60">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-white bg-slate-700 px-2 py-0.5 rounded">Round {roundData.round}</span>
                                    <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                                      <Activity className="w-3 h-3" /> 方案多维打分
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 font-medium">创新 {roundData.scores.innovation}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100 font-medium">可行 {roundData.scores.feasibility}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100 font-medium">商业 {roundData.scores.commercial}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100 font-medium">体验 {roundData.scores.userExp}</span>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  {roundData.messages.map((d, mIdx) => (
                                    <div key={mIdx} className="flex gap-3 items-start">
                                      <div className="flex flex-col items-center gap-1 shrink-0 w-10 mt-0.5">
                                        <span className="text-base leading-none">{d.icon}</span>
                                        <span className={`text-[9px] font-bold ${d.color} uppercase tracking-wider`}>{d.agent}</span>
                                      </div>
                                      <div className="flex-1 bg-white border border-slate-100 rounded-lg p-3 shadow-sm">
                                        <div className="flex items-center gap-2 mb-1.5">
                                          <span className="text-[10px] font-bold text-slate-700">{d.role}</span>
                                        </div>
                                        <p className="text-slate-600 leading-relaxed">{d.content}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {msg.iterations && (
                    <div className="mb-6 p-4 bg-white/60 border border-gray-200/60 rounded-xl shadow-sm">
                      <h5 className="text-[12px] font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        AI 内部推演过程 (5轮迭代)
                      </h5>
                      <div className="space-y-2">
                        {msg.iterations.map((text, i) => (
                          <p key={i} className="text-[11.5px] text-gray-500 leading-relaxed">
                            {text}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.content && (
                    <div className="prose prose-sm md:prose-base max-w-none text-gray-800 leading-relaxed">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  )}
                  
                  {msg.structuredData && (
                    <div className="space-y-6 mt-2">
                      {msg.structuredData.map((section, idx) => (
                        <div key={idx}>
                          <h4 className="text-[15px] font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-blue-600" />
                            {section.title}
                          </h4>
                          <ul className="space-y-3.5">
                            {section.items.map((item, i) => (
                              <li key={i} className="text-[14px] flex items-start gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-2 shrink-0" />
                                <div className="leading-relaxed">
                                  <span className="font-semibold text-gray-900">{item.label}：</span>
                                  <span className="text-gray-600 whitespace-pre-wrap">{item.text}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {msg.nextStep && (
                    <div className="mt-6 pt-5 border-t border-gray-200/60">
                      <div className="flex items-start gap-2.5 text-[14px]">
                        <Lightbulb className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
                        <span className="font-medium text-gray-800 leading-relaxed">{msg.nextStep}</span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
            
            {isTyping && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm p-5 flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <motion.span 
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                      className="w-2 h-2 bg-blue-500 rounded-full" 
                    />
                    <motion.span 
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                      className="w-2 h-2 bg-blue-400 rounded-full" 
                    />
                    <motion.span 
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                      className="w-2 h-2 bg-blue-300 rounded-full" 
                    />
                  </div>
                  <span className="text-sm text-gray-500 font-medium bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
                    AI 正在深度推演中...
                  </span>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 md:p-6 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgb(0,0,0,0.02)] z-10">
            
            {/* Examples */}
            {messages.length === 1 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex flex-wrap gap-2"
              >
                <span className="text-xs font-medium text-gray-400 py-1.5 px-1">试试这些：</span>
                {[
                  "我想做一个帮助大学生更高效组队完成课程项目的平台",
                  "我想设计一个让人坚持早睡的 App",
                  "我有很多功能想做，不知道第一版该保留什么"
                ].map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(ex)}
                    className="text-[13px] bg-gray-50 border border-gray-200 text-gray-600 px-3.5 py-1.5 rounded-full hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors text-left max-w-full truncate"
                  >
                    {ex}
                  </button>
                ))}
              </motion.div>
            )}

            {/* Quick Modes */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
              {QUICK_MODES.map(mode => {
                const Icon = mode.icon;
                const isSelected = selectedMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setSelectedMode(mode.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                      isSelected 
                        ? 'bg-gray-900 text-white shadow-sm' 
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                    title={mode.desc}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-gray-400'}`} />
                    {mode.name}
                  </button>
                );
              })}
            </div>

            {/* Input Box */}
            <div className="relative flex items-end gap-3 bg-[#F8F9FA] border border-gray-200 rounded-2xl p-2 focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50 transition-all shadow-inner">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入你的产品点子 / 问题 / 想验证的想法…"
                className="w-full max-h-32 min-h-[44px] bg-transparent border-none focus:ring-0 resize-none py-2.5 px-3 text-[15px] placeholder-gray-400"
                rows={1}
                style={{ height: 'auto' }}
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="shrink-0 p-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:from-gray-400 disabled:to-gray-400 shadow-md transition-all mb-0.5 mr-0.5"
              >
                <Send className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        </div>

        {/* Sidebar (Auxiliary Info) */}
        <div className="w-72 shrink-0 hidden lg:flex flex-col gap-6">
          {latestScores && (
            <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-6">
              <h3 className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-[0.15em]">
                当前方案多维评价
              </h3>
              <div className="h-[200px] w-full -ml-4">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={latestScores}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="Score" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-6">
            <h3 className="text-[11px] font-bold text-gray-400 mb-5 uppercase tracking-[0.15em]">
              支持的分析模式
            </h3>
            <ul className="space-y-5">
              {SIDEBAR_MODES.map((m, idx) => {
                const Icon = m.icon;
                return (
                  <li key={idx} className="group">
                    <div className="flex items-center gap-2.5 text-[14px] font-semibold text-gray-800 mb-1.5">
                      <div className="p-1.5 rounded-md bg-gray-50 text-gray-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                        <Icon className="w-4 h-4" />
                      </div>
                      {m.name}
                    </div>
                    <p className="text-[12px] text-gray-500 leading-relaxed pl-9">
                      {m.desc}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
          
          <div className="bg-blue-50/50 rounded-3xl border border-blue-100/50 p-6">
            <div className="flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-[13px] font-semibold text-blue-900 mb-1">使用提示</h4>
                <p className="text-[12px] text-blue-700/80 leading-relaxed">
                  你可以直接输入一个粗糙的想法，AI 会自动判断你需要发散还是收敛。也可以在输入框上方强制指定分析模式。
                </p>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
