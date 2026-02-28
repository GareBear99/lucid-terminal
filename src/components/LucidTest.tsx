import { useState, useEffect } from 'react';

export default function LucidTest() {
  const [initialized, setInitialized] = useState(false);
    const [input, setInput] = useState('');
    const [output, setOutput] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

  useEffect(() => {
    initLucid();
  }, []);

  const initLucid = async () => {
    try {
      const result = await window.lucidAPI.lucid.init();
      if (result.success) {
        setInitialized(true);
        const welcomeMsg = await window.lucidAPI.lucid.getWelcome();
        setOutput([welcomeMsg]);
      } else {
        setOutput([`❌ Failed to initialize: ${result.error}`]);
      }
    } catch (error: any) {
      setOutput([`❌ Error: ${error.message}`]);
    }
  };

  const handleCommand = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    const userInput = input;
    setInput('');

    try {
      // Add user input to output
      setOutput(prev => [...prev, `\n$ ${userInput}`]);

      // Process command
      const result = await window.lucidAPI.lucid.command(userInput);

      if (result.success) {
        setOutput(prev => [...prev, result.terminalOutput]);
      } else {
        setOutput(prev => [...prev, `❌ Error: ${result.error}`]);
      }
    } catch (error: any) {
      setOutput(prev => [...prev, `❌ Error: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  };

  const handleHelp = async () => {
    const help = await window.lucidAPI.lucid.getHelp();
    setOutput(prev => [...prev, '\n', help]);
  };

  const handleStats = async () => {
    try {
      const stats = await window.lucidAPI.lucid.getTokenStats();
      const fixnetStats = await window.lucidAPI.lucid.getFixNetStats();
      const modelStatuses = await window.lucidAPI.lucid.getModelStatuses();

      const statsOutput = [
        '\n📊 System Statistics:',
        '\nToken Stats:',
        JSON.stringify(stats, null, 2),
        '\nFixNet Stats:',
        JSON.stringify(fixnetStats, null, 2),
        '\nModel Statuses:',
        JSON.stringify(modelStatuses, null, 2)
      ].join('\n');

      setOutput(prev => [...prev, statsOutput]);
    } catch (error: any) {
      setOutput(prev => [...prev, `❌ Error: ${error.message}`]);
    }
  };

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      backgroundColor: '#0d1117',
      color: '#c9d1d9',
      padding: '20px',
      fontFamily: 'monospace',
      overflow: 'auto'
    }}>
      <h1>🚀 Lucid Terminal - Workflow Test</h1>

      {!initialized ? (
        <div>Initializing Lucid Core...</div>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <button onClick={handleHelp} style={{
              marginRight: '10px',
              padding: '8px 16px',
              backgroundColor: '#238636',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}>
              Show Help
            </button>
            <button onClick={handleStats} style={{
              padding: '8px 16px',
              backgroundColor: '#1f6feb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}>
              Show Stats
            </button>
          </div>

          <div style={{
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '6px',
            padding: '16px',
            marginBottom: '20px',
            whiteSpace: 'pre-wrap',
            maxHeight: '60vh',
            overflow: 'auto'
          }}>
            {output.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCommand()}
              placeholder="Enter command (e.g., 'help', 'ls', 'build a script')"
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                fontSize: '14px'
              }}
            />
            <button
              onClick={handleCommand}
              disabled={loading}
              style={{
                padding: '12px 24px',
                backgroundColor: loading ? '#6e7681' : '#238636',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Processing...' : 'Send'}
            </button>
          </div>

          <div style={{
            marginTop: '20px',
            fontSize: '12px',
            color: '#8b949e'
          }}>
            <h3>Example Commands:</h3>
            <ul>
              <li><code>help</code> - Show available commands</li>
              <li><code>ls</code> - List files (direct command, no LLM)</li>
              <li><code>build a Python script to sort numbers</code> - Script generation</li>
              <li><code>fix TypeError: undefined is not a function</code> - Error fixing</li>
              <li><code>What is the difference between let and const?</code> - Query</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
