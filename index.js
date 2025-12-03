import React, { useState } from 'react';
import { BotConfig, Tab } from './types';
import { IntentsGuide } from './components/IntentsGuide';
import { CodeGenerator } from './components/CodeGenerator';
import { generateWelcomeMessage } from './services/geminiService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.CONFIG);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [serverTheme, setServerTheme] = useState('');
  
  // Estado para o simulador do preview
  const [previewMode, setPreviewMode] = useState<'suspicious' | 'safe'>('suspicious');

  const [config, setConfig] = useState<BotConfig>({
    botToken: '',
    clientId: '',
    guildId: '',
    logChannelId: '1445105097796223078', // Canal de Entrada / Segurança (ID Atualizado)
    exitChannelId: '1445105144869032129', // Canal de Saída (ID Atualizado)
    minAccountAgeDays: 7,
    kickSuspicious: false,
    welcomeMessage: '🛡️ PROTOCOLO DE SEGURANÇA: Análise de novo usuário iniciada.',
    language: 'pt-BR',
    enableHttpServer: true 
  });

  const handleAiGenerate = async () => {
    if (!serverTheme) return;
    setIsLoadingAi(true);
    const message = await generateWelcomeMessage(serverTheme, config.kickSuspicious ? 'Militar/Rígido' : 'Tático/Moderado');
    setConfig(prev => ({ ...prev, welcomeMessage: message }));
    setIsLoadingAi(false);
  };

  // Função auxiliar para renderizar a barra de progresso visualmente no preview
  const renderProgressBar = (filled: number, total: number = 10) => {
    return (
      <span className="font-mono text-[10px] tracking-tighter">
        <span className="text-[#57F287]">{'█'.repeat(filled)}</span>
        <span className="text-[#40444B]">{'░'.repeat(total - filled)}</span>
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-red-500 selection:text-white">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 bg-gradient-to-br from-red-600 to-red-900 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/50">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
                Discord Guardian
              </h1>
              <span className="text-[10px] uppercase tracking-wider text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">Security System</span>
            </div>
          </div>
          <nav className="flex space-x-1 bg-slate-800/50 p-1 rounded-lg border border-slate-700">
            {[
              { id: Tab.CONFIG, label: 'Configuração' },
              { id: Tab.INTENTS_GUIDE, label: 'Intents (Obrigatório)' },
              { id: Tab.GENERATED_CODE, label: 'Baixar Código' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id 
                    ? 'bg-slate-700 text-white shadow-sm ring-1 ring-slate-600' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Tab Content: Configuration */}
        {activeTab === Tab.CONFIG && (
          <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
            
            {/* Intro Banner */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-1 rounded-2xl border border-slate-700 shadow-2xl">
                <div className="bg-slate-900/90 backdrop-blur rounded-xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                    <h2 className="text-2xl font-bold text-white mb-2">Painel de Controle Anti-Raid</h2>
                    <p className="text-slate-400">Configure os parâmetros de segurança para o seu servidor. O sistema gerará código otimizado para Render, com verificações automáticas de erro.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Left Column: Settings */}
                <div className="xl:col-span-2 space-y-6">
                    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-red-400">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                        Parâmetros do Sentinela
                    </h3>
                    
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                                Canal de Entrada (Segurança)
                            </label>
                            <input
                                type="text"
                                value={config.logChannelId}
                                onChange={(e) => setConfig({...config, logChannelId: e.target.value})}
                                placeholder="ID do Canal"
                                className="w-full bg-black/30 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition font-mono text-sm"
                            />
                            </div>
                            <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                                Canal de Saída (Logs)
                            </label>
                            <input
                                type="text"
                                value={config.exitChannelId}
                                onChange={(e) => setConfig({...config, exitChannelId: e.target.value})}
                                placeholder="ID do Canal"
                                className="w-full bg-black/30 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition font-mono text-sm"
                            />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                            Min. Dias (Conta Segura)
                            </label>
                            <input
                            type="number"
                            value={config.minAccountAgeDays}
                            onChange={(e) => setConfig({...config, minAccountAgeDays: parseInt(e.target.value)})}
                            className="w-full bg-black/30 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition font-mono"
                            />
                        </div>
                        
                        <div className="flex items-center justify-between bg-black/30 border border-slate-700 rounded-lg p-3">
                            <div>
                            <span className="block text-sm font-medium text-white">Auto-Kick</span>
                            <span className="text-xs text-slate-500">Expulsar se conta for nova</span>
                            </div>
                            <button
                            onClick={() => setConfig({...config, kickSuspicious: !config.kickSuspicious})}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                config.kickSuspicious ? 'bg-red-500' : 'bg-slate-700'
                            }`}
                            >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.kickSuspicious ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                        </div>

                        <div className="flex items-center justify-between bg-blue-900/10 border border-blue-500/20 rounded-lg p-4">
                            <div>
                            <span className="block text-sm font-medium text-blue-200">Compatibilidade Render/Replit</span>
                            <span className="text-xs text-blue-400/70">Sistema Anti-Sleep ativado (Auto-Ping)</span>
                            </div>
                            <button
                            onClick={() => setConfig({...config, enableHttpServer: !config.enableHttpServer})}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                config.enableHttpServer ? 'bg-blue-500' : 'bg-slate-700'
                            }`}
                            >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enableHttpServer ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>
                    </div>

                    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <svg className="w-24 h-24 text-purple-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6a1 1 0 0 0-1 1v5a1 1 0 0 0 .293.707l3 3a1 1 0 0 0 1.414-1.414L13 11.586V7a1 1 0 0 0-1-1z"/></svg>
                        </div>
                        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-purple-400">
                             Cabeçalho do Alerta (IA)
                        </h3>
                        
                        <div className="space-y-4 relative z-10">
                            <div className="flex gap-2">
                                <input
                                type="text"
                                value={serverTheme}
                                onChange={(e) => setServerTheme(e.target.value)}
                                placeholder="Tema do servidor (ex: RPG, Loja, Comunidade Tech)"
                                className="flex-1 bg-black/30 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 outline-none transition"
                                />
                                <button
                                onClick={handleAiGenerate}
                                disabled={isLoadingAi || !serverTheme}
                                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 whitespace-nowrap"
                                >
                                {isLoadingAi ? <span className="animate-spin">🔄</span> : '✨ Gerar'}
                                </button>
                            </div>

                            <textarea
                                rows={2}
                                value={config.welcomeMessage}
                                onChange={(e) => setConfig({...config, welcomeMessage: e.target.value})}
                                className="w-full bg-black/30 border border-slate-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 outline-none transition font-mono text-sm text-purple-200"
                            />
                        </div>
                    </div>
                </div>

                {/* Right Column: Preview/Ideas */}
                <div className="space-y-6">
                    <div className="bg-slate-800 rounded-xl p-1 border border-slate-700 shadow-lg sticky top-24">
                         <div className="bg-slate-900 rounded-t-lg p-2 flex gap-2 justify-center border-b border-slate-700">
                             <button 
                                onClick={() => setPreviewMode('suspicious')}
                                className={`text-xs px-3 py-1 rounded font-bold transition ${previewMode === 'suspicious' ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                             >
                                 Simular Ameaça
                             </button>
                             <button 
                                onClick={() => setPreviewMode('safe')}
                                className={`text-xs px-3 py-1 rounded font-bold transition ${previewMode === 'safe' ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                             >
                                 Simular Seguro
                             </button>
                         </div>
                        
                        <div className="bg-[#313338] rounded-b-lg p-4 font-sans text-left">
                            {/* Fake Discord Embed Preview */}
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-indigo-500 flex-shrink-0 mt-1"></div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-white font-medium hover:underline cursor-pointer">Guardian Bot</span>
                                        <span className="text-[10px] bg-[#5865F2] text-white px-1.5 rounded-[3px] py-[1px] flex items-center h-4 font-medium">BOT</span>
                                        <span className="text-xs text-slate-400">Hoje às 14:30</span>
                                    </div>
                                    
                                    {/* The Embed */}
                                    <div className={`mt-1 border-l-4 ${previewMode === 'suspicious' ? 'border-[#ED4245] bg-[#2b2d31]' : 'border-[#57F287] bg-[#2b2d31]'} rounded-r-[4px] p-3 max-w-sm shadow-md`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-6 h-6 rounded-full bg-slate-500"></div>
                                            <span className="text-sm font-bold text-white">Novo Usuario</span>
                                        </div>
                                        
                                        <h4 className="font-bold text-white text-sm mb-2 hover:underline cursor-pointer">
                                            {previewMode === 'suspicious' ? '⛔ ALERTA DE SEGURANÇA: CONTA DE RISCO' : '✅ ACESSO PERMITIDO: CONTA SEGURA'}
                                        </h4>
                                        
                                        {/* Description with quoted message */}
                                        <div className="text-sm text-slate-300 mb-3 whitespace-pre-wrap break-words">
                                            <span className="opacity-50 mr-1">&gt;</span>{config.welcomeMessage}
                                            <br/><br/>
                                            <strong className="text-white">📋 Análise Técnica:</strong>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-2 mb-3">
                                            <div>
                                                <span className="text-xs font-bold text-slate-300 block mb-1">🆔 Identificação (ID)</span>
                                                <div className="bg-[#1e1f22] p-1.5 rounded text-[10px] font-mono text-[#00b0f4] border border-[#1e1f22]">
                                                    123456789012345678
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-slate-300 block mb-1">🤖 Tipo</span>
                                                <div className="bg-[#1e1f22] p-1.5 rounded text-[10px] font-mono text-[#e67e22] border border-[#1e1f22]">
                                                    HUMANO
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mb-3">
                                            <span className="text-xs font-bold text-slate-300 block mb-1">⏳ Idade da Conta</span>
                                            <div className="text-sm text-slate-200">
                                                <strong>{previewMode === 'suspicious' ? '1 dia' : '532 dias'}</strong>
                                                <br/>
                                                {renderProgressBar(previewMode === 'suspicious' ? 1 : 10)}
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-[#40444B]">
                                            <div className="w-4 h-4 rounded-full bg-indigo-500"></div>
                                            <span className="text-[10px] text-slate-400">Security System v2.0 • Hoje às 14:30</span>
                                        </div>
                                    </div>

                                    {/* Buttons */}
                                    <div className="mt-2 flex gap-2 flex-wrap">
                                        <div className="h-8 bg-[#DA373C] hover:bg-[#A1282C] text-white rounded-[3px] px-3 flex items-center text-sm font-medium transition cursor-pointer shadow-sm border-b-2 border-[#802124] active:border-b-0 active:translate-y-[2px]">
                                            🥾 EXPULSAR
                                        </div>
                                        <div className="h-8 bg-[#DA373C] hover:bg-[#A1282C] text-white rounded-[3px] px-3 flex items-center text-sm font-medium transition cursor-pointer shadow-sm border-b-2 border-[#802124] active:border-b-0 active:translate-y-[2px]">
                                            🔨 BANIR AGENTE
                                        </div>
                                        <div className="h-8 bg-[#4E5058] hover:bg-[#3d3f45] text-white rounded-[3px] px-3 flex items-center text-sm font-medium transition cursor-pointer shadow-sm border-b-2 border-[#2b2d31] active:border-b-0 active:translate-y-[2px]">
                                            📄 RELATÓRIO
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <p className="text-center text-[10px] text-slate-500 mt-4 uppercase tracking-widest font-bold opacity-50">
                                Visualização do Canal de Entrada
                            </p>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
                        <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                            💡 Dicas Rápidas
                        </h4>
                        <ul className="text-sm text-slate-400 space-y-2 list-disc list-inside">
                            <li>O Bot agora usa 2 canais: <strong>Entrada</strong> (Alertas) e <strong>Saída</strong> (Logs).</li>
                            <li>A mensagem suporta variáveis simples, mas focamos em texto puro para segurança.</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setActiveTab(Tab.INTENTS_GUIDE)}
                className="bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-lg font-semibold shadow-lg shadow-red-500/20 transition transform hover:scale-105 flex items-center gap-2"
              >
                Próximo Passo <span className="text-xl">&rarr;</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab Content: Intents Guide */}
        {activeTab === Tab.INTENTS_GUIDE && (
          <div className="animate-fade-in space-y-8">
            <IntentsGuide />
             <div className="flex justify-between max-w-4xl mx-auto">
              <button
                onClick={() => setActiveTab(Tab.CONFIG)}
                className="text-slate-400 hover:text-white px-6 py-3 font-medium transition"
              >
                &larr; Voltar
              </button>
              <button
                onClick={() => setActiveTab(Tab.GENERATED_CODE)}
                className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-lg font-semibold shadow-lg shadow-green-500/20 transition transform hover:scale-105"
              >
                Gerar Código Final &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Tab Content: Generated Code */}
        {activeTab === Tab.GENERATED_CODE && (
          <div className="max-w-5xl mx-auto animate-fade-in space-y-6">
            <div className="bg-green-900/20 border border-green-500/30 p-6 rounded-xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 text-2xl">
                🚀
              </div>
              <div>
                <h3 className="font-bold text-green-200 text-lg">Pronto para o Deploy</h3>
                <p className="text-sm text-green-100/70">
                  Substitua os arquivos no seu GitHub. O código já contém o sistema <strong>Anti-Sleep</strong> e <strong>Canais Separados</strong>.
                </p>
              </div>
            </div>

            {/* Visual Guide for Directory Structure */}
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-700">
                <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                    <span className="text-xl">📂</span> Onde colocar os arquivos?
                </h4>
                <div className="bg-black/50 p-4 rounded-lg font-mono text-sm text-slate-300">
                    <div className="mb-2 text-yellow-400 font-bold">Seu-Repositorio-GitHub/</div>
                    <div className="ml-4 flex items-center gap-2 p-1 bg-white/5 rounded">
                        <span>📄</span>
                        <span className="text-green-400 font-bold">index.js</span>
                        <span className="text-slate-500 text-xs">(Arquivo Principal - Cole o código maior aqui)</span>
                    </div>
                    <div className="ml-4 flex items-center gap-2 p-1 mt-1 bg-white/5 rounded">
                        <span>📄</span>
                        <span className="text-yellow-400 font-bold">package.json</span>
                        <span className="text-slate-500 text-xs">(Configuração - Cole o código menor aqui)</span>
                    </div>
                    <div className="ml-4 flex items-center gap-2 p-1 mt-1 opacity-50">
                        <span>📄</span>
                        <span>README.md</span>
                    </div>
                    <p className="mt-4 text-xs text-slate-400 border-t border-slate-700 pt-2">
                        ⚠️ <strong>Não crie pastas</strong> como "src" ou "bot". Coloque os arquivos soltos na raiz, exatamente como mostrado acima.
                    </p>
                </div>
            </div>

            <CodeGenerator config={config} />
             
             <div className="flex justify-start">
              <button
                onClick={() => setActiveTab(Tab.INTENTS_GUIDE)}
                className="text-slate-400 hover:text-white px-6 py-3 font-medium transition"
              >
                &larr; Voltar para Configurações
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;