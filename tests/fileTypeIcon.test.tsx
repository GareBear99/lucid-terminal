/**
 * File-type icons (tree/tabs punch-list) —
 * the extension → icon mapping.
 */
import { describe, it, expect } from 'vitest';
import { fileTypeIconForPath } from '../src/components/Editor/FileTypeIcon';
import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileJson,
  FileText,
  FileVideo,
} from 'lucide-react';

describe('fileTypeIconForPath', () => {
  it('maps code extensions to the code icon', () => {
    for (const path of ['a.ts', 'b.tsx', 'c.js', 'd.py', 'e.css', 'f.html', 'g.rs']) {
      expect(fileTypeIconForPath(path)).toBe(FileCode2);
    }
  });

  it('maps data, text, media and archive extensions', () => {
    expect(fileTypeIconForPath('data.json')).toBe(FileJson);
    expect(fileTypeIconForPath('notes.md')).toBe(FileText);
    expect(fileTypeIconForPath('readme.txt')).toBe(FileText);
    expect(fileTypeIconForPath('shot.png')).toBe(FileImage);
    expect(fileTypeIconForPath('logo.svg')).toBe(FileImage);
    expect(fileTypeIconForPath('song.mp3')).toBe(FileAudio);
    expect(fileTypeIconForPath('clip.mp4')).toBe(FileVideo);
    expect(fileTypeIconForPath('pack.zip')).toBe(FileArchive);
  });

  it('is case-insensitive and falls back to the generic file', () => {
    expect(fileTypeIconForPath('SHOT.PNG')).toBe(FileImage);
    expect(fileTypeIconForPath('weird.xyz')).toBe(File);
    expect(fileTypeIconForPath('noextension')).toBe(File);
    expect(fileTypeIconForPath('.gitignore')).toBe(File);
  });

  it('takes the last segment and the last extension', () => {
    expect(fileTypeIconForPath('/home/test/a.b/c.json')).toBe(FileJson);
    expect(fileTypeIconForPath('archive.tar.gz')).toBe(FileArchive);
  });
});
