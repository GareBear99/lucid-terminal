/**
 * File-type icons (Atom steal #17 — tree/tabs punch-list,
 * 2026-11-14).
 *
 * Atom's pane items show the file name + a file-type icon
 * in the tab. Lucid's file tabs (the editor's file-tabs bar)
 * and the Explorer tree rows showed a generic icon for
 * every file; this module maps an extension to a lucide
 * icon, so a TypeScript file, a JSON file and an image are
 * told apart at a glance. Pure mapping + a tiny component
 * (the icon by the name, at the tab's size).
 */
import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileJson,
  FileText,
  FileVideo,
  type LucideIcon,
} from 'lucide-react';

const ICON_BY_EXTENSION: Record<string, LucideIcon> = {
  // Code — the editor's languages.
  ts: FileCode2,
  tsx: FileCode2,
  mts: FileCode2,
  cts: FileCode2,
  js: FileCode2,
  jsx: FileCode2,
  mjs: FileCode2,
  cjs: FileCode2,
  py: FileCode2,
  rs: FileCode2,
  go: FileCode2,
  java: FileCode2,
  c: FileCode2,
  cpp: FileCode2,
  h: FileCode2,
  css: FileCode2,
  scss: FileCode2,
  less: FileCode2,
  html: FileCode2,
  htm: FileCode2,
  sh: FileCode2,
  bash: FileCode2,
  zsh: FileCode2,
  // Data.
  json: FileJson,
  jsonc: FileJson,
  // Text.
  md: FileText,
  markdown: FileText,
  txt: FileText,
  // Media.
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  ico: FileImage,
  mp3: FileAudio,
  wav: FileAudio,
  ogg: FileAudio,
  flac: FileAudio,
  mp4: FileVideo,
  mov: FileVideo,
  webm: FileVideo,
  // Archives.
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  '7z': FileArchive,
};

/** The icon component for a path (the extension, lower-cased; unknown → the generic file). */
export function fileTypeIconForPath(path: string): LucideIcon {
  const base = path.split(/[\\/]/).pop() ?? path;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return File;
  const ext = base.slice(dot + 1).toLowerCase();
  return ICON_BY_EXTENSION[ext] ?? File;
}

export function FileTypeIcon({ path, size = 14 }: { path: string; size?: number }) {
  const Icon = fileTypeIconForPath(path);
  return <Icon size={size} className="text-[var(--text-muted)] flex-shrink-0" />;
}
