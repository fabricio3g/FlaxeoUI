# FlaxeoUI smoke checklist (release)

Run before tagging a release. Goal: cold install feels trustworthy.

## Environment

- [ ] Clean or typical Windows machine with a real GPU if possible
- [ ] Build: `npm run typecheck && npm test && npm run lint:ci`
- [ ] App: `npm run dev` or packaged installer

## First run

- [ ] Setup wizard opens when needed
- [ ] Install / select backend (sd-cli present, Settings shows valid)
- [ ] Download or confirm a Model Hub pack; required files show **On disk**
- [ ] Finish step shows checklist (backend / models / first image)
- [ ] Generate once in Text2Image with default pack settings

## Generation spine

- [ ] Progress chip advances through load phases (not stuck on generic text only)
- [ ] Cancel mid-load works (exit cancelled, UI unlocks)
- [ ] Failed gen shows human message + **Open logs**
- [ ] Second concurrent gen is blocked (busy toast / 409)
- [ ] History records success; **Re-run** restores seed/settings

## Modes

- [ ] **CLI mode** default T2I works
- [ ] **Server mode**: start server; simple T2I works; batch/edit falls back or warns
- [ ] Edit: at least one of Inpaint / Img2Img / Ref
- [ ] Gallery: open image, reuse params, upscale if model present
- [ ] Live preview (if TAESD / method set): frames update without crash

## Polish

- [ ] Icon buttons: no sticky border on click
- [ ] Progress chip: no heavy drop shadow
- [ ] Preview area large enough for 1024-class images

## Ship

- [ ] CHANGELOG section for this version
- [ ] `package.json` version matches tag
- [ ] CI green on main
