# ESP32-S3 智能环境监测助手 - 微信小程序 v2

## 导入步骤

1. 解压 `miniprogram.zip`
2. 打开「微信开发者工具」
3. 点击「导入项目」
4. 选择解压后的 `miniprogram` 文件夹（根目录有 app.json）
5. AppID 选「测试号」或填你自己的
6. 点击「确定」

## 启动后端

```bash
cd miniprogram
npm install express ws
npx tsx server.ts
```

看到 `http://localhost:3000` 表示启动成功。

## 修改服务器地址

打开 `pages/index/index.js`，第 1 行改成你的电脑 IP：

```javascript
const S = 'http://192.168.1.100:3000';
```

查 IP：`ipconfig`（Windows）或 `ifconfig`（Mac）

同样修改 `pages/history/history.js` 第 1 行。
