# Proxima

Proxima 用一个更现代、更清晰的 popup，替代浏览器自带的代理设置界面。Firefox 优先，Chrome 兼容。

它不是代理客户端：不转发流量、不提供订阅、不测速，只负责配置浏览器的原生代理。

## 亮点

- **状态一目了然**：打开 popup 就能看到浏览器当前真正生效的配置，以及它由谁控制：Proxima、其他扩展还是系统策略。
- **常用操作优先**：直连、手动代理和主机/端口都在一屏内，应用按钮固定在底部。
- **复杂设置不打扰**：只展开当前模式需要的字段；HTTPS 单独代理、绕过列表、认证选项收进「高级设置」。

## 功能

- 五种连接方式：直连、手动代理、跟随系统、自动配置（PAC 地址）、自动检测（WPAD）。
- 手动模式支持 HTTP、HTTPS、SOCKS4、SOCKS5，可为 HTTPS 单独指定代理，也可让 HTTP 代理同时用于 HTTPS。
- 绕过列表、SOCKS 代理 DNS（Firefox）、已保存密码不提示认证（Firefox）。
- 应用前校验，应用后回读浏览器状态；失败时会说明原因并保留你的编辑。
- Firefox 隐私窗口权限、系统策略、其他扩展占用代理时都有明确提示。
- 未应用的修改会自动保存在本机，下次打开可以继续或丢弃。
- 中文 / 英文界面，跟随浏览器语言；自动适配浅色 / 深色主题。

## 安装

当前版本通过源码构建安装，需要 Node.js 20 或更高版本。

```sh
npm install
npm run build:firefox
npm run build:chrome
```

**Firefox**

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击「临时载入附加组件」，选择 `.output/firefox-mv3/manifest.json`。
3. 首次打开 popup 时，按页面提示允许 Proxima 在隐私窗口运行（原因见下）。

**Chrome**

1. 打开 `chrome://extensions`，开启右上角的开发者模式。
2. 点击「加载已解压的扩展程序」，选择 `.output/chrome-mv3`。

## 使用

- 点击工具栏上的 Proxima 图标打开 popup。
- 选择一种连接方式；需要手动配置时，填写 HTTP 或 SOCKS 主机与端口。
- 修改后点击「应用更改」，或在输入框中按 Enter。
- 顶部状态卡显示浏览器当前配置；右侧的刷新按钮可以重新读取。
- 直接关闭 popup 不会丢失未应用的编辑，下次打开会提示恢复。
- 使用 PAC 时填写一个 http(s) 地址；扩展不会替代浏览器加载 PAC 文件。

## Firefox 隐私窗口权限

Firefox 要求扩展**允许在隐私窗口运行**后，才能修改全局代理设置——即使你从不使用隐私窗口。

1. 打开 `about:addons`。
2. 选择 Proxima，进入「详情」。
3. 打开「允许在隐私窗口运行」并选择允许。
4. 回到 popup，点击「重新检测」。

这是 Firefox 的限制，不是 Proxima 的额外要求。

## 权限与隐私

- 只申请「控制浏览器代理设置」这一项权限。
- 不读取网页内容，不发起网络请求，不收集统计数据。
- 不保存代理用户名、密码或浏览记录；未应用的草稿只保存在本机浏览器中。
- PAC 文件由浏览器自行加载。

## 已知限制

- 不做配置方案、分组、按域名分流、订阅导入或测速。
- 不管理代理账号密码，认证交给浏览器处理。
- 不支持 Firefox 的「系统 Web Proxy 自动发现」模式；如果当前是这一模式，Proxima 会提示你先在 Firefox 设置中切换。
- 不支持 Chrome 的内联 PAC 脚本：PAC 只支持填写 http(s) 地址，也不能强制刷新。
- 同时配置 HTTP 与 SOCKS 属于高级用法，Chrome 与 Firefox 对未单独指定协议的请求处理可能略有差异。
- Firefox 对 IPv6 代理主机 + 端口的支持不完整，可能只能使用默认端口。
- 不提供 FTP 代理。
- 仅支持桌面版 Firefox 和 Chrome；Firefox for Android 不支持修改代理。
- 界面目前只有中文和英文，没有应用内语言切换。

## License

MIT © 2026 chenxu. 见 [LICENSE](LICENSE)。

Proxima 是独立项目，与 Mozilla 或 Google 无关联。
