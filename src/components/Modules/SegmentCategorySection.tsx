import type { ReactNode } from 'react';
import type { SegmentCategoryInfo } from '../../lib/segmentCategories';
import { segmentVoiceSrc } from '../../lib/segmentCategories';
import { SegmentVoiceButton } from './SegmentVoiceButton';

interface SegmentCategorySectionProps {
  /** The category — heading, info text, and voice all come from here. */
  category: SegmentCategoryInfo;
  /** The segment content itself, below the info page. */
  children: ReactNode;
}

/**
 * One categorised section of the Segments panel (Gary, 2026-11-07
 * ~02:50 PST): each category has an info explanatory page and a
 * voice that reads the EXACT words on that page. The info text
 * renders verbatim from the category definition — the same string
 * the voice mp3 is synthesized from — so the page and the voice
 * can never drift apart.
 */
export function SegmentCategorySection({ category, children }: SegmentCategorySectionProps) {
  return (
    <section>
      <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">{category.title}</h3>
      <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">{category.info}</p>
      <div className="mb-3">
        <SegmentVoiceButton
          categoryId={category.id}
          categoryTitle={category.title}
          src={segmentVoiceSrc(category.id)}
        />
      </div>
      {children}
    </section>
  );
}
