# dsh-paste-preview

[English](./README.md)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）Web 插件：让**纯文本模型**也能用粘贴的图片，同时保留缩略图预览。

## 功能

- **粘贴即缩略图**：在输入框粘贴图片，附件栏显示缩略图（点击放大），不再插入文件路径文本。
- **纯文本模型也能拿到图**：当前模型不支持图片输入时，图片会改为普通文件附件。dsh 保存后把只读路径交给模型，可配合 `modlens_read_image` 等工具读图。支持图片的模型仍走 dsh 原生图片通道。
- **已发送消息显示缩略图**：走文件通道的图片在对话记录中显示为可放大的缩略图，刷新页面后依然有效。
- 拖放和文件选择器加入的图片同样会改道。

## 安装

```bash
dsh plugin add dsh-paste-preview
```

安装后重启 dsh。

### 与 @liustack/modlens 一起使用

modlens 自带的 paste-to-path 会先拦截粘贴，需要在 profile 的 `cordis.patch.yml` 中关闭：

```yaml
- id: modlens
  config:
    pasteToPath: false
```

插件没有把这段放进自带的 patch：patch 指向不存在的 entry id 时 dsh 会启动报错，没装 modlens 的用户会受影响。

## 判定逻辑

浏览器请求 `GET /dsh-paste-preview/verdict?model=<模型选择器标签>`。只有标签中出现的所有模型都明确声明为纯文本输入时，服务端才返回 `takeover: true`。modlens 自己注册的"(modlens vision)"包装模型会被忽略，避免它否决被包装的模型。模型未知或无法解析时返回 `false`，保持原生行为。

## HTTP 路由

| 路由 | 用途 |
|---|---|
| `GET /dsh-paste-preview/verdict` | 当前模型的粘贴是否需要改道 |
| `GET /dsh-paste-preview/file` | 读回已保存的图片附件用于缩略图（仅 sha256 id、png/jpg/webp/gif，≤ 32 MB） |
| `GET /dsh-paste-preview/debug` | 列出 provider、模型及其输入模态 |

所有路由都经过 dsh 的 `connection.requestRejection` 鉴权，未登录请求返回 `401`。文件经 dsh 附件存储读取，会再次校验文件名、大小和摘要。

## 已知限制

- 已发送消息的缩略图挂在 dsh 内置的文件卡片上，该卡片没有公开 slot，附件引用从渲染组件的 props 中读取。dsh 后续版本若改动该结构，会退回显示普通文件卡片，不会报错。
- 刚发送、消息尚未持久化的一瞬间，可能先显示普通卡片。

## 开发

```bash
pnpm install
pnpm test
```

## 许可证

MIT
