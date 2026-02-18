# Container Tools Test Plan

Test prompts for verifying Sero container tool parity with Pi SDK.
Paste each prompt into a Sero agent chat session with an active workspace.

> **Prerequisite:** Open a workspace in Sero that has a running container.
> The workspace should have a writable directory. All tests run inside
> the container at `/workspace`.

---

## Phase 0 — Setup Fixtures

Run this first to create all test files the other prompts depend on.

```
Create the following test fixture files. Do NOT skip any of them:

1. /workspace/test-fixtures/hello.txt — contents: "Hello, World!"
2. /workspace/test-fixtures/multiline.txt — a file with exactly 15 lines, each line saying "Line N" where N is 1-15
3. /workspace/test-fixtures/big.txt — use bash to generate a file with 3000 lines: each line is "Line NNNN: Lorem ipsum dolor sit amet, consectetur adipiscing elit" where NNNN is the line number, zero-padded to 4 digits
4. /workspace/test-fixtures/with-dupes.txt — contents should be exactly:
   function hello() {
     return "hello";
   }
   function goodbye() {
     return "hello";
   }
5. /workspace/test-fixtures/crlf.txt — use bash to create a file with Windows CRLF line endings: printf "line one\r\nline two\r\nline three\r\n" > /workspace/test-fixtures/crlf.txt
6. /workspace/test-fixtures/test.png — use bash to create a tiny valid 1x1 red PNG: printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > /workspace/test-fixtures/test.png
7. /workspace/test-fixtures/editable.txt — contents:
   const name = "world";
   console.log(`Hello, ${name}!`);
   // end

After creating all files, run: ls -la /workspace/test-fixtures/ and show me the output to confirm they all exist.
```

---

## Phase 1 — Individual Tool Tests

### 1.1 Bash — Basic execution

```
Run this bash command and show me the output: echo "tool test ok"
```

**Expected:** Output contains `tool test ok`. No error.

---

### 1.2 Bash — Non-zero exit signals error

```
Run this bash command: ls /nonexistent-path-12345
```

**Expected:** The tool result should be marked as an error (the agent
should acknowledge the command failed, not treat it as success).
The output should contain the exit code.

---

### 1.3 Bash — Empty output

```
Run this bash command: true
```

**Expected:** Output shows `(no output)` or similar — should NOT be empty/blank.

---

### 1.4 Bash — Tail truncation on large output

```
Run this bash command and tell me if the output was truncated: seq 1 5000
```

**Expected:** The agent sees only the last ~2000 lines. There should be a
truncation notice like `[Showing lines X-5000 of 5000]`.

---

### 1.5 Bash — Timeout

```
Run this bash command with a 3 second timeout: sleep 10
```

**Expected:** Command should time out. Agent should report the timeout.

---

### 1.6 Read — Basic file read

```
Read the file /workspace/test-fixtures/hello.txt
```

**Expected:** Shows `Hello, World!`

---

### 1.7 Read — With offset and limit

```
Read /workspace/test-fixtures/multiline.txt starting from line 5, showing only 3 lines
```

**Expected:** Shows lines 5, 6, 7. Should include a notice like
`[8 more lines in file. Use offset=8 to continue.]`

---

### 1.8 Read — Truncation on large file

```
Read the file /workspace/test-fixtures/big.txt
```

**Expected:** Output truncated to ~2000 lines. Should show a notice like
`[Showing lines 1-2000 of 3000. Use offset=2001 to continue.]`

---

### 1.9 Read — Offset out of bounds

```
Read /workspace/test-fixtures/hello.txt starting from offset 999
```

**Expected:** Error message about offset being beyond end of file.

---

### 1.10 Read — Image file

```
Read the file /workspace/test-fixtures/test.png
```

**Expected:** Agent should report reading an image file with the MIME type
`image/png`. Should NOT show garbled binary text.

---

### 1.11 Read — Non-existent file

```
Read the file /workspace/test-fixtures/test.png
```

**Expected:** Error — file not found. Should be treated as an error, not success.

---

### 1.12 Write — Basic write

```
Write a file at /workspace/test-fixtures/written.txt with this exact content:
This file was written by the agent.
Line 2.
```

**Expected:** Success message reporting bytes written.

---

### 1.13 Write — Creates parent directories

```
Write a file at /workspace/test-fixtures/deep/nested/dir/file.txt with content "nested write test"
```

**Expected:** Succeeds — parent directories created automatically.

---

### 1.14 Edit — Exact match replacement

```
Edit /workspace/test-fixtures/editable.txt: replace the text 'const name = "world"' with 'const name = "Sero"'
```

**Expected:** Success message. Agent should report a diff showing the change.

---

### 1.15 Edit — Multi-occurrence rejection

```
Edit /workspace/test-fixtures/with-dupes.txt: replace 'return "hello"' with 'return "hi"'
```

**Expected:** Error — should report finding 2 occurrences and ask for more
context to disambiguate. Should NOT silently replace just the first one.

---

### 1.16 Edit — Text not found

```
Edit /workspace/test-fixtures/hello.txt: replace 'this text does not exist anywhere' with 'replacement'
```

**Expected:** Error — could not find the exact text. Should be treated as
an error, not success.

---

### 1.17 Edit — No-op detection

```
Edit /workspace/test-fixtures/hello.txt: replace 'Hello, World!' with 'Hello, World!'
```

**Expected:** Error — no changes made, replacement produced identical content.

---

### 1.18 Edit — CRLF preservation

```
Read /workspace/test-fixtures/crlf.txt, then edit it: replace 'line two' with 'line TWO'. After the edit, run: xxd /workspace/test-fixtures/crlf.txt | head -5 and tell me if the CRLF line endings (\r\n) are preserved.
```

**Expected:** The file should still have `\r\n` line endings after the edit.
The xxd output should show `0d 0a` between lines.

---

### 1.19 Edit — Fuzzy matching (trailing whitespace)

```
First, run this bash command to create a file with trailing spaces:
printf "hello world  \ngoodbye world\n" > /workspace/test-fixtures/trailing.txt

Then edit /workspace/test-fixtures/trailing.txt: replace 'hello world' with 'hi world'
```

**Expected:** Should succeed even though the file has trailing spaces after
"hello world" — fuzzy matching handles this.

---

### 1.20 Ls — Basic listing

```
List the contents of /workspace/test-fixtures/
```

**Expected:** Sorted list of files with `/` suffix on directories. Should
include dotfiles if any exist.

---

### 1.21 Ls — Non-existent directory

```
List the contents of /workspace/this-dir-does-not-exist/
```

**Expected:** Error — treated as failure, not success.

---

### 1.22 Ls — Workspace root

```
List the contents of the workspace root directory
```

**Expected:** Lists `/workspace` contents.

---

### 1.23 Read Terminal

```
Use the read_terminal tool to check the recent terminal output
```

**Expected:** Returns terminal buffer content (may be empty if no terminals
are running — that's OK, should not error).

---

## Phase 2 — Combined Sequence Tests

These test multi-tool interactions where the output of one tool informs the next.

### 2.1 Write → Read → Edit → Read (full file lifecycle)

```
Do all of these steps in order and show me the result of each:
1. Write a new file /workspace/test-seq/app.js with this content:
   function greet(name) {
     return "Hello, " + name;
   }
   module.exports = { greet };
2. Read the file back to confirm it was written correctly
3. Edit the file: replace 'return "Hello, " + name' with 'return `Hello, ${name}!`'
4. Read the file again to show the final result
```

**Expected:** Each step succeeds. The final read should show the template
literal version. The edit step should show a diff.

---

### 2.2 Bash → Write → Bash (generate, save, verify)

```
Do these steps in order:
1. Run: node -e "console.log(JSON.stringify({version: '1.0', tools: ['bash','read','write','edit']}))"
2. Write the output to /workspace/test-seq/config.json
3. Run: cat /workspace/test-seq/config.json | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('Tools:', j.tools.length)"
```

**Expected:** Step 3 should output `Tools: 4`.

---

### 2.3 Read truncated → offset continuation

```
Read /workspace/test-fixtures/big.txt. The file has 3000 lines and will be truncated. After reading, continue reading from where it left off using the offset the tool suggests, and tell me what the last line of the file says.
```

**Expected:** First read stops at ~line 2000 with an offset notice. Agent
should use the suggested offset to continue. Final line should be
`Line 3000: Lorem ipsum...`.

---

### 2.4 Bash error → Edit fix → Bash retry

```
Do these steps:
1. Write /workspace/test-seq/broken.js with content:
   const x = 42
   console.log(x.toUpperCase())
2. Run: node /workspace/test-seq/broken.js — it will fail
3. Read the error message, fix the bug by editing the file (x.toUpperCase is wrong because x is a number — change the code to console.log(x.toString()))
4. Run the script again to verify it works
```

**Expected:** Step 2 fails with a TypeError. Step 3 edits the file. Step 4
succeeds and prints `42`.

---

### 2.5 Ls → Read → Edit → Ls (directory awareness)

```
Do these steps:
1. List the contents of /workspace/test-fixtures/
2. Read the file with-dupes.txt from that directory
3. Edit with-dupes.txt: replace the FIRST function by providing enough context — replace:
   function hello() {
     return "hello";
   }
   with:
   function hello() {
     return "hi";
   }
4. List the directory again to confirm no extra files were created
```

**Expected:** The edit should succeed because the full function block is
unique (even though `return "hello"` alone appears twice). Directory
listing should be unchanged.

---

### 2.6 Write image → Read image → Bash verify

```
Do these steps:
1. Use bash to create a tiny 1x1 white PNG at /workspace/test-seq/white.png:
   python3 -c "
   import struct, zlib
   def png():
       sig = b'\x89PNG\r\n\x1a\n'
       ihdr_data = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
       ihdr_crc = struct.pack('>I', zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff)
       ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + ihdr_crc
       raw = b'\x00\xff\xff\xff'
       compressed = zlib.compress(raw)
       idat_crc = struct.pack('>I', zlib.crc32(b'IDAT' + compressed) & 0xffffffff)
       idat = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + idat_crc
       iend_crc = struct.pack('>I', zlib.crc32(b'IEND') & 0xffffffff)
       iend = struct.pack('>I', 0) + b'IEND' + iend_crc
       return sig + ihdr + idat + iend
   import sys; sys.stdout.buffer.write(png())
   " > /workspace/test-seq/white.png
2. Read /workspace/test-seq/white.png — it should be detected as an image
3. Run: file /workspace/test-seq/white.png to confirm it's a valid PNG
```

**Expected:** Step 2 should return image content (not garbled text).
Step 3 should confirm `PNG image data`.

---

### 2.7 Deep edit with BOM file

```
Do these steps:
1. Use bash to create a file with a UTF-8 BOM:
   printf '\xEF\xBB\xBFconst greeting = "hello";\nconsole.log(greeting);\n' > /workspace/test-seq/bom.js
2. Verify the BOM exists: xxd /workspace/test-seq/bom.js | head -1
3. Edit the file: replace 'const greeting = "hello"' with 'const greeting = "world"'
4. Verify the BOM is still present after editing: xxd /workspace/test-seq/bom.js | head -1
5. Run: node /workspace/test-seq/bom.js
```

**Expected:** The BOM (`ef bb bf`) should be present in step 2 AND step 4.
The edit should succeed without being confused by the invisible BOM.
Step 5 should print `world`.

---

## Phase 3 — Cleanup

```
Remove all test fixture files: rm -rf /workspace/test-fixtures /workspace/test-seq
```

---

## Quick-Reference: What Each Test Validates

| Test   | Tool  | Feature validated                            |
|--------|-------|----------------------------------------------|
| 1.1    | bash  | Basic execution                              |
| 1.2    | bash  | Non-zero exit → error (reject, not resolve)  |
| 1.3    | bash  | Empty output → "(no output)"                 |
| 1.4    | bash  | Tail truncation + line-aware notices          |
| 1.5    | bash  | Timeout handling                             |
| 1.6    | read  | Basic file read                              |
| 1.7    | read  | Offset + limit + remaining notice            |
| 1.8    | read  | Head truncation + offset continuation notice |
| 1.9    | read  | Offset out of bounds → error                 |
| 1.10   | read  | Image detection + ImageContent               |
| 1.11   | read  | Non-existent file → error                    |
| 1.12   | write | Basic write + bytes reported                 |
| 1.13   | write | Auto-create parent directories               |
| 1.14   | edit  | Exact match + diff in response               |
| 1.15   | edit  | Multi-occurrence rejection                   |
| 1.16   | edit  | Text not found → error                       |
| 1.17   | edit  | No-op detection → error                      |
| 1.18   | edit  | CRLF line ending preservation                |
| 1.19   | edit  | Fuzzy matching (trailing whitespace)          |
| 1.20   | ls    | Basic sorted listing with dir suffixes       |
| 1.21   | ls    | Non-existent dir → error                     |
| 1.22   | ls    | Workspace root default                       |
| 1.23   | r_t   | Terminal buffer read                          |
| 2.1    | combo | Write → Read → Edit → Read lifecycle         |
| 2.2    | combo | Bash → Write → Bash pipeline                 |
| 2.3    | combo | Truncated read → offset continuation         |
| 2.4    | combo | Bash error → Edit fix → Bash retry           |
| 2.5    | combo | Ls → Read → Edit (disambiguated) → Ls        |
| 2.6    | combo | Bash create image → Read image → Bash verify |
| 2.7    | combo | BOM preservation across edit cycle            |
