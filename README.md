# MapLab 专题地图实验室

在现有深蓝色界面基础上迭代的省级专题地图课堂原型。技术栈为 HTML、CSS、JavaScript、Leaflet 和 ECharts。

## 运行

### 单文件演示

双击 `outputs/MapLab.html`。样式、统计数据、行政区 GeoJSON 和应用代码内嵌在该文件，不需要本地服务器；Leaflet、ECharts 和 html2canvas 仍需联网加载。

### 项目开发模式

1. 双击 `start-maplab.cmd`，保持命令窗口打开。
2. 浏览器访问 `http://localhost:8000`。
3. `index.html` 会加载 `style.css`、`app.js`；JSON 可放在 `assets/` 目录，也兼容仓库根目录。

## 目录

- `index.html`：项目模式主页面及地图工具控件。
- `style.css`：深蓝色科技风布局及图层/图例/对照样式。
- `app.js`：数据读取、地图表现、搜索、排名、图表、对照与导出交互。
- `assets/data.json`：附件提供的 2024 年 31 省数据、单位、来源说明、核验状态和 6 位省级行政区划代码；含陆地面积与人口密度。
- `assets/china.json`：省级行政区 GeoJSON，随站点部署，不依赖访客能否连接第三方边界服务器。应用也兼容把 `data.json` 与 `china.json` 放在仓库根目录。
- `outputs/MapLab.html`：内嵌 CSS、数据与 JavaScript 的直接打开版。
- `scripts/build-single.cjs`：从项目源码重建单档版。
- `tests/smoke-maplab.cjs`：不依赖第三方测试框架的交互冒烟测试。
- `server.js` / `start-maplab.cmd`：项目模式本地静态服务器。

## 地图功能

- 保留中国省级地图缩放、平移、复位、比例尺、行政区边界和城市点位开关。
- GDP、常住人口、人口密度、城镇化率主题；按行政区划代码关联边界和统计记录。
- 分级设色图与比例符号图切换。比例符号的圆面积按数值比例缩放。
- 深海蓝、青绿、琥珀色带及色带反转；分位数/等间距分级、3–7 级调整。
- 图例显示每个等级的闭开区间、单位和分级方法；数据缺失时明确显示。
- 点击省份查看年份、数值、单位、来源、统计口径及核验状态；排名可点击定位并同步突出图表。
- 省份简称/全称搜索、地图全屏、同一指标分级设色与比例符号并排对照、PNG 导出。
- 地图知识卡解释分级设色图、比例符号、分位数和等间距方法。

- 附件数据说明：用户说明数据依据各省（自治区、直辖市）2024 年国民经济和社会发展统计公报、国家统计局；面积采用统计年鉴通用标准陆地面积。该来源说明已写入 JSON 元数据。
- GDP：亿元；年末常住人口：万人；城镇化率：%；陆地面积：km²；人口密度：人/km²。31 条记录按 6 位行政区划代码与 GeoJSON 关联。
- 人口密度直接使用附件给定值，不再用简化 GeoJSON 面积覆盖。附件密度与所列人口及陆地面积的整数计算值一致（31/31）。
- 核验限制：附件未附 31 份公报/年鉴的逐省链接或页码，故数据元信息明确标记“来源说明由用户提供，未逐项核对原始统计公报及后续修订”。国家统计局说明地区 GDP 采用统一核算方式，见[地区生产总值核算方法](https://www.stats.gov.cn/zs/tjws/zytjzbqs/gnsczz/202412/t20241220_1957809.html)。国家统计局后续发布了[2024 年 GDP 最终核实公告](https://www.stats.gov.cn/xxgk/sjfb/zxfb2020/202512/t20251226_1962144.html)，课程展示时应留意与附件所依据的公报数值可能存在统计修订差异。
- 省界：随项目提供的 `assets/china.json`，源自 [DataV 行政区划 GeoJSON 镜像](https://github.com/NetworkSecurityVision/geojson-china/blob/master/data/100000_full.json)，通过 `adcode` 与统计数据关联。文件内 35 个边界要素中，31 个与项目的 31 个省级统计代码实际匹配。公开部署前仍应检查数据许可和版本。

软件展示附件数据及其来源说明，不将其表述为已逐省独立核验的官方最终值；不对缺值补造数据。

## 测试

在项目根目录运行：

```text
node --check app.js
node --check tests/smoke-maplab.cjs
node tests/smoke-maplab.cjs
$env:ROOT_JSON="1"
node tests/smoke-maplab.cjs
Remove-Item Env:ROOT_JSON
$env:FAIL_BOUNDARY="1"
node tests/smoke-maplab.cjs
Remove-Item Env:FAIL_BOUNDARY
node scripts/build-single.cjs
```

冒烟测试读取项目实际省级 GeoJSON 几何，验证 31 个行政区代码关联、原有专题切换/排名/图表/省份弹窗、分级区间、色带反转、比例符号、全称搜索、表达对照及 PNG 导出按钮调用。数据结构另行验证年份、单位、来源、核验状态和代码唯一性。

另有失败路径测试会模拟边界网络不可达，确认排名和图表仍正常显示。GeoJSON 现已本地打包，Leaflet、ECharts 与 html2canvas 仍从 CDN 加载；若访客网络屏蔽 CDN，仍需将这些库也改为本地资源。发布 GitHub Pages 时务必一并上传 `index.html`、`style.css`、`app.js`、整个 `assets/` 目录（尤其是 `china.json`）及 `outputs/MapLab.html`。





