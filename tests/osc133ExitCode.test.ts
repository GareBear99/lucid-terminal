// OSC 133 exit-code parsing (heavy terminal work, 2026-11-13):
// the opt-in shell integration emits one `D` sequence per prompt;
// the renderer parses it out of the PTY stream.
import { describe, test, expect } from 'vitest';
import { parseOsc133ExitCodes } from '../src/lib/terminalBlocks';

describe('parseOsc133ExitCodes', () => {
  test('finds a complete ST-terminated sequence', () => {
    const { codes, pending } = parseOsc133ExitCodes('output\r\n\x1b]133;D;0\x1b\\prompt ', '');
    expect(codes).toEqual([0]);
    expect(pending).toBe('');
  });

  test('finds a BEL-terminated sequence too', () => {
    const { codes } = parseOsc133ExitCodes('\x1b]133;D;1\x07', '');
    expect(codes).toEqual([1]);
  });

  test('negative codes pass through', () => {
    const { codes } = parseOsc133ExitCodes('\x1b]133;D;-1\x1b\\', '');
    expect(codes).toEqual([-1]);
  });

  test('no sequence is no codes and no pending', () => {
    const { codes, pending } = parseOsc133ExitCodes('plain output\r\n$ ', '');
    expect(codes).toEqual([]);
    expect(pending).toBe('');
  });

  test('a sequence split across chunks completes from pending', () => {
    const first = parseOsc133ExitCodes('out\x1b]133;D;', '');
    expect(first.codes).toEqual([]);
    expect(first.pending).toBe('\x1b]133;D;');
    const second = parseOsc133ExitCodes('42\x1b\\$ ', first.pending);
    expect(second.codes).toEqual([42]);
    expect(second.pending).toBe('');
  });

  test('multiple sequences in one chunk arrive in order', () => {
    const { codes } = parseOsc133ExitCodes('\x1b]133;D;0\x1b\\x\x1b]133;D;3\x1b\\', '');
    expect(codes).toEqual([0, 3]);
  });

  test('an unrelated OSC sequence is not a code', () => {
    const { codes } = parseOsc133ExitCodes('\x1b]7;file://host/Users/gary\x07', '');
    expect(codes).toEqual([]);
  });
});
