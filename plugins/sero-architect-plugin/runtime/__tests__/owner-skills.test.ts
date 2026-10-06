import { afterEach, describe, expect, it } from 'vitest';

import { buildOwnerContract } from '../../shared/owner-contract';
import { OWNER_TOOLS, ownerGrantProposal, ownerSessionRequest, type OwnerModelChoice } from '../owner-session';
import { approvedOwnerSkills, newOwnerSkills, ownerGrantTools, withOwnerSkills } from '../owner-skills';
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

  it('asks a new owner for Code Mode only when the catalogue offers it, and loads only the owner tools', async () => {
    const host = await fakeHost();
    const record = { ...buildingProject(), session: { ...buildingProject().session, grantId: null } };
    host.listWorkerCapabilities = async () => ({ tools: ['read', 'codemode'], skills: [] });
    expect(await ownerGrantTools(host, record, OWNER_TOOLS)).toEqual([...OWNER_TOOLS, 'codemode']);
    host.listWorkerCapabilities = async () => ({ tools: ['read'], skills: [] });
    expect(await ownerGrantTools(host, record, OWNER_TOOLS)).toEqual([...OWNER_TOOLS]);
    const granted = { ...record, session: { ...record.session, grantId: 'g', model: 'm', thinking: 'medium', grantedTools: [...OWNER_TOOLS, 'codemode'] } };
    expect(ownerSessionRequest(granted, 'create').tools).toEqual([...OWNER_TOOLS]);
  });

  it('renews an existing owner grant with exactly the tools it had', async () => {
    const host = await fakeHost();
    host.listWorkerCapabilities = async () => ({ tools: ['read', 'codemode'], skills: [] });
    const without = buildingProject();
    expect(await ownerGrantTools(host, without, OWNER_TOOLS)).toEqual(['read', 'bash', 'write', 'edit', 'sero-cli']);
    const withCode = { ...without, session: { ...without.session, grantedTools: [...OWNER_TOOLS, 'codemode'] } };
    expect(await ownerGrantTools(host, withCode, OWNER_TOOLS)).toEqual([...OWNER_TOOLS, 'codemode']);
  });

  it('tells the owner about tool_search in every contract', () => {
    expect(buildOwnerContract(buildingProject(), null)).toContain('tool_search');
  });
});
