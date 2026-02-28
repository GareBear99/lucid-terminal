/**
 * Media Input Component
 * 
 * Supports:
 * - Image upload (drag-drop, paste, button)
 * - Voice input (Web Speech API)
 * - Directory tracking (cd command)
 * 
 * Matches Warp's media capabilities
 */

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { ImageUploadLimiter } from './ErrorNotification';

interface MediaInputProps {
  onImageUpload: (file: File) => void;
  onVoiceInput: (text: string) => void;
  onTextInput: (text: string) => void;
  onImageLimitExceeded?: (path: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  maxImages?: number;
}

export function MediaInput({ 
  onImageUpload, 
  onVoiceInput, 
  onTextInput, 
  onImageLimitExceeded,
  onError,
  disabled = false,
  maxImages = 3
}: MediaInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const imageLimiter = useRef(new ImageUploadLimiter(maxImages));
  
  // Set up notification callback
  useEffect(() => {
    if (onError) {
      imageLimiter.current.setNotificationCallback(onError);
    }
  }, [onError]);
  
  // Initialize Web Speech API
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';
      
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        onVoiceInput(transcript);
        onTextInput(transcript);
        setIsRecording(false);
      };
      
      recognitionRef.current.onerror = (event: any) => {
        console.error('[Voice] Recognition error:', event.error);
        setIsRecording(false);
      };
      
      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
  }, [onVoiceInput, onTextInput]);
  
  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser');
      return;
    }
    
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };
  
  const handleImageSelect = (files: FileList | null) => {
    if (!files) return;
    
    const imageFiles = Array.from(files).filter(file =>
      file.type.startsWith('image/')
    );
    
    if (imageFiles.length === 0) {
      if (onError) {
        onError('Please select valid image files (PNG, JPG, GIF)');
      }
      return;
    }
    
    // Process each image with limiter
    imageFiles.forEach(file => {
      const result = imageLimiter.current.handleImageUpload(file);
      
      if (result.allowed) {
        // Upload allowed - add to preview and upload
        setUploadedImages(prev => [...prev, file]);
        onImageUpload(file);
      } else if (result.shouldInsertPath && result.path) {
        // Limit exceeded - insert path into input
        if (onImageLimitExceeded) {
          onImageLimitExceeded(result.path);
        }
      }
    });
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    handleImageSelect(e.dataTransfer.files);
  };
  
  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    const imageItems = Array.from(items).filter(item =>
      item.type.startsWith('image/')
    );
    
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) {
        setUploadedImages(prev => [...prev, file]);
        onImageUpload(file);
      }
    }
  };
  
  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);
  
  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
    // Note: We don't decrement the limiter count as per Warp's behavior
    // The limit is per conversation, not per currently attached images
  };
  
  // Show image count indicator
  const remainingImages = imageLimiter.current.getRemainingCount();
  
  return (
    <div className="media-input-container">
      {/* Drag-drop overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-blue-500/20 border-2 border-dashed border-blue-400 flex items-center justify-center">
          <div className="text-center">
            <ImageIcon size={48} className="mx-auto mb-2 text-blue-400" />
            <p className="text-lg font-medium text-blue-400">Drop images here</p>
          </div>
        </div>
      )}
      
      {/* Media controls */}
      <div
        className="flex items-center gap-2 p-2 border-t border-[var(--border)]"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Voice input button */}
        <button
          onClick={toggleRecording}
          disabled={disabled}
          className={`p-2 rounded-md transition-colors ${
            isRecording
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
          }`}
          title={isRecording ? 'Stop recording' : 'Start voice input'}
        >
          {isRecording ? (
            <><Mic size={18} className="animate-pulse" /> Recording...</>
          ) : (
            <Mic size={18} />
          )}
        </button>
        
        {/* Image upload button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleImageSelect(e.target.files)}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="p-2 rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
          title="Upload image"
        >
          <ImageIcon size={18} />
        </button>
        
        {/* Uploaded images preview */}
        {uploadedImages.length > 0 && (
          <div className="flex gap-2 flex-1 overflow-x-auto">
            {uploadedImages.map((file, index) => (
              <div key={index} className="relative group">
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="h-12 w-12 rounded object-cover border border-[var(--border)]"
                />
                <button
                  onClick={() => removeImage(index)}
                  className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove image"
                >
                  <X size={12} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Directory Tracker Component
 * 
 * Tracks current directory from cd commands
 * Updates terminal state and file sidebar
 */

interface DirectoryTrackerProps {
  currentDir: string;
  onDirectoryChange: (newDir: string) => void;
}

export function DirectoryTracker({ currentDir, onDirectoryChange }: DirectoryTrackerProps) {
  return (
    <div className="directory-tracker flex items-center gap-2 px-3 py-1 bg-[var(--bg-secondary)] border-b border-[var(--border)] text-xs font-mono">
      <span className="text-[var(--text-muted)]">pwd:</span>
      <span className="text-[var(--accent)] font-medium">{currentDir}</span>
    </div>
  );
}

/**
 * CD Command Interceptor
 * 
 * Intercepts cd commands and updates directory state
 */

export class CDTracker {
  private currentDir: string;
  private callbacks: Array<(dir: string) => void> = [];
  
  constructor(initialDir: string) {
    this.currentDir = initialDir;
  }
  
  /**
   * Process command and check if it's a cd command
   */
  processCommand(command: string): { isCd: boolean; newDir?: string } {
    const trimmed = command.trim();
    
    // Match cd commands
    const cdMatch = trimmed.match(/^cd\s+(.+)$/);
    if (!cdMatch) {
      return { isCd: false };
    }
    
    const target = cdMatch[1].trim().replace(/["']/g, '');
    const newDir = this.resolvePath(target);
    
    this.currentDir = newDir;
    this._notify(newDir);
    
    return { isCd: true, newDir };
  }
  
  /**
   * Resolve relative/absolute paths
   */
  private resolvePath(target: string): string {
    if (target === '~') {
      return require('os').homedir();
    }
    
    if (target.startsWith('/')) {
      return target;
    }
    
    if (target === '..') {
      const parts = this.currentDir.split('/');
      parts.pop();
      return parts.join('/') || '/';
    }
    
    if (target === '.') {
      return this.currentDir;
    }
    
    // Relative path
    return `${this.currentDir}/${target}`.replace(/\/+/g, '/');
  }
  
  /**
   * Subscribe to directory changes
   */
  subscribe(callback: (dir: string) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }
  
  /**
   * Notify subscribers
   */
  private _notify(dir: string): void {
    for (const callback of this.callbacks) {
      callback(dir);
    }
  }
  
  /**
   * Get current directory
   */
  getCurrentDir(): string {
    return this.currentDir;
  }
  
  /**
   * Set directory manually
   */
  setCurrentDir(dir: string): void {
    this.currentDir = dir;
    this._notify(dir);
  }
}
