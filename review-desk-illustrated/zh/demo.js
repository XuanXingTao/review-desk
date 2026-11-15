'use strict';

// The fixtures describe a fictional palette tool. Review anchors address the bundled originals.
window.demoProject = () => ({
  id: 'palette-demo', name: '拾色工具 · 发布验收', revision: 0,
  criteria: [
    { id: 'colors', title: '首页展示色板及 HEX 色值', detail: '打开首页即可读出五个颜色的十六进制值。', status: 'pending', note: '', evidence: [
      {id: 'palette-home', kind: 'image', name: '首页截图.png', path: 'assets/palette.png', x: 50, y: 76, caption: '中间的橙色色块标有 #F29D55，其余四个色值也在同一行。'}
    ]},
    { id: 'copy', title: '复制色值后显示确认提示', detail: '点击色块后，界面要告诉用户复制的是哪个值。', status: 'pending', note: '', evidence: [
      {id: 'palette-clip', kind: 'video', name: '复制色值演示.webm', path: 'assets/copy.webm', time: 1.5, caption: '查看点击第三个色块后出现的提示。'}
    ]},
    { id: 'guide', title: '说明文档包含键盘操作方式', detail: '文档需要写明切换色块和复制色值的按键。', status: 'pass', note: '第 2 段列出了 Tab 和 Enter。', evidence: [
      {id: 'palette-guide', kind: 'text', name: '使用说明.md', text: '拾色使用说明\n\n按 Tab 切换到下一个色块，再按 Enter 复制当前 HEX 色值。\n\n也可以直接点击色块，复制成功后会在色板上方看到确认提示。', paragraph: 2, caption: '键盘操作说明'}
    ]}
  ]
});
