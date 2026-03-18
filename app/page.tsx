'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Shield, 
  Zap, 
  AlertCircle, 
  RefreshCw, 
  Settings, 
  Terminal,
  Brain,
  Mic,
  Volume2,
  CheckCircle2,
  XCircle,
  Cpu,
  Wallet,
  History,
  Info,
  X,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality, ThinkingLevel } from "@google/genai";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { RemoteData } from '@/src/types/remote-data';
import { EngineState, EngineStateSchema } from '@/src/schemas/engine.schema';
import { IdentityDriftChart } from '@/src/components/IdentityDriftChart';

const INITIAL_CAPITAL = 10000;

export default function Dashboard() {
  const [engineData, setEngineData] = useState<RemoteData<EngineState>>(RemoteData.idle());
  const [logs, setLogs] = useState<{msg: string, type: 'info' | 'error', time: string}[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addLog = useCallback((msg: string, type: 'info' | 'error' = 'info') => {
    setLogs(prev => [{ msg, type, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
  }, []);

  const fetchState = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/state', { signal });
      if (!res.ok) throw new Error('Failed to fetch engine state');
      const data = await res.json();
      const validatedData = EngineStateSchema.parse(data);
      setEngineData(RemoteData.success(validatedData));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setEngineData(RemoteData.error(err instanceof Error ? err.message : 'Unknown error'));
      addLog('Failed to fetch state', 'error');
    }
  }, [addLog]);

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setEngineData(RemoteData.loading());
    fetchState(controller.signal);
    
    const interval = setInterval(() => fetchState(controller.signal), 5000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchState]);

  const runDeepAnalysis = async () => {
    const state = engineData.type === 'success' ? engineData.data : null;
    if (!state) return;
    
    setIsAnalyzing(true);
    const controller = new AbortController();
    try {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        if (!(await window.aistudio.hasSelectedApiKey())) {
          await window.aistudio.openSelectKey();
        }
      }

      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Analyze this trading state and provide tactical adjustments: ${JSON.stringify(state)}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          systemInstruction: "You are Argus, a tactical trading AI. Analyze the market regime, risk parameters, and trade history. Provide clear, concise tactical advice."
        }
      });
      
      setAnalysis(response.text || "Analysis complete.");
      addLog("Deep Strategic Analysis complete");
    } catch (err) {
      addLog("Analysis failed: " + (err instanceof Error ? err.message : "Unknown error"), 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateSpeech = async (text: string) => {
    if (isSpeaking) return;
    setIsSpeaking(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              // 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0)).buffer;
        
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        }
        
        const buffer = await audioContextRef.current.decodeAudioData(audioData);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => setIsSpeaking(false);
        source.start(0);
      } else {
        setIsSpeaking(false);
      }
    } catch (err) {
      console.error("TTS Error:", err);
      setIsSpeaking(false);
    }
  };

  const speakSummary = () => {
    const state = engineData.type === 'success' ? engineData.data : null;
    if (!state) return;
    const pnlVal = state.equity - INITIAL_CAPITAL;
    const text = `Current equity is ${state.equity.toFixed(2)} dollars. Market regime is ${state.regime}. Status is ${state.status}. Total profit and loss is ${pnlVal.toFixed(2)} dollars. Total trades: ${state.trades.length}.`;
    generateSpeech(text);
  };

  const state = engineData.type === 'success' ? engineData.data : null;
  const pnlData = state?.pnlSeries.map((p, i) => ({
    name: i,
    cumulative: p.pnl
  })) || [];

  if (engineData.type === 'loading' && !state) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-zinc-400 font-mono text-sm">INITIALIZING ARGUS v2.1...</p>
        </div>
      </div>
    );
  }

  const currentPnl = state ? state.equity - INITIAL_CAPITAL : 0;
  const currentPnlPercent = state ? (currentPnl / INITIAL_CAPITAL) * 100 : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Top Navigation */}
      <nav className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-zinc-950" />
            </div>
            <h1 className="text-lg font-bold tracking-tight uppercase">AEGIS <span className="text-emerald-500">KRAKEN</span></h1>
            <div className="h-4 w-px bg-zinc-800 mx-2" />
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${state?.status === 'IDLE' ? 'bg-zinc-600' : 'bg-emerald-500 animate-pulse'}`} />
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
                {state?.status || 'OFFLINE'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={speakSummary}
              disabled={isSpeaking}
              className={`p-2 hover:bg-zinc-800 rounded-lg transition-colors ${isSpeaking ? 'text-emerald-500 animate-pulse' : 'text-zinc-400 hover:text-emerald-500'}`}
              title="Voice Summary"
            >
              <Volume2 className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowConfig(true)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button 
              onClick={() => fetchState()}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-zinc-950 rounded-lg font-bold text-sm hover:bg-emerald-400 transition-all active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${engineData.type === 'loading' ? 'animate-spin' : ''}`} />
              REFRESH
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {engineData.type === 'error' && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">System Error: {engineData.message}</p>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard 
            title="Total Equity" 
            value={`${state?.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} 
            icon={<Wallet className="text-emerald-500" />}
            subtitle="Available Liquidity"
          />
          <StatCard 
            title="P&L (Total)" 
            value={`${currentPnl >= 0 ? '+' : ''}${currentPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} 
            icon={<TrendingUp className={currentPnl >= 0 ? 'text-emerald-500' : 'text-red-500'} />}
            subtitle={`${currentPnlPercent.toFixed(2)}% Return`}
            valueColor={currentPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}
          />
          <StatCard 
            title="BTC/USD Price" 
            value={`${state?.lastPrice?.toLocaleString() || '---'}`} 
            icon={<Activity className="text-blue-500" />}
            subtitle="Kraken Pro Real-time"
          />
          <StatCard 
            title="Active Trades" 
            value={state?.trades.filter(t => t.status === 'FILLED').length.toString() || '0'} 
            icon={<Zap className="text-yellow-500" />}
            subtitle={`Total: ${state?.trades.length}`}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Charts & Analysis */}
          <div className="lg:col-span-2 space-y-8">
            {/* P&L Chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                  <h2 className="font-bold uppercase tracking-tight">Profit & Loss Performance</h2>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    Cumulative Equity
                  </span>
                </div>
              </div>
              <div className="p-6 h-[300px]">
                {pnlData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={pnlData}>
                      <defs>
                        <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis 
                        dataKey="name" 
                        stroke="#52525b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="#52525b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(val) => `${val}`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                        itemStyle={{ color: '#10b981' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="cumulative" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorPnl)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-4">
                    <TrendingUp className="w-12 h-12 opacity-20" />
                    <p className="text-xs font-mono uppercase tracking-widest">Awaiting Trade Data for Visualization</p>
                  </div>
                )}
              </div>
            </div>

            {/* Deep Analysis Section */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
                    <Brain className="w-6 h-6 text-purple-500" />
                  </div>
                  <div>
                    <h2 className="font-bold uppercase tracking-tight">Argus Strategic Analysis</h2>
                    <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Powered by Gemini 3.1 Pro</p>
                  </div>
                </div>
                <button 
                  onClick={runDeepAnalysis}
                  disabled={isAnalyzing}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-purple-400 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  RUN ANALYSIS
                </button>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 min-h-[200px] relative overflow-hidden">
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex gap-1">
                        <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 bg-purple-500 rounded-full" />
                        <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 bg-purple-500 rounded-full" />
                        <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 bg-purple-500 rounded-full" />
                      </div>
                      <span className="text-[10px] font-mono text-purple-400 uppercase tracking-widest">Thinking...</span>
                    </div>
                  </div>
                )}
                
                {analysis ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap italic font-serif">{analysis}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-4 py-12">
                    <Brain className="w-12 h-12 opacity-20" />
                    <p className="text-[10px] font-mono uppercase tracking-widest">Awaiting Strategic Command</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Identity & Logs */}
          <div className="space-y-8">
            {/* Identity Profile */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <Cpu className="w-5 h-5 text-emerald-500" />
                <h2 className="font-bold uppercase tracking-tight text-zinc-400">Identity Drift Guard</h2>
              </div>
              
              <div className="space-y-6">
                <IdentityMetric label="AGGRESSION" value={state?.identity?.aggression || 0.5} color="bg-emerald-500" />
                <IdentityMetric label="CAUTION" value={state?.identity?.caution || 0.5} color="bg-blue-500" />
                <IdentityMetric label="EXPLORATION" value={state?.identity?.exploration || 0.25} color="bg-purple-500" />
              </div>

              <div className="mt-6 pt-6 border-t border-zinc-800 h-[250px]">
                <IdentityDriftChart data={state?.identitySeries} event={state?.identityEvent} />
              </div>

              <div className="mt-8 pt-6 border-t border-zinc-800">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest">
                  <span className="text-zinc-500">CONNECTION STATUS</span>
                  <span className={`flex items-center gap-2 ${state?.connected ? 'text-emerald-500' : 'text-red-500'}`}>
                    {state?.connected ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {state?.connected ? 'ESTABLISHED' : 'DISCONNECTED'}
                  </span>
                </div>
              </div>
            </div>

            {/* System Logs */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-zinc-500" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">System Logs</h2>
              </div>
              <div className="p-4 h-[300px] overflow-y-auto font-mono text-[10px] space-y-2 scrollbar-hide">
                {logs.length === 0 && (
                  <div className="text-zinc-700 italic">No logs recorded...</div>
                )}
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-3 animate-in fade-in slide-in-from-left-2">
                    <span className="text-zinc-600 shrink-0">[{log.time}]</span>
                    <span className={log.type === 'error' ? 'text-red-400' : 'text-zinc-400'}>
                      {log.msg}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Trades Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="font-bold uppercase tracking-tight">Recent Trade Activity</h2>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Last 10 Executions
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-950/50 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                  <th className="px-6 py-4 font-medium">Timestamp</th>
                  <th className="px-6 py-4 font-medium">Symbol</th>
                  <th className="px-6 py-4 font-medium">Side</th>
                  <th className="px-6 py-4 font-medium">Notional</th>
                  <th className="px-6 py-4 font-medium">Price</th>
                  <th className="px-6 py-4 font-medium">PnL</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {state?.trades.slice(-10).reverse().map((trade, i) => (
                  <tr key={i} className="text-sm hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-4 text-zinc-500 font-mono text-xs">
                      {new Date(trade.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-6 py-4 font-bold">{trade.symbol}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${trade.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                        {trade.side}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">${trade.filledNotional.toFixed(2)}</td>
                    <td className="px-6 py-4 font-mono text-xs">${trade.avgPrice?.toLocaleString() || 'N/A'}</td>
                    <td className="px-6 py-4 font-mono text-xs font-bold">
                      <div className="flex flex-col">
                        <span className={trade.pnl && trade.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                          {trade.pnl ? `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}` : '0.00'}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-normal">
                          {trade.pnl ? `${((trade.pnl / trade.filledNotional) * 100).toFixed(2)}%` : '0.00%'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${trade.status === 'FILLED' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="text-[10px] text-zinc-400 uppercase font-mono">{trade.status}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!state?.trades || state.trades.length === 0) && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-600 font-mono uppercase tracking-widest text-xs">
                      No trade history available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Config Modal */}
      <AnimatePresence>
        {showConfig && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfig(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-800 rounded-xl">
                    <Key className="text-emerald-500 w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold uppercase tracking-tight">API Configuration</h2>
                </div>
                <button onClick={() => setShowConfig(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Kraken API Key</label>
                  <input 
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter API Key..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors text-zinc-300"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Kraken Private Key</label>
                  <input 
                    type="password"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder="Enter Private Key..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors text-zinc-300"
                  />
                </div>
                
                <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-xl">
                  <div className="flex gap-3">
                    <Shield className="w-5 h-5 text-emerald-500 shrink-0" />
                    <p className="text-[10px] text-zinc-400 leading-relaxed uppercase tracking-tight">
                      For production, use <span className="text-emerald-500 font-bold">AI Studio Secrets</span>. 
                      Keys entered here are stored in memory for the current session only.
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setShowConfig(false)}
                  className="w-full py-3 bg-emerald-500 text-zinc-950 rounded-lg font-bold hover:bg-emerald-400 transition-all uppercase tracking-widest text-xs"
                >
                  SAVE CONFIGURATION
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ title, value, icon, subtitle, valueColor = 'text-white' }: { title: string, value: string, icon: React.ReactNode, subtitle: string, valueColor?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl hover:border-zinc-700 transition-colors group"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{title}</span>
        <div className="p-2 bg-zinc-800 rounded-xl group-hover:scale-110 transition-transform">
          {icon}
        </div>
      </div>
      <div className={`text-2xl font-bold tracking-tight mb-1 ${valueColor}`}>{value}</div>
      <div className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest">{subtitle}</div>
    </motion.div>
  );
}

function IdentityMetric({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-mono mb-2 uppercase tracking-widest">
        <span className="text-zinc-500">{label}</span>
        <span className={color.replace('bg-', 'text-')}>{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          className={`h-full ${color}`} 
        />
      </div>
    </div>
  );
}
