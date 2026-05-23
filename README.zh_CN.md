# App Tabs（应用标签页）

[English](README.md)

**面板模式** — 标签显示在顶栏：

![](assets/external/img.png)

**独立模式** — 浮动标签栏，可拖放到屏幕任意位置（可选隐藏顶栏）：

![](assets/external/img2.png)

## 简介

**App Tabs** 是一款 GNOME Shell 扩展，为当前聚焦的应用按窗口显示标签页。可在顶栏或独立浮动条之间切换，快速切换、关闭和管理窗口。

## 安装

克隆本仓库并复制到 `~/.local/share/gnome-shell/extensions/`，然后在「扩展」应用中启用，或执行：

```bash
gnome-extensions enable huanghaohhoa-dev@163.com
glib-compile-schemas schemas/
# Alt+F2 → r  重载 Shell，或注销后重新登录
```

## 显示模式

| 模式 | 说明 |
|------|------|
| **面板（Panel）** | 标签显示在 GNOME 顶栏，与其他面板项并列。 |
| **独立（Standalone）** | 标签移到可拖动的浮动条上，可放在屏幕任意位置。 |

- **默认显示模式** — 在扩展设置中选择面板或独立。
- **模式切换按钮** — 左键点击在面板 / 独立之间临时切换；右键可固定当前应用始终使用面板或独立模式。
- **独立模式下隐藏顶栏** — 顶栏向上滑出隐藏（效果类似 Hide Top Bar），仅保留浮动标签条。
- **显示模式过渡动画** — 可开关淡入淡出与顶栏滑动；时长可在 0–2000 毫秒间调节。

## 设置

打开 **扩展 → Application Tabs Dev → 设置**。

- **面板最大宽度**、**长标题省略**、**仅显示当前工作区的标签**
- **新建标签**、**最近窗口** 按钮的显示开关
- **标签样式** — 通过 JSON 配置默认 / 激活 / 悬停样式，以及浅色、深色主题：

```json5
{
  "icon-size": 18,
  "default": {
    "default_style": {},
    "active_style": {},
    "hover_style": {}
  },
  "light_mode": {
    "default_style": {},
    "active_style": {},
    "hover_style": {}
  },
  "dark_mode": {
    "default_style": {},
    "active_style": {},
    "hover_style": {}
  }
}
```

- **固定独立模式应用** / **固定面板模式应用** — 为指定应用始终使用某一种显示模式

## 功能

1. 以标签形式展示当前应用已打开的窗口。
2. 点击标签聚焦对应窗口；再次点击当前标签可最小化窗口。
3. 每个标签有关闭按钮；右键打开窗口菜单（固定、最大化、工作区等）。
4. 拖拽标签调整顺序，按应用分别记忆。
5. 支持 **面板** 与 **独立** 两种显示模式，并可选过渡动画。
6. **最近窗口** 菜单：恢复已关闭窗口，或快速切换到其他应用的窗口。
7. **新建标签** 在应用支持时打开新窗口。

如有问题或功能建议，欢迎在仓库提交 Issue。

## 推荐搭配

[CoverflowAltTab](https://github.com/dsheeler/CoverflowAltTab)：将 **Alt+Tab** 绑定为切换应用、**Alt+Grave（Alt+`）** 绑定为切换窗口，与 App Tabs 配合效果很好。

## 调试

查看 GNOME Shell 日志：

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

GNOME Shell 48（嵌套会话）：

```bash
export MUTTER_DEBUG_DUMMY_MODE_SPECS=1366x768
dbus-run-session -- gnome-shell --nested --wayland
```

GNOME Shell 49+（devkit）：

```bash
export G_MESSAGES_DEBUG=all
export MUTTER_DEBUG_DUMMY_MODE_SPECS=1366x768
export SHELL_DEBUG=all
command -V mutter-devkit || sudo apt install mutter-dev-bin
dbus-run-session gnome-shell --devkit --wayland
```

扩展设置界面：

```bash
journalctl -f -o cat /usr/bin/gjs
gnome-extensions prefs huanghaohhoa-dev@163.com
```

运行测试：

```bash
bash scripts/check.sh
```

## 开发文档

- https://gjs-docs.gnome.org/
- https://gjs.guide/guides/
