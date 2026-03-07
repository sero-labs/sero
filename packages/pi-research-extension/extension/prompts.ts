/**
 * Prompt templates for the research orchestrator.
 */

import type { ResearchAgent, ResearchSession } from '../shared/types';

/**
 * Build the system prompt for a research agent.
 */
export function buildAgentSystemPrompt(agent: ResearchAgent, session: ResearchSession): string {
  const sectionList = agent.sections.map((s) => `- ${s.title}`).join('\n');

  return `You are a deep research agent. Your job is to thoroughly research the assigned topic and write a comprehensive, well-sourced document.

## Your Assignment
Research Topic: "${session.question}"
Your Workstream: "${agent.name}"

## Sections to Cover
${sectionList}

Tavily web search and information gathering tools are available (tavily-ai-skills).
Use them strategically to find high-quality information. Here are the key skills at your disposal:

*search* - Search the web using Tavily's API
- Returns relevant results with content snippets, scores, and metadata
- Best for finding web content on any topic
- No coding required

*research* - AI-synthesized research on any topic
- Provides comprehensive results with citations
- Supports structured JSON output for pipelines
- Grounded in web data
- Best for deep-dive research questions

*extract* - Extract content from specific URLs
- Returns clean markdown/text from web pages
- Use when you have specific URLs and need their content
- Better than search when you know exactly where to look

*crawl* - Crawl websites and save as local markdown
- Download documentation, knowledge bases, or web content
- Saves pages locally for offline access or analysis
- Best for systematically capturing entire websites

*tavily-best-practices* - Production-ready Tavily integration guide
- Reference for building agentic workflows, RAG systems, or autonomous agents
- Best practices for web search, extraction, crawling, and research

## CRITICAL: Write Protocol
You MUST follow this strict alternating pattern:
1. Search for information (web search using Tavily skill, read sources)
2. IMMEDIATELY write findings to your output file
3. Search again
4. IMMEDIATELY write again

NEVER do two searches in a row without writing. After every single search, write what you found to the file. This prevents you from losing information and getting stuck in loops.

## Output Requirements
- Write in markdown format
- Cover each assigned section thoroughly
- Cite every claim with an inline URL: [Source Title](url)
- Use ## headers for each section
- Be comprehensive — aim for 400+ lines of deeply sourced content
- Include specific data, studies, and expert opinions where available

## File Management
- Your output file has been pre-created with section headers
- Write your findings section by section, in order
- After each section is complete, move to the next
- When ALL sections are complete, add this exact line at the very end:

Status: COMPLETE

## Quality Standards
- Every factual claim must have an inline citation
- Prefer primary sources (academic papers, official reports) over secondary
- Note when evidence is conflicting or uncertain
- Include practical implications, not just theory`;
}

/**
 * Build the task prompt for a research agent.
 */
export function buildAgentTaskPrompt(agent: ResearchAgent, outputPath: string): string {
  return `Research and write about "${agent.name}".

Your output file is: ${outputPath}

Work through each section in order. Remember: search → write → search → write. Never do two searches without writing.

Start by reading the skeleton file to see your section headers, then begin researching and writing Section 1.`;
}

/**
 * Build the skeleton markdown file for a research agent.
 */
export function buildSkeletonFile(agent: ResearchAgent, session: ResearchSession): string {
  const header = `# ${agent.name}\n\n> Research workstream for: ${session.question}\n\n`;
  const sections = agent.sections
    .map((s) => `## ${s.title}\n\n*Research pending...*\n`)
    .join('\n');
  return header + sections;
}

/**
 * Build the synthesis agent prompt.
 */
export function buildSynthesisPrompt(session: ResearchSession, agentOutputs: string[]): string {
  const outputList = agentOutputs
    .map((content, i) => {
      const agent = session.agents[i];
      return `--- Agent ${agent.id}: ${agent.name} ---\n\n${content}`;
    })
    .join('\n\n');

  return `You are a research synthesis specialist. Multiple research agents have independently investigated different aspects of the following question:

"${session.question}"

Below are their complete research outputs. Your job is to produce a unified synthesis document.

## Research Outputs

${outputList}

## Your Task

Create a synthesis document with these sections:

### Executive Summary
3-5 bullet points capturing the most important findings across all research.

### Key Findings by Theme
Organize findings by cross-cutting themes (NOT by agent). Identify patterns that span multiple workstreams.

### Contradictions & Tensions
Where do the research streams disagree or present tensions? Note specific claims that conflict.

### Confidence Assessment
Rate the confidence level of key findings:
- **Well-supported**: Multiple independent sources, strong evidence
- **Moderate**: Some evidence, but limited sources or scope
- **Speculative**: Limited evidence, primarily theoretical or anecdotal

### Recommended Next Steps
Actionable recommendations based on the research. What should someone do with this information?

## Output Requirements
- Write in markdown format
- Cite sources using inline URLs from the original research
- Be specific and concrete — avoid generic advice
- Aim for a comprehensive document (300+ lines)
- Write to the synthesis output file

When done, add this exact line at the very end:

Status: COMPLETE`;
}
