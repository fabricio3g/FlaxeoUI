# Recipes

A **recipe** is a full look: prompts plus generation settings (and model hints), not just saved prompt text.

## Use a recipe

1. Open **Image**.
2. Open the **Recipes** control near the prompt.
3. Pick a built-in or saved recipe → **Apply** (settings only) or **Apply & keep editing**.

Built-ins are starting points; change anything after apply.

## Save a recipe

1. Dial in models, size, steps, prompt, etc.
2. Open Recipes → name it → **Save current**.
3. Recipes are stored locally in the app.

## Share

- **Export** writes a `.flaxeo-recipe.json` file you can send offline.
- **Import** loads a recipe file into your library.

See also [community.md](./community.md) and `docs/schemas/recipe.schema.json`.

## Prompt presets vs recipes

|          | Prompt presets           | Recipes                        |
| -------- | ------------------------ | ------------------------------ |
| Stores   | Positive / negative text | Full config snapshot + prompts |
| Best for | Reusing wording          | Reusing a whole look           |

## Built-in families

Search in Recipes by tag:

- **surface** — base color, roughness look, normal style, tileable
- **object** / **icon** — hero props, solid-bg icons
- **wide** / **tall** / **illustration** / **interface** — frames and mocks
- **mood** / **batch** — multi-seed cohesive sets

Map-style recipes are **looks** for iteration, not authored PBR channel bakes.
