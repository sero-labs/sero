import { describe, expect, it } from 'vitest';
import { accessSentence, accessTile } from '../lib/access-tile';

describe('accessTile', () => {
  it('keeps the two-line form the advanced settings view renders', () => {
    expect(accessTile([{ label: 'read-workspace' }])).toEqual({ value: 'This workspace', sub: 'read' });
    expect(accessTile([{ label: 'read-workspace' }, { label: 'read-github' }])).toEqual({
      value: 'This workspace and GitHub',
      sub: 'read',
    });
  });

  it('reports nothing when the Room reaches nothing', () => {
    expect(accessTile([]).value).toBe('Nothing outside the Room');
  });
});

describe('accessSentence', () => {
  it('reads read-only access as the drawing does', () => {
    expect(accessSentence([{ label: 'read-workspace' }])).toBe('Read this workspace');
  });

  it('keeps names capitalised', () => {
    expect(accessSentence([{ label: 'read-github' }])).toBe('Read GitHub');
    expect(accessSentence([{ label: 'github-write' }])).toBe('Push to GitHub');
  });

  it('joins a mode to its target', () => {
    expect(accessSentence([{ label: 'edit-workspace' }])).toBe('Edit this workspace');
    expect(accessSentence([{ label: 'deployment' }])).toBe('Deploy to live systems');
  });

  it('joins two targets', () => {
    expect(accessSentence([{ label: 'read-workspace' }, { label: 'read-github' }])).toBe(
      'Read this workspace and GitHub',
    );
  });

  it('leaves a value with no mode as the tile reads it, with the sentence capital', () => {
    expect(accessSentence([{ label: 'reach-internet' }])).toBe('The internet');
    expect(accessSentence([{ label: 'other-tools' }])).toBe('Other tools');
  });

  it('reports nothing when the Room reaches nothing', () => {
    expect(accessSentence([])).toBe('Nothing outside the Room');
  });
});
