import { afterEach, describe, expect, it } from 'vitest';

import { buildOwnerContract } from '../../shared/owner-contract';
import { ownerGrantProposal, ownerSessionRequest, type OwnerModelChoice } from '../owner-session';
import { approvedOwnerSkills, newOwnerSkills, withOwnerSkills } from '../owner-skills';
import { buildingProject, cleanupHosts, fakeHost } from './helpers';

afterEach(cleanupHosts);

const choice: OwnerModelChoice = { model: 'm', thinking: 'medium', source: 'inherited-global' };

describe('owner skills', () => {
  it('asks a new owner for the workspace skills and leaves the initial loadout alone', async () => {
    const host = await fakeHost();
    host.listWorkerCapabilities = async () => ({ tools: ['read'], skills: ['review', 'debug'] });
    const record = { ...buildingProject(), session: { ...buildingProject().session, grantId: null } };
    const proposal = withOwnerSkills(ownerGrantProposal(record, choice), await newOwnerSkills(host, record));
    expect(proposal.subjects.owner.allowedSkills).toEqual(['review', 'debug']);
    const granted = { ...record, session: { ...record.session, grantId: 'g', model: 'm', thinking: 'medium' } };
    expect(ownerSessionRequest(granted, 'create').skills).toEqual([]);
  });

  it('proposes nothing for an owner that already has a grant, and records what the host approved', async () => {
    const host = await fakeHost();
    host.listWorkerCapabilities = async () => ({ tools: [], skills: ['review'] });
    const record = buildingProject();
    expect(record.session.grantId).toBeTruthy();
    expect(await newOwnerSkills(host, record)).toEqual([]);
    const proposal = ownerGrantProposal(record, choice);
    expect(withOwnerSkills(proposal, [])).toBe(proposal);
    const handle = { grantId: 'g', subjects: { owner: { ...proposal.subjects.owner, allowedSkills: ['review'] } }, maxLiveSessions: 1, maxTotalSessions: 1, issuedAt: '' };
    expect(approvedOwnerSkills(handle)).toEqual(['review']);
  });

  it('tells the owner about tool_search in every contract', () => {
    expect(buildOwnerContract(buildingProject(), null)).toContain('tool_search');
  });
});
