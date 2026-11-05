import { Globe, X } from 'lucide-react';
import { useBrowserBookmarks } from '../../stores/browserBookmarks';

/**
 * Bookmarks list (Area 9): the starred pages, newest first.
 * Click one to open it in the active tab; the X removes it.
 * Rendered under the tab strip when the panel's bookmark toggle
 * is on.
 */

function BrowserBookmarks({ onOpen }: { onOpen: (url: string) => void }) {
  const bookmarks = useBrowserBookmarks((s) => s.bookmarks);
  const removeBookmark = useBrowserBookmarks((s) => s.removeBookmark);

  if (bookmarks.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-[var(--text-muted)] border-b border-[var(--border)] shrink-0">
        No bookmarks yet — star a page in the address bar to save it here.
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--border)] shrink-0 max-h-48 overflow-y-auto">
      {bookmarks.map((bookmark) => (
        <div
          key={bookmark.url}
          className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)]"
        >
          <Globe size={12} className="shrink-0 text-[var(--text-muted)]" />
          <button
            type="button"
            onClick={() => onOpen(bookmark.url)}
            className="flex-1 min-w-0 text-left truncate hover:underline"
            title={bookmark.url}
          >
            {bookmark.title}
          </button>
          <span className="truncate max-w-[220px] text-[var(--text-muted)] hidden sm:inline">
            {bookmark.url}
          </span>
          <button
            type="button"
            title="Remove bookmark"
            onClick={() => removeBookmark(bookmark.url)}
            className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default BrowserBookmarks;
