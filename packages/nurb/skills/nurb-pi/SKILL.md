---
name: nurb-pi
description: Design, build, and iterate on 3D-printable parts with nurb (agentic CAD). Use when designing or modeling a part for 3D printing, or when the user mentions nurb.
---

# Working with nurb

nurb is an agentic CAD tool. Parts are Python files in `parts/`; nurb builds, checks, and exports them.

## 1. Start the viewer first

Call `nurb_serve`. It returns a URL; share it with the user so they can watch the parts update live. The server is managed by @aliou/pi-processes, so keep designing instead of babysitting it.

## 2. The loop

1. `nurb_new <name>` creates `parts/<name>.py` plus its card `parts/<name>.md`.
2. Edit `parts/<name>.py` with the normal file tools.
3. `nurb_build` builds once; `nurb_check` runs the printability rules.
4. `nurb_export` writes the printable files to `build/`.

## 3. Look at the geometry

Call `nurb_render <name>`, then read the PNG at the returned absolute path to actually see the part. Renders settle questions that numbers cannot.

## 4. Doctrine and vocabulary

- Design judgment questions: call `nurb_rules` and follow it.
- API vocabulary questions: call `nurb_api`.

Never paraphrase either. Their output is the single source of truth and lives in the nurb package; point at it instead of restating it.

## 5. Beyond the tools

Anything the tools do not wrap (slice, stress, extract, card, diff, update, launcher, skill) is one bash call to the plain `nurb` CLI away.

## 6. Parameters

- Keyword arguments are the part's parameters; include every meaningful dimension.
- Use measured dimensions over invented ones. Measure the real thing (`nurb_scan` reads a mesh) before guessing a number.
