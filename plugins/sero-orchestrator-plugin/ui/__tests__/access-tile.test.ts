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

  it('keeps each action attached to its own target', () => {
    expect(accessSentence([{ label: 'edit-workspace' }, { label: 'read-github' }])).toBe(
      'Edit this workspace and read GitHub',
    );
    expect(accessSentence([{ label: 'read-github' }, { label: 'run-commands' }])).toBe(
      'Read GitHub and run commands',
    );
  });

  it('reads a mode with no target without a dangling preposition', () => {
    expect(accessSentence([{ label: 'run-commands' }])).toBe('Run commands');
  });

  it('gives a target with no mode its own action', () => {
    expect(accessSentence([{ label: 'reach-internet' }])).toBe('Reach the internet');
    expect(accessSentence([{ label: 'other-tools' }])).toBe('Use other tools');
    expect(accessSentence([{ label: 'read-workspace' }, { label: 'other-tools' }])).toBe(
      'Read this workspace and use other tools',
    );
    expect(accessSentence([{ label: 'edit-workspace' }, { label: 'reach-internet' }])).toBe(
      'Edit this workspace and reach the internet',
    );
  });

  it('reports nothing when the Room reaches nothing', () => {
    expect(accessSentence([])).toBe('Nothing outside the Room');
  });
});
