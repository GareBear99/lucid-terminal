/**
 * Complete Integration Example
 * 
 * Shows how to wire up:
 * - Error notifications (Warp-style)
 * - Image upload with 3-image limit
 * - Voice input
 * - CD tracking
 * - Auto-fade settings
 */

import { useState, useRef, useEffect } from 'react';
import { MediaInput, DirectoryTracker, CDTracker } from './MediaInput';
import { 
  ErrorNotification, 
  useNotifications, 
  RequestErrorHandler,
  AutoFadeSettings 
} from './ErrorNotification';

export function TerminalWithNotifications() {
  // Notifications
  const {
    notifications,
    autoFadeEnabled,
    setAutoFadeEnabled,
    removeNotification,
    error,
    warning,
    success,
    info
  } = useNotifications();
  
  // Directory tracking
  const [currentDir, setCurrentDir] = useState('/Users/home');
  const cdTracker = useRef(new CDTracker(currentDir));
  
  // Request error handler
  const errorHandler = useRef(new RequestErrorHandler());
  
  // Set up error handler callback
  useEffect(() => {
    errorHandler.current.setNotificationCallback((message, type) => {
      if (type === 'error') error(message);
      else if (type === 'warning') warning(message);
      else if (type === 'success') success(message);
      else info(message);
    });
  }, [error, warning, success, info]);
  
  // Subscribe to directory changes
  useEffect(() => {
    return cdTracker.current.subscribe(setCurrentDir);
  }, []);
  
  // Handle command execution
  const handleCommand = async (cmd: string) => {
    try {
      // Check for cd command
      const cdResult = cdTracker.current.processCommand(cmd);
      if (cdResult.isCd) {
        success(`Changed directory to ${cdResult.newDir}`);
        return;
      }
      
      // Execute command
      const result = await window.lucidAPI.terminal.executeCommand(cmd);
      
      if (!result.success) {
        throw new Error(result.error || 'Command failed');
      }
      
    } catch (err) {
      errorHandler.current.handleError(err as Error, 'Command execution');
    }
  };
  
  // Handle image upload
  const handleImageUpload = async (file: File) => {
    try {
      // Convert to base64
      const base64 = await fileToBase64(file);
      
      // Send to LLM vision API
      const response = await window.lucidAPI.llm.vision({
        image: base64,
        prompt: 'Analyze this image'
      });
      
      if (response.success) {
        success('Image analyzed successfully');
      }
      
    } catch (err) {
      errorHandler.current.handleError(err as Error, 'Image analysis');
    }
  };
  
  // Handle image limit exceeded - insert path
  const handleImageLimitExceeded = (path: string) => {
    // Insert path into terminal input
    const input = document.querySelector('textarea[data-terminal-input]') as HTMLTextAreaElement;
    if (input) {
      const currentValue = input.value;
      input.value = currentValue + (currentValue ? ' ' : '') + path;
      input.focus();
    }
  };
  
  // Handle voice input
  const handleVoiceInput = (text: string) => {
    info(`Voice input: "${text}"`);
  };
  
  return (
    <div className="terminal-container">
      {/* Error Notifications */}
      <ErrorNotification
        notifications={notifications}
        onDismiss={removeNotification}
        autoFadeEnabled={autoFadeEnabled}
      />
      
      {/* Directory Tracker */}
      <DirectoryTracker
        currentDir={currentDir}
        onDirectoryChange={setCurrentDir}
      />
      
      {/* Terminal Content */}
      <div className="terminal-content">
        {/* ... your terminal blocks ... */}
      </div>
      
      {/* Media Input Controls */}
      <MediaInput
        onImageUpload={handleImageUpload}
        onVoiceInput={handleVoiceInput}
        onTextInput={handleCommand}
        onImageLimitExceeded={handleImageLimitExceeded}
        onError={error}
        maxImages={3}
      />
      
      {/* Settings Panel (show in settings) */}
      <div className="hidden" id="notification-settings">
        <AutoFadeSettings
          enabled={autoFadeEnabled}
          onChange={setAutoFadeEnabled}
        />
      </div>
    </div>
  );
}

// Helper function
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Example: Manual notification triggers
 */

export function NotificationExamples() {
  const { error, warning, success, info } = useNotifications();
  
  return (
    <div className="space-y-2 p-4">
      <button onClick={() => error('Network error - check your connection')}>
        Show Error
      </button>
      
      <button onClick={() => warning('Model taking longer than expected')}>
        Show Warning
      </button>
      
      <button onClick={() => success('Command completed successfully')}>
        Show Success
      </button>
      
      <button onClick={() => info('Sync complete: pulled 15 fixes')}>
        Show Info
      </button>
      
      <button onClick={() => {
        error('1 image wasn\'t attached - limit is 3 images per conversation.');
      }}>
        Show Image Limit Error
      </button>
    </div>
  );
}

/**
 * Example: Request error handling
 */

export function RequestErrorExample() {
  const { error } = useNotifications();
  const errorHandler = useRef(new RequestErrorHandler());
  
  useEffect(() => {
    errorHandler.current.setNotificationCallback((message, type) => {
      if (type === 'error') error(message);
    });
  }, [error]);
  
  const makeRequest = async () => {
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        body: JSON.stringify({ model: 'llama2', prompt: 'Hello' })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
    } catch (err) {
      errorHandler.current.handleError(err as Error, 'LLM request');
    }
  };
  
  return (
    <button onClick={makeRequest}>
      Make Request
    </button>
  );
}

/**
 * Add to globals.css:
 * 
 * @keyframes slide-in-right {
 *   from {
 *     opacity: 0;
 *     transform: translateX(100%);
 *   }
 *   to {
 *     opacity: 1;
 *     transform: translateX(0);
 *   }
 * }
 * 
 * .animate-slide-in-right {
 *   animation: slide-in-right 0.3s ease-out;
 * }
 */
