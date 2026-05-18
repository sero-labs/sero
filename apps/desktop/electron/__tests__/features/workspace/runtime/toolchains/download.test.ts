import { createHash } from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { downloadArtifact } from '@electron/features/workspace/runtime/toolchains/download';

const HTTPS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCc8COWy52OMOBn
nAPSQhuPURc5NXof1OYtvxr2v0r61yoSe0EX0nvScydwwpCl7EbeLNUZQFFbWVPY
7ioWwfx/k6trCZZHv4Kin/qXPDLvfxkHTzrhYInnaYQvYxsPrHHErFTzSVQABgMT
z9ZP4KnPHvDKnZ9In48IGuLfa8LNBmniWGgSBYYN5jI819dk/m3yBcrTtaUbEoiG
8zi865igg2krUUDFWFyqH7a9qsI2eSyw1Ui4fVu/i95RNk9EbXtFkub+U9eePsl1
V6F/pBSxcIGRnPnbYFGmkGlQxbvA2BlH2EAEWuMWo6RhThKBqhy2QABFMaVq4YIn
RFIEkvfnAgMBAAECggEANzvXMrfn9Ebke+Kvf50vqPGfzE0zdaeO+XPEkCpEP+Nh
Vc7WWoWEec14iJmZoiP1zzUVLQVzfMSEG5m663aLoPT+hDYEE61l00mdvwN7Y8om
K2npra+16WG8GZd2Sz5kbhU+8r8Qls+G3r6rzUIjUZewpIb0K/GoO/CGf56kGVcG
wu8+9Dutz3Z0FJ79OmVbodoAirk2gYRvEMP1n/uWVcs1Ex+dcRDsWCUtUIgnyx72
+AvpgrVNYmAPpiRHvSAu9iYPLQdEydVo0OS82labNPyxraSGKPi9cAGJAtRtlw8j
DqGTDmrX32lxVOU8Bpd69tx/lU3wRcJKe+gdRo2TfQKBgQDSlkk0rauL0qmx0F7k
chvOrIdZYtQlpKygRDUVxCA8DgPJdrU28B1auAiwSo0Gr2NyzyvHmx6w+u9pFk0S
WKJiuIqFEBM2Yklx3nUE6Q/2721tiNpiIoV0I+MARelyWnZqf1euEEAvDei9bUxH
FqGQZCo5qDmovxMOzONuzSP3ZQKBgQC+yBggHRLFv79zYFAbZOh4jnHswevx5Pcb
VGrV6GS9AuPs58A1cZp2zIUqM8UZZ28GuV6A3oTrC36S9i1FAfKNH65q2miLEZeJ
61Glq/dqvQCDOV19dloUvyCghubTcRV4qvvCbYEgJRs1o9yUw4vlhg+wUVuSA8Zp
j8pc/bL7WwKBgDicch2ZOm6iOUA19eyPyG3s743WBZYBCO8kpuitCsVaNyZnpRuZ
vSpwItXRlMvhRmjMzMYiK0QEkWu8tQdjkHPdjE9tHN0X2wqjdO3XAZWuk8pIafzL
rvij1Rhzsugs7Xx/s0B12etMX+7cfQ73RIOeicNqN+XnR+ZIqjNVLoAJAoGADqyz
dlzmIcHTBxvkbYcAfq1uQ+jSrkOPYlHG+fcrMIK1Z3aYCURYvkSTBaD/yylyl9DQ
XRdAoBe9P66h4sn4jzRdpShxnCjZQCmSmSy2Fka9cFqMP2dIHIprBw35WVA8d5Cn
Vtg3c3KHOkQFZof4DcqXEFfhtESIEXyW8zosdzsCgYAk38V+KNwUg9TCuyDdQVg6
YSD59K4+i3HCi86xn2mWxpoqtWuykWhuNm3F7LYg3mE4dHi7E3lbeuJ22vumTKgd
BGp2TCnd4ZAs8ZGgAvRz6ay2fVzTznS5BobVn3NP+6uJPMnzN8i16kM8tP/ZwisP
i7aMbMPHDXq+UjQ1IK3Vyw==
-----END PRIVATE KEY-----`;

const HTTPS_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUYWXehJpeQKWuQP4hCS1tNFz+4JYwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MDUxNjIyMTY1MFoXDTI2MDUx
NzIyMTY1MFowFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAnPAjlsudjjDgZ5wD0kIbj1EXOTV6H9TmLb8a9r9K+tcq
EntBF9J70nMncMKQpexG3izVGUBRW1lT2O4qFsH8f5OrawmWR7+Cop/6lzwy738Z
B0864WCJ52mEL2MbD6xxxKxU80lUAAYDE8/WT+Cpzx7wyp2fSJ+PCBri32vCzQZp
4lhoEgWGDeYyPNfXZP5t8gXK07WlGxKIhvM4vOuYoINpK1FAxVhcqh+2varCNnks
sNVIuH1bv4veUTZPRG17RZLm/lPXnj7JdVehf6QUsXCBkZz522BRppBpUMW7wNgZ
R9hABFrjFqOkYU4SgaoctkAARTGlauGCJ0RSBJL35wIDAQABo1MwUTAdBgNVHQ4E
FgQU0o1dbC6hbu5A0Eq1Wsn000sJ688wHwYDVR0jBBgwFoAU0o1dbC6hbu5A0Eq1
Wsn000sJ688wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAifFh
jl+uTRhbXwUXTHdJE/YS04UnNgs428LLOPMFmIRLxXdgj/lEZCKf8f/bflzjsFQ5
LLhmLtrhBJF/n+oXq2XrbTpWRs10qTB+HFtM4oS2g2vtKviDOAy/bYNG8cceLAuj
hTxH421KWUkNPWP/oi/IvnyFTjLKyszxleeMqfNG9nrS86hXxAUBUHATV1To8nFr
RpBrnDM78tzM3u/TJ26WizlzskdHSiDFPfYDYqAYBcpEseCGwFdrI3P3dUbhmaOQ
BX1Rp+gDDXrGmqA1XG3QwcaybwugitgDboEYGag+LBRq/HS2QZjCTgIlvgouZQ//
wbuD7QfB00DCtuReYA==
-----END CERTIFICATE-----`;

const servers: Array<http.Server | https.Server> = [];
const originalTlsRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

async function listen(server: http.Server | https.Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  return `127.0.0.1:${address.port}`;
}

afterEach(async () => {
  restoreTlsRejectUnauthorized();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('downloadArtifact', () => {
  it('follows a 302 redirect to an HTTPS final artifact', async () => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const body = Buffer.from('secure artifact');
    const httpsHost = await listen(https.createServer({ key: HTTPS_KEY, cert: HTTPS_CERT }, (_req, res) => {
      res.end(body);
    }));
    const httpHost = await listen(http.createServer((_req, res) => {
      res.writeHead(302, { Location: `https://${httpsHost}/artifact.tgz` });
      res.end();
    }));
    const destination = await tempDestination();

    await downloadArtifact({ url: `http://${httpHost}/redirect`, sha256: sha256(body), destination });

    await expect(fs.promises.readFile(destination, 'utf8')).resolves.toBe('secure artifact');
  });

  it('follows a relative redirect location', async () => {
    const body = Buffer.from('relative artifact');
    const host = await listen(http.createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(307, { Location: '/final' });
        res.end();
        return;
      }
      res.end(body);
    }));
    const destination = await tempDestination();

    await downloadArtifact({ url: `http://${host}/redirect`, sha256: sha256(body), destination });

    await expect(fs.promises.readFile(destination, 'utf8')).resolves.toBe('relative artifact');
  });

  it('rejects unsafe or malformed redirect URLs', async () => {
    const fileRedirect = await redirectingServer('file:///etc/passwd');
    await expect(downloadArtifact({
      url: `http://${fileRedirect}/redirect`,
      sha256: sha256(Buffer.from('unused')),
      destination: await tempDestination(),
    })).rejects.toThrow(/Unsupported artifact URL protocol: file:/);

    const malformedRedirect = await redirectingServer('http://%');
    await expect(downloadArtifact({
      url: `http://${malformedRedirect}/redirect`,
      sha256: sha256(Buffer.from('unused')),
      destination: await tempDestination(),
    })).rejects.toThrow(/Invalid redirect URL/);
  });

  it('rejects HTTPS to HTTP downgrade redirects', async () => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const httpHost = await listen(http.createServer((_req, res) => res.end('downgraded')));
    const httpsHost = await listen(https.createServer({ key: HTTPS_KEY, cert: HTTPS_CERT }, (_req, res) => {
      res.writeHead(302, { Location: `http://${httpHost}/artifact.tgz` });
      res.end();
    }));

    await expect(downloadArtifact({
      url: `https://${httpsHost}/redirect`,
      sha256: sha256(Buffer.from('downgraded')),
      destination: await tempDestination(),
    })).rejects.toThrow(/Refusing HTTPS to HTTP redirect/);
  });

  it('rejects excessive redirects', async () => {
    const host = await listen(http.createServer((_req, res) => {
      res.writeHead(302, { Location: '/loop' });
      res.end();
    }));

    await expect(downloadArtifact({
      url: `http://${host}/loop`,
      sha256: sha256(Buffer.from('unused')),
      destination: await tempDestination(),
    })).rejects.toThrow(/Too many redirects/);
  });

  it('removes temp files and does not overwrite the final path on SHA mismatch', async () => {
    const body = Buffer.from('new partial artifact');
    const host = await listen(http.createServer((_req, res) => res.end(body)));
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sero-download-'));
    const destination = path.join(dir, 'artifact.tgz');
    await fs.promises.writeFile(destination, 'existing artifact');

    await expect(downloadArtifact({
      url: `http://${host}/artifact.tgz`,
      sha256: sha256(Buffer.from('expected different artifact')),
      destination,
    })).rejects.toThrow(/SHA-256 mismatch/);

    await expect(fs.promises.readFile(destination, 'utf8')).resolves.toBe('existing artifact');
    const leftovers = (await fs.promises.readdir(dir)).filter((name) => name.includes('.tmp-'));
    expect(leftovers).toEqual([]);
  });

  it('rejects response streams that go idle after headers arrive', async () => {
    const host = await listen(http.createServer((_req, res) => {
      res.write(Buffer.from('partial'));
    }));
    const destination = await tempDestination();

    await expect(downloadArtifact({
      url: `http://${host}/artifact.tgz`,
      sha256: sha256(Buffer.from('partial')),
      destination,
      idleTimeoutMs: 20,
      totalTimeoutMs: 1_000,
    })).rejects.toThrow(/Download stream idle timed out/);

    await expectExists(destination, false);
  });

  it('rejects response streams that exceed the total deadline', async () => {
    const chunk = Buffer.from('chunk');
    const host = await listen(http.createServer((req, res) => {
      const interval = setInterval(() => res.write(chunk), 5);
      req.on('close', () => clearInterval(interval));
    }));
    const destination = await tempDestination();

    await expect(downloadArtifact({
      url: `http://${host}/artifact.tgz`,
      sha256: sha256(Buffer.from('unused')),
      destination,
      idleTimeoutMs: 1_000,
      totalTimeoutMs: 30,
    })).rejects.toThrow(/Download stream total timed out/);

    await expectExists(destination, false);
  });
});

async function redirectingServer(location: string): Promise<string> {
  return listen(http.createServer((_req, res) => {
    res.writeHead(302, { Location: location });
    res.end();
  }));
}

async function tempDestination(): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sero-download-'));
  return path.join(dir, 'artifact.tgz');
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

async function expectExists(filePath: string, expected: boolean): Promise<void> {
  const exists = await fs.promises.access(filePath).then(() => true, () => false);
  expect(exists).toBe(expected);
}

function restoreTlsRejectUnauthorized(): void {
  if (originalTlsRejectUnauthorized === undefined) {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    return;
  }
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsRejectUnauthorized;
}
