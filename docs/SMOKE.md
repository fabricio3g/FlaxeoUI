# Flaxeo Image smoke checklist (release)

Run before tagging a release. Goal: cold install feels trustworthy.

## Environment

- [ ] Clean or typical Windows machine with a real GPU if possible
- [ ] Build: `npm run typecheck && npm test && npm run lint:ci`
- [ ] App: `npm run dev` or packaged installer

## First run / onboarding

- [ ] Setup wizard opens when needed
- [ ] Install / select backend (sd-cli present, Settings shows valid)
- [ ] Model step shows a GPU-based pack recommendation (or safe SDXL default)
- [ ] Optional **Low VRAM** checkbox applies hardware profile
- [ ] Download or confirm a starter pack; required files show **On disk** in Hub
- [ ] Finish step shows checklist + **Generate sample** / Start generating / Open Model Hub
- [ ] **Generate sample** lands on Text2Image with a starter prompt
- [ ] Skip path: onboarding strip appears until first image; dismiss works for session
- [ ] First successful T2I completes checklist (first image ✓)

## Generation spine

- [ ] Progress chip advances through load phases (not stuck on generic text only)
- [ ] Cancel mid-load works (exit cancelled, UI unlocks)
- [ ] Failed gen shows human message + **Open logs**
- [ ] Second concurrent gen is **queued** (not rejected); Queue badge increments
- [ ] Queue panel: reorder / remove pending; pause; cancel current starts next
- [ ] History records success; **Re-run** restores seed/settings

## Modes

- [ ] **CLI mode** default T2I works
- [ ] **Server mode**: start server; simple T2I works; batch/edit falls back or warns
- [ ] Edit: at least one of Inpaint / Img2Img / Ref
- [ ] Gallery: open image, reuse params, upscale if model present
- [ ] Live preview (if TAESD / method set): frames update without crash

## Help & recipes (0.7)

- [ ] Sidebar **Help** opens offline guide; search filters topics
- [ ] Deep link / topic switch: Recipes, Queue, Getting started
- [ ] Text2Image **Recipes**: apply built-in; save current; export/import JSON
- [ ] Queue panel **?** opens Help · Queue

## Polish (0.7.1)

- [ ] **Try sample** / **Generate sample** fills Image prompt (even if already on Image)
- [ ] Finish setup closes wizard (including `npm run dev`)
- [ ] **History** float from command strip: scroll, remove, re-run, clear
- [ ] Gallery history icon opens the same float panel (no strip)
- [ ] Recipes vs Prompt presets: different icons; only in composer (not duplicated in quick tools)
- [ ] Recipes list readable (larger type)

## Polish

- [ ] Icon buttons: no sticky border on click
- [ ] Progress chip: no heavy drop shadow
- [ ] Preview area large enough for 1024-class images

## Ship

- [ ] CHANGELOG section for this version
- [ ] `package.json` version matches tag
- [ ] CI green on main
