# MCP Column Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the MCP list name, transport, and enabled-status columns shrink to content with maximum widths and ellipsis for long text.

**Architecture:** Keep the existing table structure and only adjust the first three columns' layout hints plus the text and pill wrapper styling. Preserve current row click, action buttons, and sticky operation column behavior.

**Tech Stack:** React, TypeScript, Vite, CSS

---

### Task 1: MCP 列表前三列收窄

**Files:**
- Modify: `app-v2/src/pages/ServersPage.tsx`
- Modify: `app-v2/src/styles/ui.css`
- Reference: `docs/superpowers/specs/2026-03-21-mcp-name-column-width-design.md`

- [ ] **Step 1: Add content wrappers for shrinkable cells**

Wrap the rendered MCP name and pill labels in dedicated elements that can ellipsize and expose the full value with `title`.

- [ ] **Step 2: Hint the first three table columns to auto-fit**

Apply a dedicated class to the first three column headers and cells so the browser prefers a narrow content-driven width.

- [ ] **Step 3: Add maximum width and ellipsis styling**

Limit the visible name and pill label widths with CSS and reuse the existing single-line ellipsis behavior.

- [ ] **Step 4: Build to verify**

Run: `cd "/home/ricardo/projects/AIDevHub/app-v2" && npm run build`
Expected: build exits with code `0`
