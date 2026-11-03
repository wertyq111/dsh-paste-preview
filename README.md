# dsh-paste-preview

[简体中文](./README.zh-CN.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) web plugin that makes pasted images usable with **text-only models**, without losing the visual preview.

## What it does

- **Paste → thumbnail.** Pasting an image into the composer shows a thumbnail in the attachment rail (click to zoom) instead of inserting a file path.
- **Text-only models still get the image.** When the selected model does not accept image input, the image is re-wrapped as a plain file attachment. dsh stores it and hands the model a read-only path, so tools such as `modlens_read_image` can read it. Vision-capable models keep dsh's native image path.
- **Thumbnails in sent messages.** Images that went through the file path render as zoomable thumbnails in the conversation history, including after a reload.
- Drag-and-drop and images added from the file picker are rerouted the same way.

## Install

```bash
dsh plugin add dsh-paste-preview
```

Restart dsh afterwards.

### Using it together with @liustack/modlens

modlens has its own paste-to-path feature that intercepts pastes first. Turn it off in your profile's `cordis.patch.yml`:

```yaml
- id: modlens
  config:
    pasteToPath: false
```

This is not shipped in the plugin's own patch on purpose: a patch that targets a missing entry id makes dsh fail at startup for anyone without modlens.

## How it decides

The browser asks `GET /dsh-paste-preview/verdict?model=<selector label>`. The host answers `takeover: true` only when every model whose name or id appears in the label declares text-only input. modlens' own "(modlens vision)" wrappers are ignored so they cannot veto the model they wrap. Unknown or unresolvable models answer `false`, which keeps the native behaviour.

Session-aware composers (including DS Bot) use the session's `modelSelection` projection and pass the exact provider/model route to the host. The host resolves that route's real input modalities, so a hidden model selector and vision twins on other providers cannot change the decision. Older composers can still use the selector-label query. The attachment rail is absent for empty drafts and stays above the editor in DS Bot's wrapping layout.

## HTTP routes

| Route | Purpose |
|---|---|
| `GET /dsh-paste-preview/verdict` | Whether pastes for the current model should be rerouted |
| `GET /dsh-paste-preview/file` | Reads back a stored image attachment for thumbnails (sha256 id, png/jpg/webp/gif only, ≤ 32 MB) |
| `GET /dsh-paste-preview/debug` | Lists providers, models and their input modalities |

All routes go through dsh's `connection.requestRejection` check and answer `401` to unauthenticated requests. Stored files are read through the dsh attachment store, which re-verifies the name, size and digest.

## Limitations

- Sent-message thumbnails are attached to dsh's built-in file cards, which expose no public slot. The attachment reference is read from the rendered component's props. If a future dsh release changes that structure, the plain file card is shown instead; nothing breaks.
- Right after sending, before the message is persisted, the plain card may show briefly.

## Development

```bash
pnpm install
pnpm test
```

## License

MIT
