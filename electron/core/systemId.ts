/**
 * System ID Manager - Read LuciferAI user ID from persistent storage
 * Mirrors Python system_id.py functionality
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export interface SystemIdData {
  user_id?: string;
  github_username?: string;
  github_id?: string;
  os_type?: string;
  is_raspberry_pi?: boolean;
  assigned_via?: string;
}

export interface UserIdInfo {
  userId: string;
  isPermanent: boolean;
  githubUsername?: string;
  storagePath?: string;
}

export class SystemIdManager {
  private idFilePath: string;
  private osType: string;

  constructor() {
    this.osType = os.platform();
    this.idFilePath = this.getOsSpecificPath();
  }

  /**
   * Get OS-specific path for system ID storage
   * Must match Python system_id.py paths exactly
   */
  private getOsSpecificPath(): string {
    const homeDir = os.homedir();

    switch (this.osType) {
      case 'darwin': // macOS
        const macPath = path.join(homeDir, 'Library', 'Application Support', 'LuciferAI');
        return path.join(macPath, '.system_id');

      case 'linux':
        const linuxPath = path.join(homeDir, '.config', 'luciferai');
        return path.join(linuxPath, '.system_id');

      case 'win32': // Windows
        const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
        const winPath = path.join(appData, 'LuciferAI');
        return path.join(winPath, '.system_id');

      default:
        // Fallback
        const fallbackPath = path.join(homeDir, '.luciferai_system');
        return path.join(fallbackPath, '.system_id');
    }
  }

  /**
   * Load system ID data from file
   */
  private loadIdData(): SystemIdData | null {
    try {
      if (!fs.existsSync(this.idFilePath)) {
        return null;
      }

      const data = fs.readFileSync(this.idFilePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('[SystemId] Failed to load ID data:', error);
      return null;
    }
  }

  /**
   * Check if system has a permanent ID assigned
   */
  hasId(): boolean {
    const data = this.loadIdData();
    return data !== null && !!data.user_id;
  }

  /**
   * Get user ID (permanent or temporary)
   */
  getUserId(): string {
    const data = this.loadIdData();

    if (data && data.user_id) {
      return data.user_id;
    }

    // Generate temporary ID
    return this.getTemporaryId();
  }

  /**
   * Generate temporary ID based on device fingerprint
   * Matches Python implementation
   */
  private getTemporaryId(): string {
    const fingerprint = this.getDeviceFingerprint();
    return 'TEMP-' + fingerprint.substring(0, 12).toUpperCase();
  }

  /**
   * Get device fingerprint for temporary ID
   * Uses same approach as Python version
   */
  private getDeviceFingerprint(): string {
    const identifiers = [
      os.networkInterfaces()['en0']?.[0]?.mac || 'unknown-mac',
      os.hostname(),
      this.osType,
      os.arch()
    ];

    const combined = identifiers.join('-');
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Get complete user ID information
   */
  getUserIdInfo(): UserIdInfo {
    const data = this.loadIdData();

    if (data && data.user_id) {
      return {
        userId: data.user_id,
        isPermanent: true,
        githubUsername: data.github_username,
        storagePath: this.idFilePath
      };
    }

    return {
      userId: this.getTemporaryId(),
      isPermanent: false,
      storagePath: this.idFilePath
    };
  }

  /**
   * Check if ID is permanent (GitHub-assigned)
   */
  isPermanent(): boolean {
    const data = this.loadIdData();
    return data !== null && !!data.user_id;
  }

  /**
   * Get GitHub username if linked
   */
  getGithubUsername(): string | null {
    const data = this.loadIdData();
    return data?.github_username || null;
  }
}

// Global instance
let systemIdManager: SystemIdManager | null = null;

export function getSystemIdManager(): SystemIdManager {
  if (!systemIdManager) {
    systemIdManager = new SystemIdManager();
  }
  return systemIdManager;
}

export function getUserId(): string {
  return getSystemIdManager().getUserId();
}

export function getUserIdInfo(): UserIdInfo {
  return getSystemIdManager().getUserIdInfo();
}

export function isPermanent(): boolean {
  return getSystemIdManager().isPermanent();
}
