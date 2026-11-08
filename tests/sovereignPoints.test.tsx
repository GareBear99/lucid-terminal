// @vitest-environment jsdom
/**
 * Sovereign Points (SP) info page tests (Gary, 2026-11-08 ~07:20 PST).
 *
 * "This needs to be in info page heavily well explained and voice
 * audio for it." Pins the SP explanation: the numbers come from the
 * code (pingQuota.ts, mirroring the ping server bucket), the honest
 * verification note is present, the voice script is the exact page
 * words, and the info section renders on the Help page with a play
 * button wired to the voice MP3.
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  SP_INFO_SECTIONS,
  SP_INFO_VOICE_SCRIPT,
  SP_INFO_VOICE_SRC,
  SP_STAGE1_REFILL,
  SP_STAGE2_REFILL,
  SP_VERIFIED_DAILY,
} from '../src/lib/sovereignPoints';
import {
  SP_BASE_BALANCE,
  SP_STAGE1_LIMIT,
  SP_STAGE2_LIMIT,
} from '../src/lib/pingQuota';
import { SovereignPointsInfo } from '../src/components/Help/SovereignPointsInfo';
import { HelpModal } from '../src/components/Help/HelpModal';

const allText = SP_INFO_SECTIONS.map(
  (s) => `${s.heading} ${s.paragraphs.join(' ')}`,
).join(' ');

describe('sovereignPoints content', () => {
  test('the numbers match the code constants (no drift from the server)', () => {
    expect(SP_BASE_BALANCE).toBe(100);
    expect(SP_STAGE1_LIMIT).toBe(200);
    expect(SP_STAGE2_LIMIT).toBe(250);
    expect(SP_STAGE1_REFILL).toBe(25);
    expect(SP_STAGE2_REFILL).toBe(20);
    expect(SP_VERIFIED_DAILY).toBe(1000);
  });

  test('every number the user needs is on the page', () => {
    for (const n of ['100 SP', '200 SP', '250 SP', '1000 SP']) {
      expect(allText).toContain(n);
    }
    expect(allText).toContain('25 SP every 4 hours');
    expect(allText).toContain('20 SP every 12 hours');
    expect(allText).toContain('1 SP');
    expect(allText).toContain('0 SP');
  });

  test('the 200 pivot point is explained', () => {
    expect(allText).toContain('pivot point');
    expect(allText).toContain('stage 1 cap');
    expect(allText).toContain('stage 2 threshold');
    expect(allText).toContain('fast refills stop');
    expect(allText).toContain('natural resting point');
  });

  test('the 100 offline fallback is explained', () => {
    expect(allText).toContain('no-server');
    expect(allText).toContain('falls back to base 100');
    expect(allText).toContain('restored when you reconnect');
  });

  test('the verified 1000-a-day rule is explained', () => {
    expect(allText).toContain('1000 SP a day');
    expect(allText).toContain('regardless of the neuron limit');
    expect(allText).toContain('daily server check');
  });

  test('what the balance tells you is explained', () => {
    expect(allText).toContain('What your balance tells you');
    expect(allText).toContain('temp is active');
    expect(allText).toContain('temp was discarded');
  });

  test('the honest note says verification is not built yet', () => {
    expect(allText).toContain('verification is not built yet');
    expect(allText).toContain('does not exist yet');
    expect(allText).toContain('design only, not built');
    expect(allText).toContain('a target, not live');
  });

  test('the voice script is the exact page words', () => {
    // Every section heading and every paragraph appears in the script,
    // in page order — the voice reads the page, no paraphrase.
    for (const section of SP_INFO_SECTIONS) {
      expect(SP_INFO_VOICE_SCRIPT).toContain(section.heading);
      for (const paragraph of section.paragraphs) {
        expect(SP_INFO_VOICE_SCRIPT).toContain(paragraph);
      }
    }
    expect(SP_INFO_VOICE_SCRIPT).toBe(
      SP_INFO_SECTIONS.map(
        (s) => `${s.heading}. ${s.paragraphs.join(' ')}`,
      ).join(' '),
    );
  });

  test('the voice source is the help audio file', () => {
    expect(SP_INFO_VOICE_SRC).toBe('./help/sovereign-points-explained.mp3');
  });
});

describe('SovereignPointsInfo component', () => {
  test('renders every section heading and the key numbers', () => {
    render(<SovereignPointsInfo />);
    expect(screen.getByText('Sovereign Points (SP)')).not.toBeNull();
    for (const section of SP_INFO_SECTIONS) {
      expect(screen.getByText(section.heading)).not.toBeNull();
    }
    expect(screen.getByText(/Honest note: verification is not built yet/)).not.toBeNull();
  });

  test('has a play button wired to the voice MP3', () => {
    const { container } = render(<SovereignPointsInfo />);
    const button = container.querySelector('[data-sp-voice="sovereign-points"]');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toContain('Play Sovereign Points explanation');
  });
});

describe('SP section on the Help (info) page', () => {
  test('the Help modal shows the SP section on the grid view', () => {
    render(<HelpModal isOpen={true} onClose={() => undefined} />);
    expect(screen.getByTestId('sovereign-points-info')).not.toBeNull();
    expect(screen.getByText('Sovereign Points (SP)')).not.toBeNull();
    expect(screen.getByText(/200 SP, the pivot point/)).not.toBeNull();
  });
});
