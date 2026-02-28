# Lucid Terminal

An AI-powered terminal application for Windows, built with Electron, React, and TypeScript.

![Lucid Terminal](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### 🤖 AI Assistant
- ChatGPT integration with streaming responses
- Natural language command suggestions
- Code assistance and explanations
- Secure API key storage using Windows DPAPI encryption

### 💻 Terminal
- Full PTY (pseudo-terminal) support
- Multiple terminal tabs
- PowerShell, CMD, WSL, and Git Bash support
- Customizable cursor styles and settings
- Command history

### 📁 File Explorer
- Create, edit, and delete files and folders
- Monaco Editor for file editing with syntax highlighting
- File tree navigation
- Search functionality

### 🎨 Themes
Six beautiful built-in themes:
1. **Dark** - GitHub-inspired dark theme (default)
2. **Light** - Clean light theme
3. **Midnight** - Deep blue/black with cyan accents
4. **Ocean** - Navy blue with teal accents
5. **Forest** - Dark green with lime accents
6. **Sunset** - Warm dark tones with orange/pink accents

Plus a **Custom Theme Builder** where you can create your own color scheme!

### ⚙️ Settings
- Font family and size customization
- Shell selection
- Cursor style and blink settings
- AI model and temperature configuration
- Terminal command policies
- Import/Export settings

## Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Windows 10/11

### Setup

1. Navigate to the project directory:
```bash
cd lucid-terminal
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode:
```bash
npm run electron:dev
```

4. Build for production:
```bash
npm run build:win
```

The installer will be created in the `release` folder.

## Usage

### First Launch
1. When you first open Lucid Terminal, you'll be prompted to enter your OpenAI API key
2. Enter your API key in the AI panel or Settings > AI
3. Your key is encrypted using Windows DPAPI and stored securely

### Keyboard Shortcuts
- `Ctrl+S` - Save file (in editor)
- `Ctrl+T` - New terminal tab
- `Ctrl+W` - Close current tab
- `Enter` - Send message to AI (in chat)
- `Shift+Enter` - New line in AI chat

### Terminal
- Click the + button to create new terminal tabs
- Right-click for context menu options
- Resize panels by dragging the borders

### AI Assistant
- Type natural language questions or commands
- Code blocks can be copied with one click
- Executable commands show a "Run" button

## Security

### API Key Storage
Your OpenAI API key is **never stored in plain text**. It is:
1. Encrypted using Electron's `safeStorage` API
2. On Windows, this uses DPAPI (Data Protection API)
3. Only decrypted in memory when making API calls
4. Never sent to any server except OpenAI

### Architecture
- Context isolation enabled
- Node integration disabled in renderer
- All sensitive operations through secure IPC channels

## Tech Stack

- **Electron** - Desktop application framework
- **React 18** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **xterm.js** - Terminal emulator
- **node-pty** - PTY for shell integration
- **Monaco Editor** - Code editing
- **OpenAI SDK** - AI integration

## Project Structure

```
lucid-terminal/
├── electron/           # Electron main process
│   ├── main.ts        # Main entry point
│   ├── preload.ts     # IPC bridge
│   ├── ipc/           # IPC handlers
│   └── services/      # Backend services
├── src/               # React frontend
│   ├── components/    # UI components
│   ├── stores/        # Zustand stores
│   ├── themes/        # Theme definitions
│   └── types/         # TypeScript types
└── resources/         # Static assets
```

## Building from Source

```bash
# Install dependencies
npm install

# Development
npm run electron:dev

# Build for Windows
npm run build:win

# Type checking
npm run typecheck
```

## License

MIT License - feel free to use and modify!

---

Built with ❤️ using Electron + React
